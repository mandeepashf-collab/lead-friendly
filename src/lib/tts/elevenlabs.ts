// ============================================================================
// src/lib/tts/elevenlabs.ts
// ----------------------------------------------------------------------------
// ElevenLabs adapter for the TTS router.
//
// Uses the Flash v2.5 model by default (low-latency, good for phone calls).
// Streams audio/mpeg back to the caller.
//
// Env vars:
//   ELEVENLABS_API_KEY   required
//   ELEVENLABS_MODEL_ID  optional, defaults to "eleven_flash_v2_5"
//
// Retry policy:
//   * One immediate retry on 429 / 5xx after a short jittered backoff.
//   * After the second failure, throws so the caller can decide what to do
//     (e.g. fall back to a hold message or end the call).
// ============================================================================

import type { GenerateSpeechArgs, GenerateSpeechResult } from "./index";

const DEFAULT_MODEL = "eleven_flash_v2_5";
const ENDPOINT = (voiceId: string) =>
  `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream`;

export async function generateSpeechElevenLabs(
  args: GenerateSpeechArgs
): Promise<GenerateSpeechResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ELEVENLABS_API_KEY is not set. Add it in Vercel → Settings → Environment Variables."
    );
  }

  const model =
    args.model ?? process.env.ELEVENLABS_MODEL_ID ?? DEFAULT_MODEL;

  const body = {
    text: args.text,
    model_id: model,
    voice_settings: args.voiceSettings ?? {
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0,
      use_speaker_boost: true,
    },
  };

  const started = Date.now();
  const res = await fetchWithRetry(ENDPOINT(args.voiceId), {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok || !res.body) {
    const errText = await safeReadText(res);
    throw new Error(
      `ElevenLabs TTS failed (${res.status}): ${errText.slice(0, 300)}`
    );
  }

  return {
    audio: res.body,
    provider: "elevenlabs",
    latencyMs: Date.now() - started,
    contentType: "audio/mpeg",
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  attempts = 2
): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, init);
      if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
        if (i < attempts - 1) {
          await jitterDelay(200 + i * 400);
          continue;
        }
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) {
        await jitterDelay(200 + i * 400);
        continue;
      }
    }
  }
  throw lastErr ?? new Error("ElevenLabs TTS request failed after retries");
}

function jitterDelay(baseMs: number): Promise<void> {
  const jitter = Math.floor(Math.random() * 150);
  return new Promise((r) => setTimeout(r, baseMs + jitter));
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "<no body>";
  }
}
