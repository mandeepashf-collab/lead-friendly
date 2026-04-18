// ============================================================================
// src/lib/tts/deepgram.ts
// ----------------------------------------------------------------------------
// Deepgram Aura adapter for the TTS router.
//
// Deepgram voice ids look like "aura-asteria-en", "aura-luna-en", etc.
// The model goes on the query string; the POST body is JSON { text }.
//
// Env vars:
//   DEEPGRAM_API_KEY   required
//   DEEPGRAM_TTS_URL   optional, defaults to https://api.deepgram.com/v1/speak
//
// Retry policy mirrors the ElevenLabs adapter: one retry on 429/5xx.
// ============================================================================

import type { GenerateSpeechArgs, GenerateSpeechResult } from "./index";

const DEFAULT_URL = "https://api.deepgram.com/v1/speak";

export async function generateSpeechDeepgram(
  args: GenerateSpeechArgs
): Promise<GenerateSpeechResult> {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    throw new Error(
      "DEEPGRAM_API_KEY is not set. Add it in Vercel → Settings → Environment Variables, " +
        "or switch the agent's voice to an ElevenLabs voice id."
    );
  }

  const baseUrl = process.env.DEEPGRAM_TTS_URL ?? DEFAULT_URL;

  // Model (e.g. "aura-asteria-en") goes on the query string.
  // encoding=mp3 keeps the audio format consistent with ElevenLabs so callers
  // don't have to branch on Content-Type.
  const url = new URL(baseUrl);
  url.searchParams.set("model", args.voiceId);
  url.searchParams.set("encoding", "mp3");

  const body = { text: args.text };

  const started = Date.now();
  const res = await fetchWithRetry(url.toString(), {
    method: "POST",
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok || !res.body) {
    const errText = await safeReadText(res);
    throw new Error(
      `Deepgram TTS failed (${res.status}): ${errText.slice(0, 300)}`
    );
  }

  return {
    audio: res.body,
    provider: "deepgram",
    latencyMs: Date.now() - started,
    contentType: "audio/mpeg",
  };
}

// ---------------------------------------------------------------------------
// Helpers (duplicated here deliberately — keeps the two adapters independent
// so you can vendor them into other projects later without cross-imports.)
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
  throw lastErr ?? new Error("Deepgram TTS request failed after retries");
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
