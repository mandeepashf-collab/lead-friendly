import { NextRequest, NextResponse } from "next/server";
import { generateSpeech } from "@/lib/tts";
import crypto from "crypto";

/**
 * GET /api/voice/tts-stream?token=...
 *
 * Stateless TTS endpoint for Telnyx playback_start.
 * The voice webhook generates a signed token containing the text + voiceId,
 * then passes this URL to Telnyx. When Telnyx fetches it, we generate
 * ElevenLabs audio on-the-fly and stream it back.
 *
 * This is serverless-compatible — no shared state between invocations.
 *
 * Token format: base64url({ text, voiceId, ts, sig })
 * Signed with HMAC-SHA256 using TELNYX_API_KEY as secret (always available).
 */

const TOKEN_MAX_AGE_MS = 120_000; // 2 minutes

function getSecret(): string {
  return process.env.TELNYX_API_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "fallback-secret";
}

export function createTTSToken(text: string, voiceId: string, speed?: number, stability?: number): string {
  const payload = { text, voiceId, ts: Date.now(), speed: speed ?? 1.0, stability: stability ?? 0.5 };
  const payloadStr = JSON.stringify(payload);
  const sig = crypto
    .createHmac("sha256", getSecret())
    .update(payloadStr)
    .digest("hex")
    .slice(0, 16); // Short sig — just prevents URL guessing
  const token = Buffer.from(JSON.stringify({ ...payload, sig })).toString("base64url");
  return token;
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return new NextResponse("Missing token", { status: 400 });
  }

  try {
    const decoded = JSON.parse(Buffer.from(token, "base64url").toString("utf-8"));
    const { text, voiceId, ts, sig, speed, stability } = decoded;

    // Verify signature
    const payloadStr = JSON.stringify({ text, voiceId, ts, speed: speed ?? 1.0, stability: stability ?? 0.5 });
    const expectedSig = crypto
      .createHmac("sha256", getSecret())
      .update(payloadStr)
      .digest("hex")
      .slice(0, 16);

    if (sig !== expectedSig) {
      console.error("[tts-stream] Invalid signature");
      return new NextResponse("Invalid token", { status: 403 });
    }

    // Check expiry
    if (Date.now() - ts > TOKEN_MAX_AGE_MS) {
      console.error("[tts-stream] Token expired");
      return new NextResponse("Token expired", { status: 410 });
    }

    if (!text || typeof text !== "string") {
      return new NextResponse("Invalid text", { status: 400 });
    }

    console.log(`[tts-stream] Generating ${text.length} chars, voice: ${voiceId}`);

    const voiceSettings: Record<string, unknown> = {
      stability: typeof stability === "number" ? stability : 0.5,
      similarity_boost: 0.75,
      style: 0,
      use_speaker_boost: true,
      speed: typeof speed === "number" ? speed : 1.0,
    };
    const result = await generateSpeech({ text, voiceId: voiceId || "21m00Tcm4TlvDq8ikWAM", voiceSettings });
    console.log(`[tts-stream] ${result.provider} responded in ${result.latencyMs}ms`);

    // audio can be ReadableStream or ArrayBuffer — normalise to Uint8Array for Content-Length
    const body = result.audio instanceof ArrayBuffer
      ? new Uint8Array(result.audio)
      : result.audio;

    if (body instanceof Uint8Array) {
      return new NextResponse(body, {
        headers: {
          "Content-Type": result.contentType,
          "Content-Length": body.length.toString(),
          "Cache-Control": "no-store",
        },
      });
    }

    // ReadableStream — stream directly without Content-Length
    return new NextResponse(body as ReadableStream, {
      headers: {
        "Content-Type": result.contentType,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[tts-stream] Error:", err);
    return new NextResponse("TTS generation failed", { status: 500 });
  }
}
