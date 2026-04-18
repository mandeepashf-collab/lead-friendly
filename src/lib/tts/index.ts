// ============================================================================
// src/lib/tts/index.ts
// ----------------------------------------------------------------------------
// TTS provider router.
//
// Picks the right text-to-speech backend based on the voice id that was
// saved on the ai_agents row:
//   - voiceId starts with "aura-"   -> Deepgram  (e.g. "aura-asteria-en")
//   - everything else                -> ElevenLabs (20-char alphanumeric id)
//
// This file REPLACES direct imports of `@/lib/elevenlabs`. Callers should do:
//
//     import { generateSpeech } from "@/lib/tts";
//
// and pass the agent's voice_id. The router figures out which provider.
//
// Design notes:
//   * Both adapters return a Node Readable / Web ReadableStream of audio/mpeg
//     so the calling route can pipe directly into the Telnyx audio response.
//   * Errors from the adapter bubble up unchanged; the caller decides whether
//     to fall back, retry, or 500.
//   * No state in this module. Safe to import from edge and node runtimes.
// ============================================================================

import { generateSpeechElevenLabs } from "./elevenlabs";
import { generateSpeechDeepgram } from "./deepgram";

export type TtsProvider = "elevenlabs" | "deepgram";

export interface GenerateSpeechArgs {
  text: string;
  voiceId: string;
  /** Optional override. Normally the router infers from voiceId. */
  provider?: TtsProvider;
  /** Optional per-call model hint. Adapters ignore if not relevant. */
  model?: string;
  /** Optional per-call voice settings (stability, similarity_boost, etc). */
  voiceSettings?: Record<string, unknown>;
}

export interface GenerateSpeechResult {
  /** MP3 audio bytes, ready to stream back to Telnyx. */
  audio: ReadableStream<Uint8Array> | ArrayBuffer;
  /** Which provider actually served the request. */
  provider: TtsProvider;
  /** Round-trip latency in ms, measured adapter-side. */
  latencyMs: number;
  /** Content-Type to put on the response. Always audio/mpeg today. */
  contentType: string;
}

/**
 * Decide which provider to use for a given voice id.
 *
 * Rule (kept deliberately boring so it's easy to reason about):
 *   - Deepgram voice ids are of the form "aura-<name>-<lang>", e.g.
 *     "aura-asteria-en", "aura-luna-en", "aura-orion-en".
 *   - ElevenLabs voice ids are 20-character alphanumeric strings, e.g.
 *     "21m00Tcm4TlvDq8ikWAM".
 *
 * Anything that doesn't match Deepgram's "aura-" prefix is assumed to be
 * ElevenLabs. If you add a third provider later, widen this function.
 */
export function pickProvider(voiceId: string): TtsProvider {
  if (!voiceId) return "elevenlabs";
  if (voiceId.toLowerCase().startsWith("aura-")) return "deepgram";
  return "elevenlabs";
}

/**
 * Main entry point. Call from the voice routes.
 *
 * Example:
 *   const { audio, contentType } = await generateSpeech({
 *     text: "Hey Mandeep, this is Brandon...",
 *     voiceId: agent.voice_id,
 *   });
 *   return new Response(audio, { headers: { "Content-Type": contentType } });
 */
export async function generateSpeech(
  args: GenerateSpeechArgs
): Promise<GenerateSpeechResult> {
  const provider = args.provider ?? pickProvider(args.voiceId);

  if (provider === "deepgram") {
    return generateSpeechDeepgram(args);
  }
  return generateSpeechElevenLabs(args);
}
