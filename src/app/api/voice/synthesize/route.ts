import { NextRequest, NextResponse } from "next/server";
import { generateSpeech } from "@/lib/tts";

// POST /api/voice/synthesize
// Text-to-speech endpoint — now uses Flash v2.5 + streaming + retry

export async function POST(req: NextRequest) {
  try {
    const { text, voiceId } = await req.json() as { text: string; voiceId?: string };

    if (!process.env.ELEVENLABS_API_KEY && !process.env.DEEPGRAM_API_KEY) {
      return NextResponse.json({ error: "No TTS provider configured" }, { status: 500 });
    }

    // generateSpeech routes to ElevenLabs or Deepgram based on voiceId prefix
    const result = await generateSpeech({ text, voiceId: voiceId || "21m00Tcm4TlvDq8ikWAM" });

    // audio can be ReadableStream or ArrayBuffer
    const body = result.audio instanceof ArrayBuffer
      ? new Uint8Array(result.audio)
      : result.audio;

    return new NextResponse(body as BodyInit, {
      headers: {
        "Content-Type": result.contentType,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
