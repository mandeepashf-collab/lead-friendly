// src/lib/dashboard/digest.ts
//
// Stage 3.6.4 — Daily AI digest data layer.
// Strategy: hour-bucketed cache. On request, look up cache for current
// (orgId, hour). Hit → serve. Miss → gather today's stats, call Haiku
// (or use empty-state literal if no activity today), upsert cache, return.
//
// Empty days skip the Haiku call entirely and use a plain literal.

import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";

export const DIGEST_MODEL = "claude-haiku-4-5-20251001";
const EMPTY_STATE_TEXT = "Quiet day so far — no calls or bookings yet.";

const SYSTEM_PROMPT =
  "You write brief, warm daily activity summaries for small-business owners. Output plain text only.";

export interface DigestResult {
  text: string;
  generated_at: string;
  cached: boolean;
}

interface TodayStats {
  callsTotal: number;
  callsCompleted: number;
  avgDurationSec: number;
  byAgent: Array<{ name: string; calls: number }>;
  apptsTotal: number;
  apptsAiBooked: number;
  apptsManual: number;
  contactsTotal: number;
  oppsTotal: number;
  oppsValue: number;
}

function startOfTodayLocalIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function currentHourBucketIso(): string {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  return d.toISOString();
}

function formatDurationLong(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return "0s";
  if (sec < 60) return `${Math.round(sec)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

async function gatherTodayStats(
  supabase: SupabaseClient,
  orgId: string,
): Promise<TodayStats> {
  const todayIso = startOfTodayLocalIso();

  const [callsRes, apptsRes, contactsRes, oppsRes] = await Promise.all([
    supabase
      .from("calls")
      .select("id, status, duration_seconds, ai_agent_id")
      .eq("organization_id", orgId)
      .gte("created_at", todayIso),

    supabase
      .from("appointments")
      .select("id, booked_by, ai_agent_id")
      .eq("organization_id", orgId)
      .gte("created_at", todayIso),

    supabase
      .from("contacts")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .gte("created_at", todayIso),

    supabase
      .from("opportunities")
      .select("id, value")
      .eq("organization_id", orgId)
      .gte("created_at", todayIso),
  ]);

  const calls = (callsRes.data ?? []) as Array<{
    id: string;
    status: string | null;
    duration_seconds: number | null;
    ai_agent_id: string | null;
  }>;
  const appts = (apptsRes.data ?? []) as Array<{
    id: string;
    booked_by: string | null;
    ai_agent_id: string | null;
  }>;
  const opps = (oppsRes.data ?? []) as Array<{ id: string; value: number | null }>;

  const callsTotal = calls.length;
  const callsCompleted = calls.filter((c) => c.status === "completed").length;
  const completedDurations = calls
    .filter((c) => c.status === "completed")
    .map((c) => Number(c.duration_seconds) || 0);
  const avgDurationSec =
    completedDurations.length > 0
      ? completedDurations.reduce((s, n) => s + n, 0) / completedDurations.length
      : 0;

  const byAgentCounts = new Map<string, number>();
  for (const c of calls) {
    if (!c.ai_agent_id) continue;
    byAgentCounts.set(c.ai_agent_id, (byAgentCounts.get(c.ai_agent_id) ?? 0) + 1);
  }
  let byAgent: Array<{ name: string; calls: number }> = [];
  if (byAgentCounts.size > 0) {
    const { data: agents } = await supabase
      .from("ai_agents")
      .select("id, name")
      .in("id", Array.from(byAgentCounts.keys()));
    const nameMap = new Map<string, string>();
    for (const a of (agents ?? []) as Array<{ id: string; name: string }>) {
      nameMap.set(a.id, a.name);
    }
    byAgent = Array.from(byAgentCounts.entries())
      .map(([id, count]) => ({
        name: nameMap.get(id) ?? "An agent",
        calls: count,
      }))
      .sort((a, b) => b.calls - a.calls);
  }

  const apptsTotal = appts.length;
  const apptsAiBooked = appts.filter(
    (a) => a.booked_by === "ai" || !!a.ai_agent_id,
  ).length;
  const apptsManual = apptsTotal - apptsAiBooked;

  const contactsTotal = contactsRes.count ?? 0;

  const oppsTotal = opps.length;
  const oppsValue = opps.reduce(
    (s, o) => s + (Number(o.value) || 0),
    0,
  );

  return {
    callsTotal,
    callsCompleted,
    avgDurationSec,
    byAgent,
    apptsTotal,
    apptsAiBooked,
    apptsManual,
    contactsTotal,
    oppsTotal,
    oppsValue,
  };
}

function buildUserPrompt(stats: TodayStats): string {
  const byAgentText =
    stats.byAgent.length > 0
      ? stats.byAgent
          .map((a) => `${a.name} ${a.calls}`)
          .join(", ")
      : "none";
  const oppsValueStr = `${Math.round(stats.oppsValue).toLocaleString("en-US")}`;

  return [
    "You are summarizing today's activity for a small business owner who runs AI voice agents.",
    "Be warm, brief, and direct. Write 2-3 sentences in a single paragraph. No emoji, no exclamation marks, no marketing language.",
    "",
    "Today's data:",
    `- Calls: ${stats.callsTotal} (${stats.callsCompleted} completed, avg duration ${formatDurationLong(stats.avgDurationSec)})`,
    `- Calls by agent: ${byAgentText}`,
    `- Appointments: ${stats.apptsTotal} (${stats.apptsAiBooked} AI-booked, ${stats.apptsManual} manual)`,
    `- New contacts: ${stats.contactsTotal}`,
    `- Opportunity changes: ${stats.oppsTotal} (total value $${oppsValueStr})`,
    "",
    "If there is a notable moment (a long call, a stage change to Closed Won, a high-value opportunity, a surge of new leads), highlight it.",
    "If today is quiet, say so honestly in one sentence — do not pad.",
    "",
    "Write in plural first person (\"we\", \"our agents\") representing the team of AI agents.",
    "Output the paragraph only — no preamble, no headers, no quotes.",
  ].join("\n");
}

async function callHaiku(userPrompt: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing from environment");

  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model: DIGEST_MODEL,
    max_tokens: 200,
    temperature: 0.5,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

export async function fetchOrGenerateDigest(
  supabase: SupabaseClient,
  orgId: string,
): Promise<DigestResult> {
  const hourBucket = currentHourBucketIso();

  const cacheRes = await supabase
    .from("digest_cache")
    .select("digest_text, generated_at")
    .eq("organization_id", orgId)
    .eq("hour_bucket", hourBucket)
    .maybeSingle();

  if (cacheRes.data?.digest_text) {
    return {
      text: cacheRes.data.digest_text,
      generated_at: cacheRes.data.generated_at,
      cached: true,
    };
  }

  const stats = await gatherTodayStats(supabase, orgId);

  const allZero =
    stats.callsTotal === 0 &&
    stats.apptsTotal === 0 &&
    stats.contactsTotal === 0 &&
    stats.oppsTotal === 0;

  let digestText: string;
  let modelString: string;

  if (allZero) {
    digestText = EMPTY_STATE_TEXT;
    modelString = "empty-state";
  } else {
    const userPrompt = buildUserPrompt(stats);
    digestText = (await callHaiku(userPrompt)) || EMPTY_STATE_TEXT;
    modelString = DIGEST_MODEL;
  }

  const generatedAt = new Date().toISOString();

  // Upsert handles the race where two simultaneous misses both regenerate.
  const { error: upsertError } = await supabase
    .from("digest_cache")
    .upsert(
      {
        organization_id: orgId,
        hour_bucket: hourBucket,
        digest_text: digestText,
        model_string: modelString,
        generated_at: generatedAt,
      },
      { onConflict: "organization_id,hour_bucket" },
    );

  if (upsertError) {
    console.warn("[digest] upsert failed (non-fatal):", upsertError.message);
  }

  return {
    text: digestText,
    generated_at: generatedAt,
    cached: false,
  };
}
