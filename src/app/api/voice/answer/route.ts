import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { createTTSToken } from "@/app/api/voice/tts-stream/route";
import {
  ClientState as SharedClientState,
  decodeClientState,
  encodeClientState,
  emptyClientState,
} from "@/lib/client-state";

/**
 * Telnyx voice webhook — single endpoint for ALL call control events.
 *
 * ═══════════════════════════════════════════════════════════════════
 *  GHL-QUALITY AI VOICE PIPELINE
 * ═══════════════════════════════════════════════════════════════════
 *
 * Flow:
 *   call.initiated       → answer (inbound) / wait (outbound)
 *   call.answered        → load agent → TTS greeting via speak
 *   call.speak.ended     → transcription_start (begin listening)
 *   call.transcription   → accumulate transcript, on final result → Claude AI → speak response → loop
 *   call.hangup          → finalize call record + generate summary
 *
 * Key design:
 *   • Uses Telnyx transcription_start for real-time STT (Google engine)
 *   • Claude Haiku for fast, natural AI responses
 *   • Telnyx speak for TTS (ElevenLabs commented out until fixed)
 *   • Multiple AI tools: book_meeting, transfer_call, send_sms, collect_info
 *   • Per-agent configurable max_turns, stop_phrases
 *   • Voicemail detection via silence timing
 *   • Post-call AI summary generation
 */

// Defaults — overridden by agent-level settings when available
const DEFAULT_MAX_TURNS = 15;
const DEFAULT_STOP_PHRASES = [
  "stop calling", "remove me", "do not call", "goodbye", "hang up",
  "not interested", "take me off your list", "don't call again",
  "wrong number", "leave me alone"
];
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // ElevenLabs Rachel

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// ─── Contact Auto-Tagging ───────────────────────────────────────
// Appends a tag to contacts.tags via the add_contact_tag(p_contact_id, p_tag)
// RPC defined in supabase/migrations/008_contact_tags.sql. The RPC is
// idempotent (no duplicates) and runs in a single round-trip.
// Known outcome tags: mp_appt_set, dnc, not_interested, callback_requested.
async function tagContact(contactId: string | null | undefined, tag: string): Promise<void> {
  if (!contactId || !tag) return;
  try {
    const { error } = await supabaseAdmin.rpc("add_contact_tag", {
      p_contact_id: contactId,
      p_tag: tag,
      p_source: "automation",
    });
    if (error) {
      console.error(`[tagContact] rpc failed for contact=${contactId} tag=${tag}:`, error.message);
    } else {
      console.log(`[tagContact] +${tag} -> contact=${contactId}`);
    }
  } catch (err) {
    console.error(`[tagContact] threw for contact=${contactId} tag=${tag}:`, err);
  }
}

// ─── Webhook Event Logging ──────────────────────────────────────
async function logWebhookEvent(args: {
  eventType: string | undefined;
  callControlId: string | undefined;
  payload: Record<string, unknown> | undefined;
  rawBody: string;
}) {
  try {
    await supabaseAdmin.from("voice_webhook_events").insert({
      event_type: args.eventType ?? "unknown",
      call_control_id: args.callControlId ?? null,
      payload: (args.payload ?? {}) as Record<string, unknown>,
      raw_body: args.rawBody.slice(0, 10000),
    });
  } catch (err) {
    console.error("[voice_webhook_events insert error]", err);
  }
}

// ─── Client State (passed through Telnyx base64) ───────────────
// Type + encode/decode live in src/lib/client-state.ts so voice/answer and
// voice/status share the same drift-proof round-trip. Only AgentConfig is
// kept local — it's refined here beyond the shared module's `unknown`.
type AgentConfig = {
  voiceId: string;
  maxTurns: number;
  stopPhrases: string[];
  personality: string;
  transferNumber: string | null;
  maxDurationMins: number;
  agentName: string;
  voiceSpeed: number;
  voiceStability: number;
  aiTemperature: number;
  enableRecording: boolean;
};

// Local ClientState intersects the shared type with a refined agentConfig.
// Assignments from decodeClientState() need one cast at the decode site
// because the shared module keeps agentConfig as `unknown`.
type ClientState = Omit<SharedClientState, "agentConfig"> & {
  agentConfig?: AgentConfig;
};

// ─── Telnyx API Helper ──────────────────────────────────────────
async function telnyxAction(callControlId: string, action: string, body: Record<string, unknown>) {
  console.log(`[TELNYX →] ${action}`, JSON.stringify(body).slice(0, 300));
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
    console.error(`[TELNYX ✗] ${action} (${res.status}):`, text.slice(0, 400));
  } else {
    console.log(`[TELNYX ✓] ${action}`);
  }
  return res;
}

// ─── Agent Loading ──────────────────────────────────────────────
async function loadAgent(agentId: string | null | undefined) {
  if (!agentId) return null;
  const { data, error } = await supabaseAdmin
    .from("ai_agents")
    .select("id, name, greeting_message, system_prompt, voice_id, organization_id, personality, max_duration_mins, transfer_number, dnc_phrases, objection_handling, knowledge_base, closing_script, max_call_duration, inbound_prompt, inbound_greeting, outbound_prompt, outbound_greeting, voice_speed, settings")
    .eq("id", agentId)
    .single();
  if (error) {
    console.error("loadAgent error:", error.message);
    return null;
  }
  return data;
}

async function loadDefaultAgentForOrg(organizationId: string | null | undefined) {
  if (!organizationId) return null;
  const { data, error } = await supabaseAdmin
    .from("ai_agents")
    .select("id, name, greeting_message, system_prompt, voice_id, organization_id, personality, max_duration_mins, transfer_number, dnc_phrases, objection_handling, knowledge_base, closing_script, max_call_duration, inbound_prompt, inbound_greeting, outbound_prompt, outbound_greeting, voice_speed, settings")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("loadDefaultAgentForOrg error:", error.message);
    return null;
  }
  return data;
}

// ─── Contact Loading (for personalization) ──────────────────────
async function loadContact(contactId: string | null | undefined) {
  if (!contactId) return null;
  const { data } = await supabaseAdmin
    .from("contacts")
    .select("id, first_name, last_name, email, phone, company, company_name, lender_name, city, state, lead_source, source, tags, notes, custom_fields")
    .eq("id", contactId)
    .maybeSingle();
  return data;
}

// ─── Template Variable Replacement ──────────────────────────────
function resolveTemplateVars(
  text: string,
  contact: Record<string, unknown> | null,
  agent: Record<string, unknown> | null,
): string {
  if (!text) return text;

  const firstName = (contact?.first_name as string) || "";
  const lastName = (contact?.last_name as string) || "";
  const company = (contact?.company as string) || (contact?.company_name as string) || "";
  const city = (contact?.city as string) || "";
  const state = (contact?.state as string) || "";
  const phone = (contact?.phone as string) || "";
  const email = (contact?.email as string) || "";
  const leadSource = (contact?.lead_source as string) || (contact?.source as string) || "";
  // Prefer the dedicated contacts.lender_name column, then fall back to
  // custom_fields.lender_name / .lender, then to the company fields. Keeping
  // the fallbacks means pre-existing contacts without the new column still
  // render template vars correctly.
  const customFields = (contact?.custom_fields as Record<string, string>) || {};
  const lenderName =
    (contact?.lender_name as string) ||
    customFields.lender_name ||
    customFields.lender ||
    company ||
    "";
  const loanAmount = customFields.loan_amount || "";

  const agentName = (agent?.name as string) || "AI Assistant";
  const transferNumber = (agent?.transfer_number as string) || "";

  // Build replacement map — supports both {{contact.field}} and {field} syntax
  const vars: Record<string, string> = {
    "contact.first_name": firstName,
    "contact.last_name": lastName,
    "contact.name": [firstName, lastName].filter(Boolean).join(" "),
    "contact.company": company,
    "contact.company_name": company,
    "contact.lender_name": lenderName,
    "contact.lender": lenderName,
    "contact.city": city,
    "contact.state": state,
    "contact.phone": phone,
    "contact.email": email,
    "contact.lead_source": leadSource,
    "contact.loan_amount": loanAmount,
    // Short aliases (single-brace style used by UI)
    "first_name": firstName,
    "last_name": lastName,
    "name": [firstName, lastName].filter(Boolean).join(" "),
    "company": company,
    "lender": lenderName,
    "lender_name": lenderName,
    "city": city,
    "state": state,
    "phone": phone,
    "email": email,
    "loan_amount": loanAmount,
    // Org / agent vars
    "org.name": agentName,
    "org.live_rep_number": transferNumber,
    "agent.name": agentName,
    "caller_id_readback": phone,
  };

  let result = text;
  for (const [key, value] of Object.entries(vars)) {
    // Replace {{key}} and {key} patterns
    result = result.replace(new RegExp(`\\{\\{${key.replace(/\./g, "\\.")}\\}\\}`, "gi"), value);
    // Only replace single-brace if the key has no dots (avoid matching CSS/JSON)
    if (!key.includes(".")) {
      result = result.replace(new RegExp(`\\{${key}\\}`, "gi"), value);
    }
  }

  return result;
}

// ─── Build Production System Prompt ─────────────────────────────
function buildSystemPrompt(
  agent: Record<string, unknown> | null,
  contact: Record<string, unknown> | null,
  callDirection?: "inbound" | "outbound",
): string {
  if (!agent) return emergencySystemPrompt();

  const agentName = (agent.name as string) || "AI Assistant";
  // Use direction-specific prompt if available, fall back to generic system_prompt
  const directionPrompt = callDirection === "inbound"
    ? (agent.inbound_prompt as string) || ""
    : callDirection === "outbound"
    ? (agent.outbound_prompt as string) || ""
    : "";
  const basePrompt = directionPrompt || (agent.system_prompt as string) || "";
  const objections = (agent.objection_handling as string) || "";
  const knowledge = (agent.knowledge_base as string) || "";
  const closing = (agent.closing_script as string) || "";

  // Contact personalization
  const firstName = (contact?.first_name as string) || "";
  const lastName = (contact?.last_name as string) || "";
  const company = (contact?.company as string) || "";
  const city = (contact?.city as string) || "";
  const state = (contact?.state as string) || "";
  const leadSource = (contact?.lead_source as string) || "";

  let prompt = `You are ${agentName}, an AI voice agent on a live phone call.

═══ CRITICAL VOICE RULES ═══
• You are on a PHONE CALL — speak naturally, conversationally, like a real human.
• ALWAYS respond to what the caller JUST said. Read their words carefully and reply accordingly.
• If the caller answers a question, acknowledge their answer and move forward. NEVER repeat a question they already answered.
• NEVER repeat the same sentence or question twice in a call. If you already asked something, move on.
• Keep responses SHORT: 1-2 sentences max. Brevity is key — this is a real-time phone call.
• NEVER use bullet points, markdown, asterisks, headers, or any formatting.
• NEVER say "as an AI" or reveal you are artificial intelligence.
• Mirror the caller's energy — if they're enthusiastic, match it; if hesitant, be gentle.
• Ask ONE question at a time, then WAIT for the answer.
• Use the caller's name naturally (not every sentence).
• If you don't understand something, say "Sorry, could you repeat that?" naturally.
• When the caller wants to end the call, wrap up gracefully. Don't drag it out.
• If the caller says something unexpected or off-script, respond naturally to THEIR words first, then guide back.

`;

  // Resolve template variables like {{contact.first_name}} in the prompt
  const resolvedPrompt = resolveTemplateVars(basePrompt, contact, agent);
  if (resolvedPrompt) {
    prompt += `═══ YOUR INSTRUCTIONS ═══\n${resolvedPrompt}\n\n`;
  }

  if (objections) {
    prompt += `═══ OBJECTION HANDLING ═══\n${resolveTemplateVars(objections, contact, agent)}\n\n`;
  }

  if (knowledge) {
    prompt += `═══ KNOWLEDGE BASE ═══\n${resolveTemplateVars(knowledge, contact, agent)}\n\n`;
  }

  if (closing) {
    prompt += `═══ CLOSING SCRIPT ═══\n${resolveTemplateVars(closing, contact, agent)}\n\n`;
  }

  // Inject contact context
  if (firstName || company || city) {
    prompt += `═══ CALLER CONTEXT ═══\n`;
    if (firstName) prompt += `Name: ${firstName}${lastName ? ` ${lastName}` : ""}\n`;
    if (company) prompt += `Company: ${company}\n`;
    if (city || state) prompt += `Location: ${[city, state].filter(Boolean).join(", ")}\n`;
    if (leadSource) prompt += `Lead source: ${leadSource}\n`;
    prompt += `\nUse this context naturally in conversation — don't recite it like a list.\n\n`;
  }

  prompt += `═══ RESPONSE FORMAT ═══
Respond with ONLY what you would say out loud. No stage directions, no internal thoughts, no parentheticals.
Keep it natural, human, and conversational. Max 2 sentences.
IMPORTANT: Your response MUST directly relate to the caller's last message. Do NOT ignore what they said.`;

  return prompt;
}

function emergencyGreeting() {
  console.warn("[VOICE] Using emergency greeting — NO AGENT found");
  return "Hello, thanks for answering. I appear to be having a configuration issue on my end. I'll try again later. Have a great day!";
}

function emergencySystemPrompt() {
  return `You are a friendly AI assistant on a phone call. This call is in a misconfigured state —
keep responses extremely short (1-2 sentences), apologize briefly, and politely end the call.`;
}

// ─── ElevenLabs TTS + Telnyx Playback ───────────────────────────
/**
 * Generate a signed TTS URL and tell Telnyx to play it.
 * When Telnyx fetches the URL, our /api/voice/tts-stream endpoint
 * generates ElevenLabs audio on-the-fly. This is fully stateless
 * and works perfectly on Vercel serverless.
 *
 * Falls back to Telnyx basic TTS if ElevenLabs is not configured.
 */
async function speakWithElevenLabs(
  callControlId: string,
  text: string,
  voiceId: string,
  state: ClientState,
) {
  // Strategy: Try ElevenLabs playback_start with a timeout-based fallback.
  // If playback_start fails at the API level, immediately fall back to Telnyx speak.
  // If playback_start succeeds but audio fetch fails later, call.playback.failed handler
  // will catch it and retry with Telnyx speak.
  // Circuit breaker: once ElevenLabs fails on a call, skip it for the rest of that call.
  if (process.env.ELEVENLABS_API_KEY && text.trim() && !state.elevenLabsDisabled) {
    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.leadfriendly.com";
      const speed = state.agentConfig?.voiceSpeed ?? 1.0;
      const stability = state.agentConfig?.voiceStability ?? 0.5;
      const token = createTTSToken(text, voiceId, speed, stability);
      const audioUrl = `${appUrl}/api/voice/tts-stream?token=${token}`;
      console.log(`[ElevenLabs] TTS URL: voice=${voiceId}, text=${text.length} chars, url=${audioUrl.slice(0, 80)}...`);

      // Store pending text in state so playback.failed can retry with Telnyx speak
      state.pendingSpeakText = text;

      const res = await telnyxAction(callControlId, "playback_start", {
        audio_url: audioUrl,
        client_state: encodeClientState(state),
      });

      // If Telnyx API accepted the playback_start, we're done
      // (the actual audio fetch happens asynchronously on Telnyx's side)
      if (res.ok) {
        console.log("[ElevenLabs] playback_start accepted by Telnyx");
        return;
      }

      // Telnyx rejected the command — fall through to speak fallback
      const errText = await res.text().catch(() => "unknown");
      console.error(`[ElevenLabs] playback_start rejected (${res.status}): ${errText}`);
    } catch (err) {
      console.error("[ElevenLabs TTS failed, falling back to Telnyx speak]:", err);
    }
  }

  // Fallback: Telnyx basic TTS — always works, no external dependencies
  console.log(`[TELNYX SPEAK] Fallback TTS: ${text.length} chars`);
  state.pendingSpeakText = undefined; // Clear since we're using speak directly
  await telnyxAction(callControlId, "speak", {
    payload: text,
    voice: "female",
    language: "en-US",
    client_state: encodeClientState(state),
  });
}

// ─── Speak (with or without ElevenLabs) ─────────────────────────
async function speakAndGather(
  callControlId: string,
  text: string,
  state: ClientState,
) {
  const voiceId = state.agentConfig?.voiceId
    || state.draftVoiceId
    || DEFAULT_VOICE_ID;

  await speakWithElevenLabs(callControlId, text, voiceId, state);
}

// ─── AI Tools Definition ────────────────────────────────────────
function getAITools(): Anthropic.Tool[] {
  return [
    {
      name: "book_meeting",
      description:
        "Book a meeting/appointment after the lead verbally agrees to a specific date AND time. " +
        "Only call this AFTER the lead explicitly confirms both date and time. " +
        "Ask for specifics first — never guess. After booking, confirm the details back.",
      input_schema: {
        type: "object" as const,
        properties: {
          date: { type: "string", description: "YYYY-MM-DD in the lead's local timezone" },
          start_time: { type: "string", description: "24h time HH:MM" },
          end_time: { type: "string", description: "24h time HH:MM (optional, defaults to +30min)" },
          title: { type: "string", description: "Short meeting title" },
          notes: { type: "string", description: "Relevant notes from the conversation" },
        },
        required: ["date", "start_time"],
      },
    },
    {
      name: "transfer_call",
      description:
        "Transfer the call to a human agent or specific department. " +
        "Use when: the caller explicitly asks to speak to a person, the issue requires human judgment, " +
        "or you cannot help further. Always tell the caller you're transferring them first.",
      input_schema: {
        type: "object" as const,
        properties: {
          reason: { type: "string", description: "Brief reason for the transfer" },
          department: { type: "string", description: "Department name if specified (e.g., 'sales', 'support')" },
        },
        required: ["reason"],
      },
    },
    {
      name: "end_call",
      description:
        "Gracefully end the call. Use when: the conversation has reached its natural conclusion, " +
        "the caller says goodbye, or the caller explicitly asks to hang up. " +
        "Always say a warm goodbye BEFORE calling this tool.",
      input_schema: {
        type: "object" as const,
        properties: {
          reason: { type: "string", description: "Why the call is ending" },
          outcome: {
            type: "string",
            enum: ["appointment_booked", "interested", "not_interested", "callback_requested", "wrong_number", "voicemail", "completed"],
            description: "Call outcome classification",
          },
        },
        required: ["reason", "outcome"],
      },
    },
    {
      name: "save_note",
      description:
        "Save an important piece of information mentioned during the call (email address, " +
        "callback time preference, specific request, etc.). Use this to capture details " +
        "that should be recorded in the CRM for follow-up.",
      input_schema: {
        type: "object" as const,
        properties: {
          note: { type: "string", description: "The information to save" },
          category: {
            type: "string",
            enum: ["contact_info", "preference", "objection", "interest", "callback", "other"],
            description: "Category of the note",
          },
        },
        required: ["note"],
      },
    },
  ];
}

// ─── Tool Execution ─────────────────────────────────────────────
async function executeTools(
  toolUseBlocks: Anthropic.ToolUseBlock[],
  state: ClientState,
  callControlId: string,
): Promise<{ shouldHangup: boolean; callOutcome?: string }> {
  let shouldHangup = false;
  let callOutcome: string | undefined;

  for (const toolUse of toolUseBlocks) {
    const input = toolUse.input as Record<string, unknown>;

    if (toolUse.name === "book_meeting" && !state.isTestCall) {
      try {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.leadfriendly.com";
        const bookRes = await fetch(`${appUrl}/api/appointments/book`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-service-key": process.env.SUPABASE_SERVICE_ROLE_KEY || "",
          },
          body: JSON.stringify({
            organizationId: state.organizationId,
            contactId: state.contactId,
            callId: state.callRecordId,
            date: input.date,
            startTime: input.start_time,
            endTime: input.end_time,
            title: input.title || "Meeting",
            notes: input.notes,
          }),
        });
        console.log("[book_meeting]", bookRes.status);
        callOutcome = "appointment_booked";
        // Auto-tag the contact so the CRM can surface "appointments set" quickly.
        if (bookRes.ok) {
          await tagContact(state.contactId, "mp_appt_set");
        }
      } catch (err) {
        console.error("book_meeting failed:", err);
      }
    }

    if (toolUse.name === "transfer_call") {
      const transferNumber = state.agentConfig?.transferNumber;
      if (transferNumber) {
        try {
          await telnyxAction(callControlId, "transfer", {
            to: transferNumber,
          });
          callOutcome = "transferred";
        } catch (err) {
          console.error("transfer_call failed:", err);
        }
      } else {
        console.warn("[transfer_call] No transfer number configured for this agent");
      }
    }

    if (toolUse.name === "end_call") {
      shouldHangup = true;
      callOutcome = (input.outcome as string) || "completed";

      // Map Claude's structured end-of-call outcome to a contact tag.
      // (appointment_booked is handled by the book_meeting branch above, so
      // we skip it here to avoid double-tagging.)
      const outcomeTagMap: Record<string, string> = {
        not_interested: "not_interested",
        callback_requested: "callback_requested",
      };
      const tag = outcomeTagMap[callOutcome];
      if (tag) {
        await tagContact(state.contactId, tag);
      }
    }

    if (toolUse.name === "save_note" && state.callRecordId) {
      try {
        // Append note to call record
        const { data: existingCall } = await supabaseAdmin
          .from("calls")
          .select("notes")
          .eq("id", state.callRecordId)
          .single();
        const existingNotes = (existingCall?.notes as string) || "";
        const category = (input.category as string) || "other";
        const newNote = `[${category}] ${input.note}`;
        await supabaseAdmin
          .from("calls")
          .update({ notes: existingNotes ? `${existingNotes}\n${newNote}` : newNote })
          .eq("id", state.callRecordId);
        console.log("[save_note] Saved:", newNote);
      } catch (err) {
        console.error("save_note failed:", err);
      }
    }
  }

  return { shouldHangup, callOutcome };
}

// ─── Handle Gather Result (Core AI Loop) ────────────────────────
async function handleGatherResult(callControlId: string, transcript: string, state: ClientState) {
  const clean = (transcript || "").trim();
  const lower = clean.toLowerCase();

  // Get agent config (loaded on call.answered and carried in state)
  const config = state.agentConfig;
  const maxTurns = config?.maxTurns || DEFAULT_MAX_TURNS;
  const stopPhrases = config?.stopPhrases || DEFAULT_STOP_PHRASES;

  const matchedStopPhrase = stopPhrases.find((p) => lower.includes(p));
  const shouldStop = state.turnCount >= maxTurns || Boolean(matchedStopPhrase);

  // Treat stop-phrases as a DNC signal if they match known DNC wording.
  // (Hitting the max-turn limit is not a DNC — it's just the end of a call.)
  const DNC_PHRASES = [
    "stop calling", "remove me", "do not call", "don't call again",
    "take me off your list", "leave me alone",
  ];
  const isDnc = Boolean(matchedStopPhrase) && DNC_PHRASES.some((p) => lower.includes(p));

  // Track consecutive declines so we can auto-tag `not_interested` on the
  // second rejection even if the AI never calls end_call with that outcome.
  const DECLINE_HINTS = ["not interested", "no thanks", "no thank you", "not right now", "pass"];
  const declinedNow = DECLINE_HINTS.some((p) => lower.includes(p));
  state.declineStreak = declinedNow ? (state.declineStreak ?? 0) + 1 : 0;
  if (declinedNow && state.declineStreak >= 2) {
    await tagContact(state.contactId, "not_interested");
  }

  // ── Empty gather handling (voicemail detection) ──
  if (!clean) {
    const streak = (state.emptyGatherStreak ?? 0) + 1;
    const timeSinceAnswer = state.answeredAt ? (Date.now() - state.answeredAt) / 1000 : 0;

    // Voicemail heuristic: if we get empty gather very quickly after answering
    // (< 3 seconds) followed by another empty, it's likely voicemail
    const likelyVoicemail = streak >= 2 && timeSinceAnswer < 15;

    if (streak >= 3 || likelyVoicemail) {
      // Voicemail or dead line — leave a brief message and hang up
      const voicemailMsg = likelyVoicemail
        ? "Hi, this is a quick message — I was trying to reach you about your recent inquiry. I'll try again later, or feel free to call us back at your convenience. Thanks!"
        : "It seems we have a bad connection. No worries, I'll follow up another time. Have a great day!";

      await speakAndGather(callControlId, voicemailMsg, {
        ...state,
        turnCount: maxTurns, // prevent re-gather after this speak
        emptyGatherStreak: streak,
      });

      // Schedule hangup after the message plays
      setTimeout(() => { telnyxAction(callControlId, "hangup", {}); }, 6000);

      // Update call record with voicemail status
      if (state.callRecordId) {
        await supabaseAdmin
          .from("calls")
          .update({ status: likelyVoicemail ? "voicemail" : "no_answer" })
          .eq("id", state.callRecordId);
      }
      return;
    }

    if (streak === 1) {
      // First empty — prompt gently
      await speakAndGather(callControlId, "Hey, are you still there?", {
        ...state,
        emptyGatherStreak: streak,
      });
      return;
    }

    // Second empty — try once more
    await speakAndGather(callControlId, "I'm still here if you'd like to continue.", {
      ...state,
      emptyGatherStreak: streak,
    });
    return;
  }

  // Reset streak on real speech
  state.emptyGatherStreak = 0;

  // ── Stop phrase detected ──
  if (shouldStop) {
    const goodbyeMsg = state.turnCount >= maxTurns
      ? "I really appreciate your time today. If you have any more questions, don't hesitate to reach out. Have a wonderful day!"
      : "Absolutely, I completely understand. Thank you for your time, and have a wonderful day!";

    // DNC side-effects: update the contact's status and tag them so
    // downstream automations (e.g. campaign outreach) exclude them.
    if (isDnc && state.contactId) {
      await Promise.all([
        supabaseAdmin
          .from("contacts")
          .update({ status: "do_not_contact" })
          .eq("id", state.contactId)
          .then(({ error }) => {
            if (error) console.error("[DNC status update failed]", error.message);
          }),
        tagContact(state.contactId, "dnc"),
      ]);
    }

    await speakAndGather(callControlId, goodbyeMsg, {
      ...state,
      turnCount: maxTurns,
    });
    setTimeout(() => { telnyxAction(callControlId, "hangup", {}); }, 5000);
    return;
  }

  // ── Append user turn ──
  state.conversationHistory.push({ role: "user", content: clean });
  state.turnCount += 1;

  // ── Build system prompt ──
  let systemPrompt = state.systemPrompt;
  if (!systemPrompt) {
    systemPrompt = emergencySystemPrompt();
  }

  // ── Call Claude AI ──
  let responseText = "That's a great question. Could you tell me a bit more about what you're looking for?";
  let shouldHangup = false;

  try {
    const tools = getAITools();

    const messagesForClaude = state.conversationHistory.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    // Dynamic system prompt enhancement to prevent repetition
    let enhancedPrompt = systemPrompt;
    if (state.turnCount > 1) {
      // Extract what the AI said in previous turns to avoid repeating
      const prevAssistantLines = state.conversationHistory
        .filter(m => m.role === "assistant")
        .map(m => m.content)
        .slice(-3);
      if (prevAssistantLines.length > 0) {
        enhancedPrompt += `\n\n═══ ANTI-REPETITION ═══\nYou already said these things earlier — DO NOT repeat them:\n${prevAssistantLines.map(l => `- "${l.slice(0, 80)}"`).join("\n")}\nSay something NEW and relevant to what the caller just told you.`;
      }
    }

    const aiTemp = state.agentConfig?.aiTemperature ?? 0.7;
    const ai = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      temperature: aiTemp,
      system: enhancedPrompt,
      tools,
      messages: messagesForClaude,
    });

    const textBlocks = ai.content.filter((b) => b.type === "text") as Anthropic.TextBlock[];
    const toolUseBlocks = ai.content.filter((b) => b.type === "tool_use") as Anthropic.ToolUseBlock[];

    // Execute tools
    if (toolUseBlocks.length > 0 && !state.isTestCall) {
      const result = await executeTools(toolUseBlocks, state, callControlId);
      shouldHangup = result.shouldHangup;

      // Update call outcome in DB
      if (result.callOutcome && state.callRecordId) {
        await supabaseAdmin
          .from("calls")
          .update({ notes: `outcome: ${result.callOutcome}` })
          .eq("id", state.callRecordId);
      }
    }

    // Use Claude's text reply
    if (textBlocks.length > 0 && textBlocks[0].text.trim()) {
      responseText = textBlocks[0].text.trim();
      // Clean any markdown that might slip through
      responseText = responseText
        .replace(/\*\*/g, "")
        .replace(/\*/g, "")
        .replace(/#{1,6}\s/g, "")
        .replace(/- /g, "")
        .replace(/\n/g, " ")
        .trim();
    } else if (toolUseBlocks.length > 0 && toolUseBlocks[0].name === "book_meeting") {
      const input = toolUseBlocks[0].input as { date?: string; start_time?: string };
      responseText = `Perfect, I've got you booked for ${input.date} at ${input.start_time}. You'll get a confirmation shortly. Is there anything else I can help you with?`;
    } else if (toolUseBlocks.length > 0 && toolUseBlocks[0].name === "end_call") {
      // The AI already said goodbye in text — just use a fallback
      responseText = "Thank you so much for your time. Have a great day!";
    }
  } catch (err) {
    console.error("Claude API error:", err);
  }

  state.conversationHistory.push({ role: "assistant", content: responseText });

  // ── Log turn pair to call_turns ──
  if (state.callRecordId && state.organizationId) {
    const turnOrdinal = (state.turnCount - 1) * 2; // 0-based pair index
    supabaseAdmin
      .from("call_turns")
      .insert([
        {
          call_id: state.callRecordId,
          organization_id: state.organizationId,
          ordinal: turnOrdinal,
          role: "user",
          state_name: "opening", // TODO: track current state once state machine is wired
          content: clean,
        },
        {
          call_id: state.callRecordId,
          organization_id: state.organizationId,
          ordinal: turnOrdinal + 1,
          role: "agent",
          state_name: "opening",
          content: responseText,
        },
      ])
      .then(({ error }) => {
        if (error) console.error("[call_turns] insert failed:", error.message);
      });
  }

  // ── Speak response ──
  if (shouldHangup) {
    // Speak final message then hang up
    await speakAndGather(callControlId, responseText, {
      ...state,
      turnCount: maxTurns, // prevents re-gather
    });
    setTimeout(() => { telnyxAction(callControlId, "hangup", {}); }, 5000);
  } else {
    await speakAndGather(callControlId, responseText, state);
  }
}

// ─── Post-Call Summary ──────────────────────────────────────────
async function generateCallSummary(state: ClientState) {
  if (!state.callRecordId || state.conversationHistory.length < 2) return;

  try {
    const transcript = state.conversationHistory
      .map((m) => `${m.role === "user" ? "Prospect" : "Agent"}: ${m.content}`)
      .join("\n");

    const ai = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      system: "You are a call analysis assistant. Summarize the following phone call transcript in 2-3 sentences. Include: what was discussed, the outcome, and any follow-up needed. Be concise and factual.",
      messages: [{ role: "user", content: transcript }],
    });

    const summary = (ai.content[0] as Anthropic.TextBlock)?.text || "";

    await supabaseAdmin
      .from("calls")
      .update({
        transcript,
        notes: summary,
      })
      .eq("id", state.callRecordId);

    console.log("[Call Summary] Generated for", state.callRecordId);
  } catch (err) {
    console.error("Call summary generation failed:", err);
  }
}

// ═══════════════════════════════════════════════════════════════
//  MAIN WEBHOOK HANDLER
// ═══════════════════════════════════════════════════════════════

export async function POST(req: NextRequest) {
  console.log("[VOICE WEBHOOK HIT]", new Date().toISOString());

  let rawBody = "";
  try {
    rawBody = await req.text();
  } catch (err) {
    console.error("[VOICE WEBHOOK] failed to read body:", err);
    return NextResponse.json({ received: true });
  }

  console.log("[VOICE RAW]:", rawBody.slice(0, 500));

  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(rawBody);
  } catch {
    console.warn("[VOICE WEBHOOK] body not JSON");
    return NextResponse.json({ received: true });
  }

  const data = body.data as Record<string, unknown> | undefined;
  const payload = data?.payload as Record<string, unknown> | undefined;
  const eventType = data?.event_type as string | undefined;
  const callControlId = payload?.call_control_id as string | undefined;

  console.log("[VOICE EVENT]", eventType, "call:", callControlId?.slice(0, 20));

  // Log every event
  await logWebhookEvent({ eventType, callControlId, payload, rawBody });

  if (!callControlId || !eventType) {
    return NextResponse.json({ received: true });
  }

  const rawClientState = payload?.client_state as string | undefined;
  const state = decodeClientState(rawClientState) as ClientState;

  // Diagnostic: catch round-trip regressions early. If Telnyx sends a
  // non-empty client_state but the decoder drops everything identifiable,
  // something is wrong and we want to notice on the next call rather than
  // find out via "AI greets the rep on a Manual Call" again.
  if (rawClientState && !state.callRecordId && !state.agentId) {
    console.warn(
      "[VOICE] decoded state looks empty despite raw client_state being present",
      {
        rawLength: rawClientState.length,
        decodedKeys: Object.keys(state),
        eventType,
      },
    );
  }

  try {
    const direction = payload?.direction as string | undefined;

    // ═══ 1) CALL INITIATED ═══
    if (eventType === "call.initiated") {
      if (direction === "incoming") {
        state.callDirection = "inbound";
        console.log("[VOICE] Inbound call — answering");

        const toNumber = (payload?.to as string | undefined) || null;
        if (toNumber) {
          try {
            const { data: numRow } = await supabaseAdmin
              .from("phone_numbers")
              .select("organization_id")
              .eq("number", toNumber)
              .maybeSingle();
            if (numRow) {
              state.organizationId = (numRow as { organization_id: string | null }).organization_id ?? null;
              console.log("[VOICE] Matched inbound number", toNumber, "org:", state.organizationId);
            }
          } catch (err) {
            console.error("[VOICE] phone_numbers lookup error:", err);
          }
        }

        await telnyxAction(callControlId, "answer", { client_state: encodeClientState(state) });
      } else {
        state.callDirection = "outbound";
        console.log("[VOICE] Outbound call.initiated — waiting for answered");
      }
      return NextResponse.json({ received: true });
    }

    // ═══ 2) CALL ANSWERED ═══
    if (eventType === "call.answered") {
      state.answeredAt = Date.now();

      // Determine call direction if not already set
      // (outbound calls may not carry callDirection through Telnyx client_state
      // because call.initiated for outbound doesn't call any Telnyx action)
      if (!state.callDirection) {
        state.callDirection = state.agentId ? "outbound" : "inbound";
        console.log(`[VOICE] callDirection inferred: ${state.callDirection}`);
      }

      // ── CALLBACK BRIDGE (Path A): Rep picked up → now dial the contact ──
      if (state.callMode === "callback_bridge") {
        if (state.legA) {
          // Leg A answered: the rep picked up their phone.
          // Tell them we're connecting, then dial the contact (Leg B).
          console.log("[VOICE] Callback bridge: Rep answered (Leg A). Dialing contact...");

          if (state.callRecordId) {
            await supabaseAdmin
              .from("calls")
              .update({ status: "in_progress", answered_at: new Date().toISOString() })
              .eq("id", state.callRecordId);
          }

          // Brief message to the rep
          await telnyxAction(callControlId, "speak", {
            payload: "Connecting you now. Please hold.",
            voice: "female",
            language: "en-US",
            client_state: encodeClientState(state),
          });

          // Dial Leg B (the contact) using Telnyx
          const bridgeTarget = state.bridgeTarget;
          const bridgeFrom = state.bridgeFrom;
          if (!bridgeTarget || !bridgeFrom) {
            console.error(
              "[VOICE] Callback bridge: missing bridgeTarget/bridgeFrom in state",
              { bridgeTarget, bridgeFrom },
            );
            await telnyxAction(callControlId, "speak", {
              payload: "Sorry, we couldn't reach the contact. The call will now end.",
              voice: "female",
              language: "en-US",
            });
            await telnyxAction(callControlId, "hangup", {});
            return NextResponse.json({ received: true });
          }
          const legBState = Buffer.from(JSON.stringify({
            callRecordId: state.callRecordId,
            callMode: "callback_bridge",
            legA: false,
            legACallControlId: callControlId, // so we can bridge when contact picks up
            organizationId: state.organizationId,
          })).toString("base64");

          const webhookUrl = process.env.NEXT_PUBLIC_APP_URL
            ? `${process.env.NEXT_PUBLIC_APP_URL}/api/voice/answer`
            : "https://www.leadfriendly.com/api/voice/answer";

          const legBRes = await fetch("https://api.telnyx.com/v2/calls", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.TELNYX_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              connection_id: process.env.TELNYX_APP_ID,
              to: bridgeTarget,
              from: bridgeFrom,
              webhook_url: webhookUrl,
              webhook_url_method: "POST",
              client_state: legBState,
            }),
          });

          if (legBRes.ok) {
            const legBData = await legBRes.json() as { data?: { call_control_id?: string } };
            const legBId = legBData?.data?.call_control_id;
            console.log("[VOICE] Leg B dialing:", bridgeTarget, "callControlId:", legBId);
            if (legBId && state.callRecordId) {
              await supabaseAdmin
                .from("calls")
                .update({ bridge_call_control_id: legBId })
                .eq("id", state.callRecordId);
            }
          } else {
            console.error("[VOICE] Leg B dial failed:", legBRes.status);
            // Tell the rep the call failed
            await telnyxAction(callControlId, "speak", {
              payload: "Sorry, we couldn't reach the contact. The call will now end.",
              voice: "female",
              language: "en-US",
            });
            await telnyxAction(callControlId, "hangup", {});
          }

          return NextResponse.json({ received: true });
        } else {
          // Leg B answered: the contact picked up.
          // Bridge the two calls together.
          console.log("[VOICE] Callback bridge: Contact answered (Leg B). Bridging...");
          const legAId = state.legACallControlId;

          if (legAId) {
            await telnyxAction(callControlId, "bridge", {
              call_control_id: callControlId,
              call_control_id_target: legAId,
            });
            console.log("[VOICE] Bridge command sent:", callControlId, "↔", legAId);
          } else {
            console.error("[VOICE] No Leg A call_control_id to bridge to!");
          }

          return NextResponse.json({ received: true });
        }
      }

      // ── MANUAL CALL: No AI, just hold the line open ──
      // Legacy path — kept for backward compatibility.
      if (state.callMode === "manual") {
        console.log("[VOICE] Manual call answered — no AI, holding line open");
        if (state.callRecordId) {
          await supabaseAdmin
            .from("calls")
            .update({ status: "in_progress", answered_at: new Date().toISOString() })
            .eq("id", state.callRecordId);
        }
        await telnyxAction(callControlId, "speak", {
          payload: "Hello, please hold while we connect you.",
          voice: "female",
          language: "en-US",
          client_state: encodeClientState(state),
        });
        return NextResponse.json({ received: true });
      }

      // ── AI AGENT CALL: Load agent and speak greeting ──
      let greeting: string | undefined;
      let voiceId = DEFAULT_VOICE_ID;
      let systemPrompt: string | undefined;

      if (state.draftGreeting?.trim()) {
        // Test call from build page
        greeting = state.draftGreeting.trim();
        voiceId = state.draftVoiceId || DEFAULT_VOICE_ID;
        systemPrompt = state.draftSystemPrompt?.trim() || emergencySystemPrompt();
        console.log("[VOICE] Using DRAFT agent for test call");
      } else {
        // Production: load agent from DB
        let agent = await loadAgent(state.agentId);
        if (!agent && state.organizationId) {
          agent = await loadDefaultAgentForOrg(state.organizationId);
          if (agent) {
            state.agentId = agent.id as string;
            console.log("[VOICE] Loaded default org agent:", agent.id);
          }
        }

        if (agent) {
          // Use direction-specific greeting if available
          const dir = state.callDirection || "outbound";
          if (dir === "inbound") {
            greeting = ((agent.inbound_greeting as string) || (agent.greeting_message as string) || "").trim();
          } else {
            greeting = ((agent.outbound_greeting as string) || (agent.greeting_message as string) || "").trim();
          }
          voiceId = (agent.voice_id as string) || DEFAULT_VOICE_ID;

          // Load contact for personalization
          const contact = await loadContact(state.contactId);

          // Resolve template variables in greeting (e.g. {{contact.first_name}})
          greeting = resolveTemplateVars(greeting, contact, agent);

          systemPrompt = buildSystemPrompt(agent, contact, dir);

          // Parse DNC phrases from agent config
          const dncRaw = (agent.dnc_phrases as string) || "";
          const agentStopPhrases = dncRaw
            ? dncRaw.split(",").map((s: string) => s.trim().toLowerCase()).filter(Boolean)
            : DEFAULT_STOP_PHRASES;

          // Snapshot agent config into state so subsequent events don't need DB lookups
          state.agentConfig = {
            voiceId,
            maxTurns: (agent.max_call_duration as number) || (agent.max_duration_mins as number) || DEFAULT_MAX_TURNS,
            stopPhrases: agentStopPhrases,
            personality: (agent.personality as string) || "friendly",
            transferNumber: (agent.transfer_number as string) || null,
            maxDurationMins: (agent.max_duration_mins as number) || 10,
            agentName: (agent.name as string) || "AI Assistant",
            voiceSpeed: (agent.voice_speed as number) ?? 1.0,
            voiceStability: ((agent.settings as Record<string, unknown>)?.voice_stability as number) ?? 0.5,
            aiTemperature: ((agent.settings as Record<string, unknown>)?.ai_temperature as number) ?? 0.7,
            enableRecording: ((agent.settings as Record<string, unknown>)?.enable_recording as boolean) ?? true,
          };

          console.log(`[VOICE] Agent loaded: ${agent.name}, voice: ${voiceId}`);
        }
      }

      if (!greeting) greeting = emergencyGreeting();
      if (!systemPrompt) systemPrompt = emergencySystemPrompt();

      // Store system prompt in state for subsequent turns
      state.systemPrompt = systemPrompt;

      // Seed conversation with greeting
      state.conversationHistory = [{ role: "assistant", content: greeting }];
      state.turnCount = 0;

      // Update DB
      if (state.callRecordId) {
        await supabaseAdmin
          .from("calls")
          .update({ status: "in_progress", answered_at: new Date().toISOString() })
          .eq("id", state.callRecordId);
      }

      // Start call recording if enabled
      if (state.agentConfig?.enableRecording !== false) {
        try {
          await telnyxAction(callControlId, "record_start", {
            format: "mp3",
            channels: "dual",
            client_state: encodeClientState(state),
          });
          console.log("[VOICE] Call recording started");
        } catch (recErr) {
          console.error("[VOICE] Failed to start recording:", recErr);
        }
      }

      // Speak greeting with ElevenLabs voice
      await speakAndGather(callControlId, greeting, state);
      return NextResponse.json({ received: true });
    }

    // ═══ 3) SPEAK/PLAYBACK ENDED — Start listening via transcription ═══
    if (eventType === "call.speak.ended" || eventType === "call.playback.ended") {
      // Manual calls: after "please hold" message, just keep line open
      if (state.callMode === "manual") {
        console.log("[VOICE] Manual call — speak ended, holding line open");
        return NextResponse.json({ received: true });
      }

      const maxTurns = state.agentConfig?.maxTurns || DEFAULT_MAX_TURNS;
      if (state.turnCount >= maxTurns) {
        console.log("[VOICE] Max turns reached, not starting transcription");
        return NextResponse.json({ received: true });
      }

      // Start real-time transcription to listen for caller speech
      console.log("[VOICE] Starting transcription to listen for caller");
      await telnyxAction(callControlId, "transcription_start", {
        language: "en",
        transcription_engine: "google",
        transcription_tracks: "inbound",
        client_state: encodeClientState({ ...state, transcribing: true, lastSpeechTimestamp: Date.now() }),
      });
      return NextResponse.json({ received: true });
    }

    // ═══ 3b) PLAYBACK FAILED — ElevenLabs audio couldn't be fetched ═══
    // This fires when Telnyx accepted playback_start but failed to fetch the audio URL.
    // We retry with Telnyx's built-in speak as fallback.
    if (eventType === "call.playback.failed") {
      console.error("[VOICE] playback_start FAILED — Telnyx could not fetch audio URL. Falling back to Telnyx speak.");
      const failReason = payload?.failure_reason as string | undefined;
      console.error("[VOICE] Failure reason:", failReason || "unknown");

      // Circuit breaker: disable ElevenLabs for the rest of this call
      state.elevenLabsDisabled = true;
      console.log("[VOICE] ElevenLabs disabled for remainder of this call (circuit breaker)");

      if (state.pendingSpeakText?.trim()) {
        // Retry with Telnyx basic TTS
        console.log(`[VOICE] Retrying with Telnyx speak: ${state.pendingSpeakText.length} chars`);
        const retryText = state.pendingSpeakText;
        state.pendingSpeakText = undefined;
        await telnyxAction(callControlId, "speak", {
          payload: retryText,
          voice: "female",
          language: "en-US",
          client_state: encodeClientState(state),
        });
      } else {
        // No pending text — just start listening anyway so the call doesn't go silent
        console.log("[VOICE] No pending text, starting transcription to keep call alive");
        await telnyxAction(callControlId, "transcription_start", {
          language: "en",
          transcription_engine: "google",
          transcription_tracks: "inbound",
          client_state: encodeClientState({ ...state, transcribing: true, lastSpeechTimestamp: Date.now() }),
        });
      }
      return NextResponse.json({ received: true });
    }

    // ═══ 4) TRANSCRIPTION EVENT — Process speech in real-time ═══
    if (eventType === "call.transcription") {
      // Ignore stale transcription events if we're not in transcribing mode
      // (e.g. events in flight after transcription_stop was called)
      if (state.callMode === "manual") {
        return NextResponse.json({ received: true });
      }

      const transcriptionData = payload?.transcription_data as Record<string, unknown> | undefined;
      const transcript = (transcriptionData?.transcript as string | undefined) ?? "";
      const isFinal = transcriptionData?.is_final === true;
      const confidence = (transcriptionData?.confidence as number | undefined) ?? 0;

      console.log("[VOICE transcription]:", JSON.stringify({ transcript: transcript.slice(0, 200), isFinal, confidence }));

      // Only process final (complete utterance) transcriptions
      if (!isFinal || !transcript.trim()) {
        // If we get multiple empty/interim results, track for voicemail detection
        if (isFinal && !transcript.trim()) {
          const timeSinceAnswer = state.answeredAt ? (Date.now() - state.answeredAt) / 1000 : 0;
          const streak = (state.emptyGatherStreak ?? 0) + 1;

          if (streak >= 3 || (streak >= 2 && timeSinceAnswer < 15)) {
            // Likely voicemail — leave message and hang up
            console.log("[VOICE] Voicemail detected, leaving message");
            await telnyxAction(callControlId, "transcription_stop", {});
            await speakAndGather(callControlId,
              "Hi, this is a quick message — I was trying to reach you about your recent inquiry. I'll try again later, or feel free to call us back. Thanks!",
              { ...state, turnCount: (state.agentConfig?.maxTurns || DEFAULT_MAX_TURNS), emptyGatherStreak: streak }
            );
            setTimeout(() => { telnyxAction(callControlId, "hangup", {}); }, 6000);
            if (state.callRecordId) {
              await supabaseAdmin.from("calls").update({ status: "voicemail" }).eq("id", state.callRecordId);
            }
            return NextResponse.json({ received: true });
          }
        }
        return NextResponse.json({ received: true });
      }

      // We have a final transcription with actual speech!
      // Stop transcription while we process and respond
      console.log("[VOICE] Got final transcript, stopping transcription to process");
      await telnyxAction(callControlId, "transcription_stop", {});

      // Process through our Claude AI pipeline (same as the old handleGatherResult)
      await handleGatherResult(callControlId, transcript, { ...state, transcribing: false });
      return NextResponse.json({ received: true });
    }

    // ═══ 4b) GATHER ENDED — Fallback for any gather events ═══
    if (eventType === "call.gather.ended") {
      console.log("[VOICE gather.ended]:", JSON.stringify(payload).slice(0, 500));
      const transcript =
        (payload?.digits as string | undefined) ?? "";
      if (transcript) {
        await handleGatherResult(callControlId, transcript, state);
      }
      return NextResponse.json({ received: true });
    }

    // ═══ 5) HANGUP — Finalize ═══
    if (eventType === "call.hangup") {
      const hangupCause = (payload?.hangup_cause as string) || null;
      const hangupSource = (payload?.hangup_source as string) || null;
      console.log("Call ended:", callControlId.slice(0, 16), "cause:", hangupCause, "source:", hangupSource);

      // Map Telnyx hangup_cause to a meaningful status
      const CAUSE_MAP: Record<string, string> = {
        normal_clearing: "completed",
        originator_cancel: "canceled",
        call_rejected: "rejected",
        unallocated_number: "failed",
        no_user_response: "no_answer",
        no_answer: "no_answer",
        user_busy: "busy",
        normal_temporary_failure: "failed",
        recovery_on_timer_expire: "no_answer",
        destination_out_of_order: "failed",
        media_timeout: "failed",
      };
      const derivedStatus = hangupCause ? (CAUSE_MAP[hangupCause] || "completed") : "completed";

      if (state.callRecordId) {
        // For callback bridge calls, don't overwrite if the other leg already finalized
        const isCallbackBridge = state.callMode === "callback_bridge";

        const transcript = state.conversationHistory?.length > 0
          ? state.conversationHistory
              .map((m) => `${m.role === "user" ? "Prospect" : "Agent"}: ${m.content}`)
              .join("\n")
          : null;

        const updates: Record<string, unknown> = {
          status: derivedStatus,
          ended_at: new Date().toISOString(),
          hangup_cause: hangupCause,
          hangup_source: hangupSource,
        };
        if (transcript) updates.transcript = transcript;

        await supabaseAdmin
          .from("calls")
          .update(updates)
          .eq("id", state.callRecordId);

        // Generate AI summary for AI agent calls (not callback bridge)
        if (!isCallbackBridge && state.conversationHistory?.length > 0) {
          generateCallSummary(state).catch((err) =>
            console.error("Summary generation failed:", err)
          );
        }
      }
      return NextResponse.json({ received: true });
    }

    // ═══ RECORDING SAVED — Store recording URL ═══
    if (eventType === "call.recording.saved") {
      const recUrls = payload?.recording_urls as Record<string, string> | undefined;
      const pubUrls = payload?.public_recording_urls as Record<string, string> | undefined;
      const recordingUrl = recUrls?.mp3 || pubUrls?.mp3 || (payload?.recording_url as string) || null;
      console.log("[VOICE] Recording saved:", recordingUrl?.slice(0, 80));
      if (recordingUrl && state.callRecordId) {
        await supabaseAdmin
          .from("calls")
          .update({ recording_url: recordingUrl })
          .eq("id", state.callRecordId);
        console.log("[VOICE] Recording URL saved to DB");
      }
      return NextResponse.json({ received: true });
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Voice handler error:", err);
    return NextResponse.json({ received: true });
  }
}

export async function GET() {
  return new NextResponse("OK", { status: 200 });
}
