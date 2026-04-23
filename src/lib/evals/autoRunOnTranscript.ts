// src/lib/evals/autoRunOnTranscript.ts
//
// Stage 5 of P1 #3. Auto-runs all active evals for an agent against a
// newly-completed call transcript.
//
// Called fire-and-forget from src/app/api/webhooks/deepgram/route.ts after
// a successful transcript insert:
//
//   import { autoRunEvalsOnTranscript } from "@/lib/evals/autoRunOnTranscript";
//   // ... after the call_transcripts insert, knowing call.id and call.ai_agent_id ...
//   void autoRunEvalsOnTranscript({ callId: call.id, agentId: call.ai_agent_id, transcript: transcriptText });
//
// Concurrency: fans out in parallel, capped at CONCURRENCY to stay polite to
// Anthropic rate limits. If an agent has 10 evals, the call takes ~3s total
// rather than 30s sequentially.
//
// Failure handling: each eval runs independently — one INCONCLUSIVE doesn't
// block the others. Failures are written as eval_runs with status='failed'
// so they're visible in the UI, not silently dropped.

import { runJudge } from "./judge";
import { createServiceClient } from "@/lib/supabase/service";

const CONCURRENCY = 4;

interface AutoRunInput {
  callId: string;
  agentId: string;
  /** Full transcript text. If omitted, will be fetched from call_transcripts. */
  transcript?: string;
  durationSeconds?: number;
  agentName?: string;
}

interface AutoRunSummary {
  callId: string;
  agentId: string;
  evalsRun: number;
  passed: number;
  failed: number;
  inconclusive: number;
  errors: number;
  totalLatencyMs: number;
}

/**
 * Fire-and-forget entry point. Errors are swallowed; return value is for callers
 * who want visibility (tests, manual invocations).
 */
export function autoRunEvalsOnTranscript(input: AutoRunInput): Promise<AutoRunSummary | null> {
  return _autoRun(input).catch((err) => {
    console.warn(
      `[autoRunEvalsOnTranscript] Top-level failure for call ${input.callId}:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  });
}

async function _autoRun(input: AutoRunInput): Promise<AutoRunSummary> {
  const startedAt = Date.now();
  const service = createServiceClient();

  // 1. Load all active evals for this agent
  const { data: evals, error: evalsErr } = await service
    .from("agent_evals")
    .select("id, criterion")
    .eq("agent_id", input.agentId)
    .eq("is_active", true);

  if (evalsErr) {
    console.warn(
      `[autoRunEvalsOnTranscript] Failed to load evals for agent ${input.agentId}:`,
      evalsErr.message,
    );
    return emptySummary(input);
  }

  if (!evals || evals.length === 0) {
    // Nothing to do — agent has no active evals. Quiet, not an error.
    return emptySummary(input);
  }

  // 2. Get transcript text (use passed-in if caller already has it)
  let transcriptText = input.transcript;
  let durationSeconds = input.durationSeconds;
  if (!transcriptText) {
    const { data: t } = await service
      .from("call_transcripts")
      .select("text, duration_seconds")
      .eq("call_id", input.callId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    transcriptText = t?.text ?? "";
    durationSeconds = durationSeconds ?? (t?.duration_seconds as number | undefined);
  }

  if (!transcriptText || transcriptText.trim().length === 0) {
    console.warn(
      `[autoRunEvalsOnTranscript] No transcript text for call ${input.callId}, skipping`,
    );
    return emptySummary(input);
  }

  // 3. Get agent name (nice-to-have for judge prompt)
  let agentName = input.agentName;
  if (!agentName) {
    const { data: agent } = await service
      .from("ai_agents")
      .select("name")
      .eq("id", input.agentId)
      .single();
    agentName = agent?.name ?? undefined;
  }

  // 4. Fan out with concurrency cap
  const summary: AutoRunSummary = {
    callId: input.callId,
    agentId: input.agentId,
    evalsRun: 0,
    passed: 0,
    failed: 0,
    inconclusive: 0,
    errors: 0,
    totalLatencyMs: 0,
  };

  const queue = [...evals];
  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(CONCURRENCY, queue.length); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const ev = queue.shift();
      if (!ev) return;
      try {
        const result = await runJudge({
          criterion: ev.criterion,
          transcript: transcriptText!,
          agentName,
          durationSeconds,
        });

        await service.from("eval_runs").upsert(
          {
            eval_id: ev.id,
            call_id: input.callId,
            agent_id: input.agentId,
            verdict: result.verdict,
            reason: result.reason,
            confidence: result.confidence,
            criterion_snapshot: ev.criterion,
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
        );

        summary.evalsRun++;
        if (result.status === "failed") summary.errors++;
        if (result.verdict === "PASS") summary.passed++;
        else if (result.verdict === "FAIL") summary.failed++;
        else summary.inconclusive++;
      } catch (err) {
        summary.errors++;
        console.warn(
          `[autoRunEvalsOnTranscript] Eval ${ev.id} failed for call ${input.callId}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  }

  summary.totalLatencyMs = Date.now() - startedAt;
  console.log(
    `[autoRunEvalsOnTranscript] call=${input.callId} agent=${input.agentId} ` +
      `ran=${summary.evalsRun} pass=${summary.passed} fail=${summary.failed} ` +
      `inconclusive=${summary.inconclusive} errors=${summary.errors} ` +
      `total_ms=${summary.totalLatencyMs}`,
  );
  return summary;
}

function emptySummary(input: AutoRunInput): AutoRunSummary {
  return {
    callId: input.callId,
    agentId: input.agentId,
    evalsRun: 0,
    passed: 0,
    failed: 0,
    inconclusive: 0,
    errors: 0,
    totalLatencyMs: 0,
  };
}
