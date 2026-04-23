// src/lib/evals/generator.ts
//
// AI-generated starter evals. Reads the agent's instructions, returns 5-10
// proposed criteria as JSON. See architecture memo §3.

import Anthropic from "@anthropic-ai/sdk";

const GENERATOR_MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 1500;

const SYSTEM_PROMPT = `You are designing a quality evaluation suite for an AI voice sales agent. Given the agent's instructions, generate 5-10 specific, testable evaluation criteria that would catch meaningful failures on a real sales call.

Good criteria are:
- Specific (not "be professional" — instead "uses the prospect's name at least once after the first turn")
- Binary (clearly pass/fail on a single transcript, not graded)
- Observable (something a human could verify from the transcript alone, no guessing about intent)
- Tied to the agent's actual stated behavior (not generic best practices)

Return ONLY a JSON array with this exact shape:

[
  {"title": "<short label, 2-8 words>", "criterion": "<one-sentence judge instruction, 10-40 words>"}
]

Rules:
- Generate between 5 and 10 evals. Quality over quantity.
- Each criterion should start with "The agent" and state an observable behavior
- Do NOT include generic fluff like "be helpful" or "be polite"
- Do NOT invent things the agent instructions don't mention
- If the instructions reference specific products, scripts, disclosures, or objection-handling — prioritize those
- Output ONLY the JSON array, no preamble, no markdown fences`;

export interface GeneratorInput {
  agentName: string;
  agentDescription?: string | null;
  systemPrompt: string;
}

export interface GeneratedEval {
  title: string;
  criterion: string;
}

export interface GeneratorResult {
  evals: GeneratedEval[];
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
  error: string | null;
}

export async function generateStarterEvals(
  input: GeneratorInput,
): Promise<GeneratorResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      evals: [],
      inputTokens: null,
      outputTokens: null,
      latencyMs: 0,
      error: "ANTHROPIC_API_KEY missing",
    };
  }

  if (!input.systemPrompt || input.systemPrompt.trim().length < 20) {
    return {
      evals: [],
      inputTokens: null,
      outputTokens: null,
      latencyMs: 0,
      error:
        "Agent has no meaningful system prompt to generate evals from. Add instructions first.",
    };
  }

  const client = new Anthropic({ apiKey });
  const userPrompt = `AGENT NAME: ${input.agentName}
AGENT DESCRIPTION: ${input.agentDescription || "(not provided)"}

AGENT SYSTEM PROMPT / INSTRUCTIONS:
---
${input.systemPrompt}
---

Generate 5-10 evaluation criteria tailored to this specific agent.`;

  const startedAt = Date.now();
  let rawText = "";
  let response: Anthropic.Message | null = null;

  try {
    response = await client.messages.create({
      model: GENERATOR_MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });
    const first = response.content[0];
    if (first && first.type === "text") rawText = first.text;
  } catch (err) {
    return {
      evals: [],
      inputTokens: null,
      outputTokens: null,
      latencyMs: Date.now() - startedAt,
      error: `Anthropic API error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const latencyMs = Date.now() - startedAt;
  const evals = parseEvalList(rawText);

  return {
    evals,
    inputTokens: response?.usage?.input_tokens ?? null,
    outputTokens: response?.usage?.output_tokens ?? null,
    latencyMs,
    error:
      evals.length === 0
        ? `Could not parse eval list from model output: ${rawText.slice(0, 300)}`
        : null,
  };
}

function parseEvalList(text: string): GeneratedEval[] {
  const trimmed = text.trim();

  // Try direct parse, then stripped markdown fences
  const candidates = [
    trimmed,
    trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim(),
  ];

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed)) {
        const valid = parsed
          .filter(
            (e): e is GeneratedEval =>
              e &&
              typeof e === "object" &&
              typeof e.title === "string" &&
              typeof e.criterion === "string" &&
              e.title.trim().length >= 2 &&
              e.title.trim().length <= 120 &&
              e.criterion.trim().length >= 10 &&
              e.criterion.trim().length <= 2000,
          )
          .map((e) => ({
            title: e.title.trim(),
            criterion: e.criterion.trim(),
          }))
          .slice(0, 10);
        if (valid.length > 0) return valid;
      }
    } catch {
      /* fall through */
    }
  }

  return [];
}
