import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyDeepgramCallbackAuth } from "@/lib/deepgram/verify-auth";
import { autoRunEvalsOnTranscript } from "@/lib/evals/autoRunOnTranscript";

/**
 * POST /api/webhooks/deepgram
 *
 * Receives async transcription results from Deepgram. Authenticated via
 * Basic Auth (user/pass embedded in the callback URL we submitted).
 *
 * Flow:
 * - Verify Basic Auth
 * - Extract request_id from metadata
 * - Look up call row by deepgram_request_id
 * - Extract transcript text, confidence, full JSON from results
 * - Insert into call_transcripts (idempotent — skip if row already exists for this request_id)
 * - Set calls.transcript_status='completed'
 *
 * If we return non-2xx, Deepgram retries up to 10 times with 30s backoff.
 * This is a feature — gives us resilience against transient DB failures.
 */

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

export async function POST(req: NextRequest) {
  if (!verifyDeepgramCallbackAuth(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let payload: {
    metadata?: { request_id?: string; duration?: number };
    results?: {
      channels?: Array<{
        alternatives?: Array<{
          transcript?: string;
          confidence?: number;
        }>;
      }>;
    };
  };
  try {
    payload = await req.json();
  } catch (e) {
    console.error("[deepgram/callback] invalid JSON body:", e);
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const requestId = payload.metadata?.request_id;
  if (!requestId) {
    console.error("[deepgram/callback] no request_id in metadata");
    return NextResponse.json({ error: "no request_id" }, { status: 400 });
  }

  // Idempotency — skip if we already saved this one
  const { data: existing } = await supabaseAdmin
    .from("call_transcripts")
    .select("id")
    .eq("deepgram_request_id", requestId)
    .maybeSingle();

  if (existing) {
    console.log(
      `[deepgram/callback] duplicate for request_id=${requestId}, skipping`,
    );
    return NextResponse.json({ ok: true, duplicate: true });
  }

  // Look up call by request_id — include ai_agent_id so we can kick off
  // auto-eval runs once the transcript lands (P1 #3 Stage 5).
  const { data: call, error: callErr } = await supabaseAdmin
    .from("calls")
    .select("id, ai_agent_id")
    .eq("deepgram_request_id", requestId)
    .maybeSingle();

  if (callErr || !call) {
    console.error(
      `[deepgram/callback] no call found for request_id=${requestId}`,
      callErr,
    );
    // Return 200 so Deepgram doesn't retry — this is a permanent failure,
    // retrying won't help. Log and move on.
    return NextResponse.json({ ok: false, reason: "call not found" });
  }

  const alt = payload.results?.channels?.[0]?.alternatives?.[0];
  const text = alt?.transcript ?? "";
  const confidence = alt?.confidence ?? null;
  const durationSeconds = payload.metadata?.duration ?? null;

  const { error: insertErr } = await supabaseAdmin
    .from("call_transcripts")
    .insert({
      call_id: call.id,
      deepgram_request_id: requestId,
      raw_json: payload,
      text,
      confidence,
      duration_seconds: durationSeconds,
      model: "nova-3",
    });

  if (insertErr) {
    console.error(
      `[deepgram/callback] insert failed for call ${call.id}:`,
      insertErr,
    );
    // Return 500 so Deepgram retries — transient DB failure is recoverable
    return NextResponse.json({ error: "insert failed" }, { status: 500 });
  }

  await supabaseAdmin
    .from("calls")
    .update({ transcript_status: "completed" })
    .eq("id", call.id);

  console.log(
    `[deepgram/callback] transcript saved for call ${call.id}, confidence=${confidence}, length=${text.length} chars`,
  );

  // Fire-and-forget: run the agent's active evals against this transcript.
  // Fans out to Haiku in parallel (capped concurrency). Never awaited — the
  // webhook must respond 200 to Deepgram promptly.
  if (call.ai_agent_id) {
    void autoRunEvalsOnTranscript({
      callId: call.id,
      agentId: call.ai_agent_id,
      transcript: text,
      durationSeconds: durationSeconds ?? undefined,
    });
  }

  return NextResponse.json({ ok: true });
}
