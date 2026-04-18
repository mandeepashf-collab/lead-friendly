import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

/**
 * Telnyx voice webhook — single endpoint for ALL call control events.
 * Telnyx Voice Applications use ONE webhook URL for every event, so we
 * route by event_type inside this handler. Do NOT split this into two
 * routes again: call.gather.ended will stop arriving.
 *
 * Flow:
 *   call.initiated     → answer()
 *   call.answered      → speak greeting
 *   call.speak.ended   → gather_using_speech  (listens for caller)
 *   call.gather.ended  → run Claude → speak response → loop
 *   call.hangup        → finalise call record
 */

const MAX_TURNS = 10;
const STOP_PHRASES = ["stop calling", "remove me", "do not call", "goodbye", "hang up", "not interested"];

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

// Service-role Supabase client so webhooks can write without a user session
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

type ClientState = {
  callRecordId?: string;
  contactId?: string | null;
  agentId?: string | null;
  conversationHistory: { role: "user" | "assistant"; content: string }[];
  turnCount: number;
};

function emptyState(): ClientState {
  return { conversationHistory: [], turnCount: 0 };
}

function decodeState(raw: string | undefined): ClientState {
  if (!raw) return emptyState();
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64").toString("utf-8"));
    return {
      callRecordId: parsed.callRecordId,
      contactId: parsed.contactId ?? null,
      agentId: parsed.agentId ?? null,
      conversationHistory: Array.isArray(parsed.conversationHistory) ? parsed.conversationHistory : [],
      turnCount: typeof parsed.turnCount === "number" ? parsed.turnCount : 0,
    };
  } catch {
    return emptyState();
  }
}

function encodeState(state: ClientState): string {
  return Buffer.from(JSON.stringify(state)).toString("base64");
}

async function telnyxAction(callControlId: string, action: string, body: Record<string, unknown>) {
  console.log(`[TELNYX ACTION →] ${action}`, JSON.stringify(body).slice(0, 200));
  const res = await fetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/${action}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.TELNYX_API_KEY!}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`[TELNYX ACTION ✗] ${action} (${res.status}):`, text.slice(0, 400));
  } else {
    console.log(`[TELNYX ACTION ✓] ${action} (${res.status})`);
  }
  return res;
}

/** Pull the system prompt + greeting from the ai_agents table if agentId is set. */
async function loadAgent(agentId: string | null | undefined) {
  if (!agentId) return null;
  const { data, error } = await supabaseAdmin
    .from("ai_agents")
    .select("id, name, greeting, system_prompt, personality")
    .eq("id", agentId)
    .single();
  if (error) {
    console.error("loadAgent error:", error.message);
    return null;
  }
  return data;
}

function defaultGreeting() {
  return "Hi there! This is Sarah calling from Lead Friendly. I'm reaching out to see how we can help your business grow. Do you have a couple of minutes to chat?";
}

function defaultSystemPrompt() {
  return `You are Sarah, a friendly AI sales agent for Lead Friendly, an AI-powered CRM platform.
Your goal is to have a natural conversation to understand the prospect's business and set up a demo.
Keep responses SHORT (1-3 sentences max) — this is a phone call.
Be warm, natural, and conversational. Don't sound robotic.
Ask one question at a time.`;
}

async function speakAndGather(callControlId: string, text: string, state: ClientState) {
  // Speak → Telnyx will emit call.speak.ended → we'll start gather there
  // voice: "female" is Telnyx's default basic-tier voice (no premium TTS required)
  await telnyxAction(callControlId, "speak", {
    payload: text,
    voice: "female",
    language: "en-US",
    client_state: encodeState(state),
  });
}

async function handleGatherResult(callControlId: string, transcript: string, state: ClientState) {
  const clean = (transcript || "").trim();
  const lower = clean.toLowerCase();
  const shouldStop =
    state.turnCount >= MAX_TURNS ||
    STOP_PHRASES.some((p) => lower.includes(p));

  if (!clean) {
    await telnyxAction(callControlId, "speak", {
      payload: "I didn't catch that. No worries, I'll follow up another time. Have a great day!",
      voice: "female",
      language: "en-US",
      client_state: encodeState({ ...state, turnCount: MAX_TURNS }), // mark as done
    });
    // Hangup after short delay so the audio finishes
    setTimeout(() => { telnyxAction(callControlId, "hangup", {}); }, 3500);
    return;
  }

  if (shouldStop) {
    await telnyxAction(callControlId, "speak", {
      payload: "Of course, I completely understand. Have a wonderful day!",
      voice: "female",
      language: "en-US",
      client_state: encodeState({ ...state, turnCount: MAX_TURNS }),
    });
    setTimeout(() => { telnyxAction(callControlId, "hangup", {}); }, 3500);
    return;
  }

  // Append user turn
  state.conversationHistory.push({ role: "user", content: clean });
  state.turnCount += 1;

  // Build messages for Claude
  const agent = await loadAgent(state.agentId);
  const systemPrompt = agent?.system_prompt || defaultSystemPrompt();

  let responseText = "That's great to hear. Can you tell me a bit more about what you're looking for?";
  try {
    const ai = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 150,
      system: systemPrompt,
      messages: state.conversationHistory.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });
    if (ai.content[0]?.type === "text") responseText = ai.content[0].text;
  } catch (err) {
    console.error("Claude API error:", err);
  }

  state.conversationHistory.push({ role: "assistant", content: responseText });

  // Speak → next call.speak.ended will re-start gather
  await speakAndGather(callControlId, responseText, state);
}

export async function POST(req: NextRequest) {
  // --- AGGRESSIVE LOGGING: prove webhook is reachable ---
  console.log("[VOICE WEBHOOK HIT] ts:", new Date().toISOString());

  let rawBody = "";
  try {
    rawBody = await req.text();
  } catch (err) {
    console.error("[VOICE WEBHOOK] failed to read body:", err);
    return NextResponse.json({ received: true });
  }

  // Log first 500 chars of body so we can see what Telnyx actually sent
  console.log("[VOICE WEBHOOK RAW BODY]:", rawBody.slice(0, 500));

  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(rawBody);
  } catch {
    console.warn("[VOICE WEBHOOK] body not JSON, acking anyway");
    return NextResponse.json({ received: true });
  }

  const data = body.data as Record<string, unknown> | undefined;
  const payload = data?.payload as Record<string, unknown> | undefined;
  const eventType = data?.event_type as string | undefined;
  const callControlId = payload?.call_control_id as string | undefined;

  console.log(
    "[VOICE EVENT]",
    eventType,
    "call:", callControlId?.slice(0, 20),
    "direction:", payload?.direction,
    "state:", payload?.state,
  );

  if (!callControlId || !eventType) {
    console.warn("[VOICE WEBHOOK] missing callControlId or eventType — acking");
    return NextResponse.json({ received: true });
  }

  const rawClientState = payload?.client_state as string | undefined;
  const state = decodeState(rawClientState);

  try {
    const direction = payload?.direction as string | undefined;

    // 1) Call initiated
    if (eventType === "call.initiated") {
      // For INBOUND calls we must explicitly answer so the leg connects.
      // For OUTBOUND calls started via /v2/calls, Telnyx handles the far leg
      // and we just wait for call.answered.
      if (direction === "incoming") {
        console.log("[VOICE] inbound call.initiated — answering");
        await telnyxAction(callControlId, "answer", {});
      } else {
        console.log("[VOICE] outbound call.initiated — waiting for call.answered");
      }
      return NextResponse.json({ received: true });
    }

    // 2) Answered — speak greeting
    if (eventType === "call.answered") {
      const agent = await loadAgent(state.agentId);
      const greeting = agent?.greeting?.trim() || defaultGreeting();

      // Seed the conversation with our greeting so Claude has context
      state.conversationHistory = [{ role: "assistant", content: greeting }];
      state.turnCount = 0;

      // Update DB status
      if (state.callRecordId) {
        await supabaseAdmin
          .from("calls")
          .update({ status: "in_progress", answered_at: new Date().toISOString() })
          .eq("id", state.callRecordId);
      }

      await speakAndGather(callControlId, greeting, state);
      return NextResponse.json({ received: true });
    }

    // 3) Done speaking — start listening for caller
    if (eventType === "call.speak.ended" || eventType === "call.playback.ended") {
      // If we've already decided to hang up (turnCount >= MAX), don't re-gather
      if (state.turnCount >= MAX_TURNS) {
        return NextResponse.json({ received: true });
      }
      // Telnyx v2 gather_using_speech — the speech engine is REQUIRED.
      // Without it, Telnyx accepts the command but never transcribes and
      // the call just sits in silence (exactly our symptom).
      await telnyxAction(callControlId, "gather_using_speech", {
        language: "en-US",
        voice: "female",
        // Required: pick an ASR engine. "Google" gives best accuracy for en-US.
        speech_model: "default",
        // How long to wait for the caller to START talking, in ms.
        timeout_millis: 10000,
        // How long of silence after speech ends before we consider the turn done.
        speech_timeout_millis: 2500,
        // Tell Telnyx we only care about voice, no DTMF digits expected.
        minimum_digits: 0,
        maximum_digits: 0,
        client_state: encodeState(state),
      });
      return NextResponse.json({ received: true });
    }

    // 3b) Gather command itself finished (separate from gather.ended) — ignore
    if (eventType === "call.gather_using_speech.ended") {
      // This is the actual Telnyx v2 event name on some API versions.
      // Fall through to the same handler as call.gather.ended below.
      const transcript =
        (payload?.speech_result as string | undefined) ??
        ((payload?.result as Record<string, unknown> | undefined)?.speech as string | undefined) ??
        (payload?.text as string | undefined) ??
        "";
      console.log("[VOICE gather_using_speech.ended] transcript:", JSON.stringify(transcript).slice(0, 200));
      await handleGatherResult(callControlId, transcript, state);
      return NextResponse.json({ received: true });
    }

    // 4) Gather finished — we have a transcript
    if (eventType === "call.gather.ended") {
      // Log the full payload so we can see what fields Telnyx is actually
      // sending us — the transcript field varies by API version.
      console.log("[VOICE gather.ended payload]:", JSON.stringify(payload).slice(0, 500));
      const transcript =
        (payload?.speech_result as string | undefined) ??
        ((payload?.result as Record<string, unknown> | undefined)?.speech as string | undefined) ??
        (payload?.text as string | undefined) ??
        (payload?.digits as string | undefined) ??
        "";
      await handleGatherResult(callControlId, transcript, state);
      return NextResponse.json({ received: true });
    }

    // 5) Hangup — persist final status
    if (eventType === "call.hangup") {
      const endedAt = new Date().toISOString();
      const hangupCause = (payload?.hangup_cause as string) || null;
      if (state.callRecordId) {
        const transcript = state.conversationHistory
          .map((m) => `${m.role === "user" ? "Prospect" : "Agent"}: ${m.content}`)
          .join("\n");
        await supabaseAdmin
          .from("calls")
          .update({
            status: hangupCause === "normal_clearing" ? "completed" : "failed",
            ended_at: endedAt,
            transcript,
          })
          .eq("id", state.callRecordId);
      }
      console.log("Call ended:", callControlId.slice(0, 16), "cause:", hangupCause);
      return NextResponse.json({ received: true });
    }

    // Unhandled events — just ack
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Voice handler error:", err);
    return NextResponse.json({ received: true });
  }
}

export async function GET() {
  return new NextResponse("OK", { status: 200 });
}
