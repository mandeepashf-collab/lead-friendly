// src/app/api/pipeline/deal-ai/route.ts
//
// Stage 3.6.5 Commit D — Per-deal AI drawer endpoint.
// POST { dealId, mode: "coach" | "draft" | "context" } -> JSON.
// Coach + Draft call Haiku 4.5 with generic SDR voice.
// Context returns structured deal/contact/calls only (no AI call).

import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";

const MODEL = "claude-haiku-4-5-20251001";

const COACH_SYSTEM = `You are an experienced sales coach helping a sales rep figure out the best next action for one of their open deals. You have full visibility into the deal: its current stage, age, value, the contact, and recent calls.

Your style is direct, brief, and tactical. Never more than 4 short sentences. Always end with one specific suggested action the rep can take in the next 24 hours.

Do not invent facts about the deal that aren't in the context provided. If context is sparse, acknowledge it ("Limited context here, but...") and give the best advice you can.`;

const DRAFT_SYSTEM = `You are drafting a follow-up message for a sales rep based on a deal's current state. Output ONLY the message body — no subject line, no preamble like "Here's a draft:", no closing notes.

Pick the channel based on context: if the contact has email but no recent SMS history, draft an email (3-5 short paragraphs). If recent SMS exists, draft an SMS (2-3 sentences max).

Match the deal stage:
- Lead/Qualified: introduce value, ask for a discovery call
- Proposal/Negotiation: address likely objections, push for next step
- Closed Won: thank-you + next phase setup
- Closed Lost: graceful door-open close

Generic professional tone. No emojis. No "Hope this finds you well."`;

interface DealContext {
  deal: { name: string; value: number; stage: string; ageDays: number; createdAt: string };
  contact: { name: string | null; email: string | null; phone: string | null } | null;
  recentCalls: Array<{
    direction: "inbound" | "outbound";
    durationSeconds: number;
    occurredAt: string;
    transcriptExcerpt: string | null;
  }>;
}

async function fetchDealContext(
  supabase: SupabaseClient,
  dealId: string,
  orgId: string,
): Promise<DealContext | null> {
  const { data: deal } = await supabase
    .from("opportunities")
    .select("id, name, value, created_at, contact_id, stage:pipeline_stages(name)")
    .eq("id", dealId)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (!deal) return null;

  const dealRow = deal as unknown as {
    id: string;
    name: string;
    value: number | null;
    created_at: string;
    contact_id: string | null;
    stage: { name: string } | Array<{ name: string }> | null;
  };
  const stageVal = dealRow.stage;
  const stageRow = Array.isArray(stageVal) ? (stageVal[0] ?? null) : stageVal;
  const stageName = stageRow?.name ?? "Unknown";

  const ageDays = Math.floor(
    (Date.now() - new Date(dealRow.created_at).getTime()) / (1000 * 60 * 60 * 24),
  );

  let contact: DealContext["contact"] = null;
  let recentCalls: DealContext["recentCalls"] = [];

  if (dealRow.contact_id) {
    const [contactRes, callsRes] = await Promise.all([
      supabase
        .from("contacts")
        .select("first_name, last_name, email, phone, cell_phone")
        .eq("id", dealRow.contact_id)
        .maybeSingle(),
      supabase
        .from("calls")
        .select("direction, duration_seconds, started_at, transcript, call_summary")
        .eq("contact_id", dealRow.contact_id)
        .order("started_at", { ascending: false, nullsFirst: false })
        .limit(5),
    ]);

    const c = contactRes.data as
      | {
          first_name: string | null;
          last_name: string | null;
          email: string | null;
          phone: string | null;
          cell_phone: string | null;
        }
      | null;
    if (c) {
      const fullName = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
      contact = {
        name: fullName || null,
        email: c.email ?? null,
        phone: c.phone ?? c.cell_phone ?? null,
      };
    }

    const calls = (callsRes.data ?? []) as Array<{
      direction: string | null;
      duration_seconds: number | null;
      started_at: string | null;
      transcript: string | null;
      call_summary: string | null;
    }>;
    recentCalls = calls.map((cl) => {
      const text = cl.transcript ?? cl.call_summary ?? null;
      return {
        direction: cl.direction === "inbound" ? "inbound" : "outbound",
        durationSeconds: Number(cl.duration_seconds) || 0,
        occurredAt: cl.started_at ?? "",
        transcriptExcerpt: text ? text.slice(0, 500) : null,
      };
    });
  }

  return {
    deal: {
      name: dealRow.name,
      value: Number(dealRow.value) || 0,
      stage: stageName,
      ageDays,
      createdAt: dealRow.created_at,
    },
    contact,
    recentCalls,
  };
}

function buildUserPrompt(ctx: DealContext, mode: "coach" | "draft"): string {
  const callsBlock =
    ctx.recentCalls.length === 0
      ? "No calls logged."
      : ctx.recentCalls
          .map((c, i) => {
            const head = `Call ${i + 1}: ${c.direction}, ${c.durationSeconds}s, ${c.occurredAt}`;
            return c.transcriptExcerpt ? `${head}\nExcerpt: ${c.transcriptExcerpt}` : head;
          })
          .join("\n\n");

  const contactBlock = ctx.contact
    ? `Contact: ${ctx.contact.name ?? "unnamed"}${ctx.contact.email ? `, email ${ctx.contact.email}` : ""}${ctx.contact.phone ? `, phone ${ctx.contact.phone}` : ""}`
    : "Contact: not assigned";

  return [
    `Deal: ${ctx.deal.name}`,
    `Stage: ${ctx.deal.stage}`,
    `Value: $${ctx.deal.value.toLocaleString()}`,
    `Age: ${ctx.deal.ageDays} days`,
    contactBlock,
    "",
    "Recent calls:",
    callsBlock,
    "",
    mode === "coach"
      ? "What should the rep do next? Be specific."
      : "Draft the follow-up message now.",
  ].join("\n");
}

async function callHaiku(
  system: string,
  userPrompt: string,
  maxTokens: number,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing");

  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    temperature: 0.5,
    system,
    messages: [{ role: "user", content: userPrompt }],
  });

  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

function pickChannel(ctx: DealContext): "email" | "sms" | null {
  if (!ctx.contact) return null;
  if (ctx.contact.email) return "email";
  if (ctx.contact.phone) return "sms";
  return null;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as
      | { dealId?: string; mode?: string }
      | null;
    if (!body || !body.dealId || !body.mode) {
      return NextResponse.json(
        { error: "dealId and mode are required" },
        { status: 400 },
      );
    }
    if (body.mode !== "coach" && body.mode !== "draft" && body.mode !== "context") {
      return NextResponse.json(
        { error: "mode must be coach | draft | context" },
        { status: 400 },
      );
    }

    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();
    if (!profile?.organization_id) {
      return NextResponse.json({ error: "No organization on profile" }, { status: 404 });
    }

    const ctx = await fetchDealContext(supabase, body.dealId, profile.organization_id);
    if (!ctx) return NextResponse.json({ error: "Deal not found" }, { status: 404 });

    if (body.mode === "context") {
      return NextResponse.json({ mode: "context", context: ctx });
    }

    try {
      if (body.mode === "coach") {
        const suggestion = await callHaiku(COACH_SYSTEM, buildUserPrompt(ctx, "coach"), 400);
        return NextResponse.json({ mode: "coach", suggestion, context: ctx });
      }
      const message = await callHaiku(DRAFT_SYSTEM, buildUserPrompt(ctx, "draft"), 600);
      return NextResponse.json({
        mode: "draft",
        message,
        suggestedChannel: pickChannel(ctx),
        context: ctx,
      });
    } catch (err) {
      console.error("[deal-ai] anthropic error:", err);
      return NextResponse.json(
        { error: "AI is temporarily unavailable. Try again in a moment." },
        { status: 503 },
      );
    }
  } catch (err) {
    console.error("[deal-ai] error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
