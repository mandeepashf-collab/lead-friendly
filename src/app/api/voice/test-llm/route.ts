import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export async function POST(req: NextRequest) {
  try {
    const { messages, system_prompt } = await req.json();
    if (!system_prompt) {
      return NextResponse.json({ error: "system_prompt required" }, { status: 400 });
    }
    const start = Date.now();
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      system: `${system_prompt}\n\nIMPORTANT: Respond as if this is a real live phone call. Keep responses to 1-3 sentences max. Stay in character. No markdown or formatting. Sound natural and human.`,
      messages: messages && messages.length > 0
        ? messages.map((m: { role: string; content: string }) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          }))
        : [{ role: "user", content: "[Call just connected. Begin with your welcome message now.]" }],
    });
    const duration_ms = Date.now() - start;
    const text = response.content[0].type === "text" ? response.content[0].text : "";
    return NextResponse.json({ response: text, duration_ms });
  } catch (err: any) {
    console.error("LLM test error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
