import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import Anthropic from "@anthropic-ai/sdk";

interface SimMessage {
  role: "customer" | "agent";
  content: string;
  turn: number;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { agent_id, scenario, max_turns = 10 } = body as {
      agent_id: string;
      scenario: string;
      max_turns?: number;
    };

    if (!agent_id || !scenario) {
      return NextResponse.json({ error: "agent_id and scenario are required" }, { status: 400 });
    }

    // Load agent
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
      .select("name, system_prompt, greeting_message")
      .eq("id", agent_id)
      .single();

    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const agentSystemPrompt = `${agent.system_prompt || "You are a helpful AI phone agent."}

IMPORTANT: You are in a SIMULATED test call. Keep responses concise (2-4 sentences). Natural phone call speech only — no markdown, no lists, no formatting.`;

    const customerSystemPrompt = `${scenario}

IMPORTANT: You are simulating a customer in a phone call. Keep responses natural and conversational (1-3 sentences). If the conversation reaches a natural conclusion (appointment booked, call ended, etc.) say something like "Okay, sounds good, thank you!" and end naturally. Do not overly extend the conversation.`;

    const simulation: SimMessage[] = [];
    const agentHistory: { role: "user" | "assistant"; content: string }[] = [];
    const customerHistory: { role: "user" | "assistant"; content: string }[] = [];

    // Agent greeting first
    const greetingRes = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 150,
      system: agentSystemPrompt,
      messages: [{ role: "user", content: "__CALL_STARTED__ Answer the phone with your greeting." }],
    });

    const greeting = greetingRes.content[0]?.type === "text" ? greetingRes.content[0].text : "Hello, how can I help you?";
    simulation.push({ role: "agent", content: greeting, turn: 0 });
    agentHistory.push({ role: "assistant", content: greeting });
    customerHistory.push({ role: "user", content: greeting });

    // Conversation loop
    for (let turn = 1; turn <= Math.min(max_turns, 12); turn++) {
      // Customer speaks
      const customerRes = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 150,
        system: customerSystemPrompt,
        messages: customerHistory,
      });

      const customerMsg = customerRes.content[0]?.type === "text" ? customerRes.content[0].text : "";
      if (!customerMsg) break;

      simulation.push({ role: "customer", content: customerMsg, turn });
      customerHistory.push({ role: "assistant", content: customerMsg });
      agentHistory.push({ role: "user", content: customerMsg });

      // Check if customer ended call
      const lowerCustomer = customerMsg.toLowerCase();
      if (
        lowerCustomer.includes("goodbye") ||
        lowerCustomer.includes("bye") ||
        lowerCustomer.includes("hang up") ||
        lowerCustomer.includes("that's all")
      ) {
        break;
      }

      // Agent responds
      const agentRes = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        system: agentSystemPrompt,
        messages: agentHistory,
      });

      const agentMsg = agentRes.content[0]?.type === "text" ? agentRes.content[0].text : "";
      if (!agentMsg) break;

      simulation.push({ role: "agent", content: agentMsg, turn });
      agentHistory.push({ role: "assistant", content: agentMsg });
      customerHistory.push({ role: "user", content: agentMsg });

      // Check if agent ended call
      const lowerAgent = agentMsg.toLowerCase();
      if (
        lowerAgent.includes("have a great day") ||
        lowerAgent.includes("talk soon") ||
        lowerAgent.includes("goodbye") ||
        lowerAgent.includes("take care")
      ) {
        break;
      }
    }

    // Generate analysis
    const fullTranscript = simulation
      .map((m) => `${m.role === "agent" ? "Agent" : "Customer"}: ${m.content}`)
      .join("\n");

    const analysisRes = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      system: `You are an expert at analyzing AI phone agent performance. Be specific and actionable. Return ONLY valid JSON, no markdown.`,
      messages: [
        {
          role: "user",
          content: `Analyze this AI agent simulation call. The agent's configured purpose: "${agent.system_prompt?.slice(0, 200) || "General phone agent"}".

TRANSCRIPT:
${fullTranscript}

Return JSON: {"score": 1-10, "summary": "1-2 sentence summary", "strengths": ["strength1","strength2","strength3"], "improvements": ["improvement1","improvement2","improvement3"], "goal_achieved": true/false, "goal_label": "what goal was achieved or not"}`,
        },
      ],
    });

    let analysis = {
      score: 7,
      summary: "The agent handled the conversation professionally.",
      strengths: ["Maintained professional tone", "Responded to customer needs"],
      improvements: ["Could be more concise", "Ask for contact info"],
      goal_achieved: false,
      goal_label: "Appointment booking",
    };

    try {
      const analysisText = analysisRes.content[0]?.type === "text" ? analysisRes.content[0].text : "{}";
      const cleaned = analysisText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      analysis = JSON.parse(cleaned);
    } catch {
      // Keep default analysis
    }

    return NextResponse.json({ simulation, analysis, turns: simulation.length });
  } catch (err: any) {
    console.error("simulate error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
