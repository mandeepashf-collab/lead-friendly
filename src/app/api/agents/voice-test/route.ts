import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import Anthropic from "@anthropic-ai/sdk";

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { agent_id, audio_base64, conversation_history = [] } = body as {
      agent_id: string;
      audio_base64: string;
      conversation_history: ConversationMessage[];
    };

    if (!agent_id || !audio_base64) {
      return NextResponse.json({ error: "agent_id and audio_base64 are required" }, { status: 400 });
    }

    // Load agent from DB
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          },
        },
      }
    );

    const { data: agent } = await supabase
      .from("ai_agents")
      .select("name, system_prompt, greeting_message, voice_id")
      .eq("id", agent_id)
      .single();

    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    // Step 1: Transcribe audio with Deepgram
    const deepgramKey = process.env.DEEPGRAM_API_KEY;
    if (!deepgramKey) {
      return NextResponse.json({ error: "DEEPGRAM_API_KEY not configured" }, { status: 500 });
    }

    const audioBuffer = Buffer.from(audio_base64, "base64");

    const dgRes = await fetch(
      "https://api.deepgram.com/v1/listen?model=nova-2&language=en&smart_format=true",
      {
        method: "POST",
        headers: {
          Authorization: `Token ${deepgramKey}`,
          "Content-Type": "audio/webm",
        },
        body: audioBuffer,
      }
    );

    if (!dgRes.ok) {
      const dgErr = await dgRes.text();
      console.error("Deepgram error:", dgErr);
      return NextResponse.json({ error: "Transcription failed" }, { status: 500 });
    }

    const dgData = await dgRes.json();
    const transcript: string =
      dgData?.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";

    if (!transcript.trim()) {
      return NextResponse.json({
        transcript: "",
        agent_response: "",
        audio_base64: "",
        conversation_history,
        silence: true,
      });
    }

    // Step 2: Generate agent response with Claude Haiku
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const systemPrompt = `${agent.system_prompt || "You are a helpful AI assistant."}

IMPORTANT: You are currently in a VOICE test call. Keep responses concise (2-4 sentences max). Speak naturally as if on a phone call. Do not use markdown, bullet points, or formatting — plain speech only.`;

    const updatedHistory: ConversationMessage[] = [
      ...conversation_history,
      { role: "user", content: transcript },
    ];

    const claudeRes = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      system: systemPrompt,
      messages: updatedHistory,
    });

    const agentResponse =
      claudeRes.content[0]?.type === "text" ? claudeRes.content[0].text : "";

    const finalHistory: ConversationMessage[] = [
      ...updatedHistory,
      { role: "assistant", content: agentResponse },
    ];

    // Step 3: Convert agent response to speech with ElevenLabs
    const elevenKey = process.env.ELEVENLABS_API_KEY;
    const voiceId = agent.voice_id || process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";

    let responseAudioBase64 = "";

    if (elevenKey) {
      const elRes = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
        {
          method: "POST",
          headers: {
            "xi-api-key": elevenKey,
            "Content-Type": "application/json",
            Accept: "audio/mpeg",
          },
          body: JSON.stringify({
            text: agentResponse,
            model_id: "eleven_flash_v2_5",
            voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: 1.0 },
          }),
        }
      );

      if (elRes.ok) {
        const audioArrayBuffer = await elRes.arrayBuffer();
        responseAudioBase64 = Buffer.from(audioArrayBuffer).toString("base64");
      } else {
        console.error("ElevenLabs error:", elRes.status, await elRes.text().catch(() => ""));
      }
    }

    return NextResponse.json({
      transcript,
      agent_response: agentResponse,
      audio_base64: responseAudioBase64,
      conversation_history: finalHistory,
      silence: false,
    });
  } catch (err: any) {
    console.error("voice-test error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
