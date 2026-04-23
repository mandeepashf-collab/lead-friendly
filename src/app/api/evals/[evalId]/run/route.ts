// src/app/api/evals/[evalId]/run/route.ts
//
// POST /api/evals/[evalId]/run  — body: { callId: string }
//
// Flow:
//   1. Verify user can read the eval (RLS)
//   2. Fetch call_transcripts.text for the given callId (RLS)
//   3. Fetch the agent for agent_name (for judge prompt)
//   4. Call Haiku judge
//   5. Upsert into eval_runs on (eval_id, call_id) — re-runs overwrite
//
// Auth: user must belong to the agent's org (RLS on both eval and transcript tables).
// Writes to eval_runs use the service-role client because the RLS policy on eval_runs
// does not include an INSERT policy (by design; see migration 016).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { runJudge } from "@/lib/evals/judge";

export const runtime = "nodejs";
export const maxDuration = 30; // Vercel function timeout — Haiku typically 1-3s, allow headroom

type RouteContext = { params: Promise<{ evalId: string }> };

export async function POST(req: NextRequest, ctx: RouteContext) {
  const { evalId } = await ctx.params;

  let body: { callId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const callId = body.callId;
  if (!callId) {
    return NextResponse.json({ error: "callId is required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // 1. Load eval (RLS enforces org membership)
  const { data: evalRow, error: evalErr } = await supabase
    .from("agent_evals")
    .select("id, agent_id, criterion, is_active")
    .eq("id", evalId)
    .single();
  if (evalErr || !evalRow) {
    return NextResponse.json({ error: "Eval not found" }, { status: 404 });
  }
  if (!evalRow.is_active) {
    return NextResponse.json({ error: "Eval is inactive" }, { status: 400 });
  }

  // 2. Load transcript (RLS enforces org membership via calls join)
  const { data: transcript, error: transErr } = await supabase
    .from("call_transcripts")
    .select("text, duration_seconds")
    .eq("call_id", callId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (transErr) {
    return NextResponse.json({ error: transErr.message }, { status: 500 });
  }
  if (!transcript || !transcript.text || transcript.text.trim().length === 0) {
    return NextResponse.json(
      { error: "No transcript available for this call yet" },
      { status: 400 },
    );
  }

  // 3. Load agent name (nice-to-have for judge prompt)
  const { data: agent } = await supabase
    .from("ai_agents")
    .select("name")
    .eq("id", evalRow.agent_id)
    .single();

  // 4. Run judge
  const result = await runJudge({
    criterion: evalRow.criterion,
    transcript: transcript.text,
    agentName: agent?.name ?? undefined,
    durationSeconds: transcript.duration_seconds ?? undefined,
  });

  // 5. Upsert eval_run. Use service client — writes bypass RLS (no INSERT policy on eval_runs).
  const service = createServiceClient();
  const { data: runRow, error: upsertErr } = await service
    .from("eval_runs")
    .upsert(
      {
        eval_id: evalId,
        call_id: callId,
        agent_id: evalRow.agent_id,
        verdict: result.verdict,
        reason: result.reason,
        confidence: result.confidence,
        criterion_snapshot: evalRow.criterion,
        model: "claude-haiku-4-5-20251001",
        input_tokens: result.inputTokens,
        output_tokens: result.outputTokens,
        latency_ms: result.latencyMs,
        raw_response: result.rawResponse as object,
        status: result.status,
        error_message: result.errorMessage,
        created_at: new Date().toISOString(),
      },
      { onConflict: "eval_id,call_id" },
    )
    .select()
    .single();

  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  return NextResponse.json({
    run: runRow,
    parseMethod: result.parseMethod,
  });
}
