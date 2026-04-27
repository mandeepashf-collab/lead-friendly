// src/lib/dashboard/activity.ts
//
// Stage 3.6.4 — Activity pulse feed data layer.
// Pulls last 50 events across calls / appointments / contacts / opportunities
// in the last 7 days. Server-side; called from /api/dashboard/activity.
//
// Avoids Supabase nested selects so PostgREST doesn't redundantly evaluate
// is_org_in_scope() on joined tables. Instead: 4 parallel main queries +
// up to 3 batched .in('id', ids) lookups for contact / agent / stage names.

import type { SupabaseClient } from "@supabase/supabase-js";

export type ActivityEventType = "call" | "appointment" | "contact" | "opportunity";

export type ActivityDotToken =
  | "amber-ai"
  | "slate-400"
  | "pink"
  | "won"
  | "lost"
  | "warm";

export interface ActivityEvent {
  id: string;
  type: ActivityEventType;
  ts: string;
  headline: string;
  dotToken: ActivityDotToken;
  href?: string;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const PER_TABLE_LIMIT = 50;
const FEED_LIMIT = 50;

interface CallRow {
  id: string;
  created_at: string;
  duration_seconds: number | null;
  status: string | null;
  ai_agent_id: string | null;
  contact_id: string | null;
}

interface ApptRow {
  id: string;
  created_at: string;
  appointment_date: string | null;
  start_time: string | null;
  booked_by: string | null;
  ai_agent_id: string | null;
  contact_id: string | null;
}

interface ContactRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  created_at: string;
}

interface OppRow {
  id: string;
  created_at: string;
  name: string | null;
  value: number | null;
  stage_id: string | null;
  contact_id: string | null;
}

function formatDuration(sec: number | null | undefined): string {
  const n = Number(sec) || 0;
  if (n < 60) return `${n}s`;
  if (n < 3600) {
    const m = Math.floor(n / 60);
    const s = n % 60;
    return s === 0 ? `${m}m` : `${m}m ${s}s`;
  }
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function formatValue(v: number | null | undefined): string {
  const n = Number(v) || 0;
  if (n === 0) return "$0";
  if (Math.abs(n) < 1000) return `$${Math.round(n)}`;
  if (Math.abs(n) < 1_000_000) {
    const k = n / 1000;
    return `$${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}K`;
  }
  return `$${(n / 1_000_000).toFixed(1)}M`;
}

function localDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatWhen(date: string | null, time: string | null): string {
  if (!date) return "TBD";
  // appointment_date is a YYYY-MM-DD date string (no TZ); construct local.
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return "TBD";
  const apptDate = new Date(y, m - 1, d);
  apptDate.setHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((apptDate.getTime() - today.getTime()) / 86_400_000);

  const t = (time ?? "").slice(0, 5);
  const timePart = t ? ` ${t}` : "";

  if (diffDays === 0) return `today${timePart}`;
  if (diffDays > 0 && diffDays <= 6) return `${WEEKDAY_NAMES[apptDate.getDay()]}${timePart}`;
  return `${MONTH_NAMES[apptDate.getMonth()]} ${apptDate.getDate()}${timePart}`;
}

function contactName(c: ContactRow | undefined): string {
  if (!c) return "Unknown contact";
  const first = (c.first_name ?? "").trim();
  const last = (c.last_name ?? "").trim();
  const full = `${first} ${last}`.trim();
  if (full) return full;
  if (c.phone) return c.phone;
  return "Unknown contact";
}

function capitalizeAgent(name: string | null | undefined): string {
  if (!name) return "An agent";
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export async function fetchActivityFeed(
  supabase: SupabaseClient,
  orgId: string,
): Promise<ActivityEvent[]> {
  if (!orgId) return [];

  const sevenDaysAgoIso = new Date(Date.now() - SEVEN_DAYS_MS).toISOString();

  const [callsRes, apptsRes, contactsRes, oppsRes] = await Promise.all([
    supabase
      .from("calls")
      .select("id, created_at, duration_seconds, status, ai_agent_id, contact_id")
      .eq("organization_id", orgId)
      .gte("created_at", sevenDaysAgoIso)
      .order("created_at", { ascending: false })
      .limit(PER_TABLE_LIMIT),

    supabase
      .from("appointments")
      .select("id, created_at, appointment_date, start_time, booked_by, ai_agent_id, contact_id")
      .eq("organization_id", orgId)
      .gte("created_at", sevenDaysAgoIso)
      .order("created_at", { ascending: false })
      .limit(PER_TABLE_LIMIT),

    supabase
      .from("contacts")
      .select("id, first_name, last_name, phone, created_at")
      .eq("organization_id", orgId)
      .gte("created_at", sevenDaysAgoIso)
      .order("created_at", { ascending: false })
      .limit(PER_TABLE_LIMIT),

    supabase
      .from("opportunities")
      .select("id, created_at, name, value, stage_id, contact_id")
      .eq("organization_id", orgId)
      .gte("created_at", sevenDaysAgoIso)
      .order("created_at", { ascending: false })
      .limit(PER_TABLE_LIMIT),
  ]);

  const calls = (callsRes.data ?? []) as CallRow[];
  const appts = (apptsRes.data ?? []) as ApptRow[];
  const contactsCreated = (contactsRes.data ?? []) as ContactRow[];
  const opps = (oppsRes.data ?? []) as OppRow[];

  // Collect unique ids for batched lookups
  const contactIds = new Set<string>();
  for (const c of calls) if (c.contact_id) contactIds.add(c.contact_id);
  for (const a of appts) if (a.contact_id) contactIds.add(a.contact_id);
  for (const o of opps) if (o.contact_id) contactIds.add(o.contact_id);

  const agentIds = new Set<string>();
  for (const c of calls) if (c.ai_agent_id) agentIds.add(c.ai_agent_id);
  for (const a of appts) if (a.ai_agent_id) agentIds.add(a.ai_agent_id);

  const stageIds = new Set<string>();
  for (const o of opps) if (o.stage_id) stageIds.add(o.stage_id);

  const [contactLookup, agentLookup, stageLookup] = await Promise.all([
    contactIds.size === 0
      ? Promise.resolve({ data: [] as ContactRow[] })
      : supabase
          .from("contacts")
          .select("id, first_name, last_name, phone, created_at")
          .in("id", Array.from(contactIds)),
    agentIds.size === 0
      ? Promise.resolve({ data: [] as { id: string; name: string }[] })
      : supabase.from("ai_agents").select("id, name").in("id", Array.from(agentIds)),
    stageIds.size === 0
      ? Promise.resolve({ data: [] as { id: string; name: string }[] })
      : supabase.from("pipeline_stages").select("id, name").in("id", Array.from(stageIds)),
  ]);

  const contactMap = new Map<string, ContactRow>();
  for (const c of (contactLookup.data ?? []) as ContactRow[]) contactMap.set(c.id, c);
  const agentMap = new Map<string, string>();
  for (const a of (agentLookup.data ?? []) as { id: string; name: string }[]) agentMap.set(a.id, a.name);
  const stageMap = new Map<string, string>();
  for (const s of (stageLookup.data ?? []) as { id: string; name: string }[]) stageMap.set(s.id, s.name);

  const events: ActivityEvent[] = [];

  // ── Calls ───────────────────────────────────────────────────────────
  for (const c of calls) {
    const contact = c.contact_id ? contactMap.get(c.contact_id) : undefined;
    const agent = c.ai_agent_id ? capitalizeAgent(agentMap.get(c.ai_agent_id)) : "Someone";
    const cName = contactName(contact);
    const isAi = !!c.ai_agent_id;

    let headline: string;
    if (c.status === "completed") {
      headline = `${agent} called ${cName} · ${formatDuration(c.duration_seconds)}`;
    } else {
      headline = `${agent} tried ${cName} · ${c.status ?? "no status"}`;
    }

    events.push({
      id: `call:${c.id}`,
      type: "call",
      ts: c.created_at,
      headline,
      dotToken: isAi ? "amber-ai" : "slate-400",
      href: `/calls/${c.id}`,
    });
  }

  // ── Appointments ────────────────────────────────────────────────────
  for (const a of appts) {
    const contact = a.contact_id ? contactMap.get(a.contact_id) : undefined;
    const cName = contactName(contact);
    const when = formatWhen(a.appointment_date, a.start_time);
    const isAi = a.booked_by === "ai" || !!a.ai_agent_id;

    let headline: string;
    if (isAi) {
      const agent = a.ai_agent_id ? capitalizeAgent(agentMap.get(a.ai_agent_id)) : "An agent";
      headline = `${agent} booked ${cName} · ${when}`;
    } else {
      headline = `${cName} booked · ${when}`;
    }

    events.push({
      id: `appointment:${a.id}`,
      type: "appointment",
      ts: a.created_at,
      headline,
      dotToken: isAi ? "amber-ai" : "slate-400",
      href: "/calendar",
    });
  }

  // ── Contacts (new leads) ────────────────────────────────────────────
  for (const c of contactsCreated) {
    events.push({
      id: `contact:${c.id}`,
      type: "contact",
      ts: c.created_at,
      headline: `New lead: ${contactName(c)}`,
      dotToken: "pink",
      href: `/people/${c.id}`,
    });
  }

  // ── Opportunities ───────────────────────────────────────────────────
  for (const o of opps) {
    const contact = o.contact_id ? contactMap.get(o.contact_id) : undefined;
    const cName = contactName(contact);
    const stage = o.stage_id ? stageMap.get(o.stage_id) ?? "Unstaged" : "Unstaged";

    let dotToken: ActivityDotToken = "warm";
    const stageLower = stage.toLowerCase();
    if (stageLower.includes("won")) dotToken = "won";
    else if (stageLower.includes("lost")) dotToken = "lost";

    events.push({
      id: `opportunity:${o.id}`,
      type: "opportunity",
      ts: o.created_at,
      headline: `${cName} → ${stage} · ${formatValue(o.value)}`,
      dotToken,
      href: "/pipeline",
    });
  }

  events.sort((a, b) => (b.ts < a.ts ? -1 : b.ts > a.ts ? 1 : 0));
  return events.slice(0, FEED_LIMIT);
}
