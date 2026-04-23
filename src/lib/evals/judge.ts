// src/lib/evals/judge.ts
//
// LLM-as-judge for agent evals. Uses Claude Haiku 4.5 via Anthropic API.
// Returns a structured verdict (PASS/FAIL/INCONCLUSIVE) with a 1-sentence reason.
//
// Parse strategy (3 layers, fall through on failure):
//   1. JSON.parse the response directly
//   2. Strip markdown fences, re-parse
//   3. Regex-extract verdict + reason
//   4. Give up → INCONCLUSIVE with status='failed'
//
// See architecture memo §2 for design rationale.

import Anthropic from "@anthropic-ai/sdk";

const JUDGE_MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 300;

const SYSTEM_PROMPT = `You are an impartial conversation judge evaluating a single criterion against a recorded sales call transcript.

Your job: decide if the criterion was met. Return ONLY a JSON object with this exact shape:

{"verdict": "PASS" | "FAIL" | "INCONCLUSIVE", "reason": "<one sentence, max 200 chars>", "confidence": <number 0.0-1.0>}

Rules:
- PASS = the criterion was clearly met across the call
- FAIL = the criterion was clearly violated at least once
- INCONCLUSIVE = the transcript does not contain enough evidence to decide (e.g., call too short, criterion doesn't apply, transcript cut off)
- "reason" must be ONE sentence in plain English, citing specific behavior from the transcript when possible
- Do not output anything outside the JSON object — no markdown, no preamble, no explanation
- Be strict but fair: a single clear violation = FAIL. Ambiguity = INCONCLUSIVE, not FAIL.`;

export type Verdict = "PASS" | "FAIL" | "INCONCLUSIVE";

export interface JudgeInput {
  criterion: string;
  transcript: string;
  agentName?: string;
  durationSeconds?: number;
}

export interface JudgeResult {
  verdict: Verdict;
  reason: string;
  confidence: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
  rawResponse: unknown;
  parseMethod: "json" | "json-after-strip" | "regex" | "failed";
  status: "completed" | "failed";
  errorMessage: string | null;
}

export async function runJudge(input: JudgeInput): Promise<JudgeResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return buildFailedResult(
      0,
      null,
      "ANTHROPIC_API_KEY missing from environment",
    );
  }

  const client = new Anthropic({ apiKey });

  const userPrompt = buildUserPrompt(input);
  const startedAt = Date.now();

  let rawText = "";
  let response: Anthropic.Message | null = null;

  try {
    response = await client.messages.create({
      model: JUDGE_MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const firstBlock = response.content[0];
    if (firstBlock && firstBlock.type === "text") {
      rawText = firstBlock.text;
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return buildFailedResult(Date.now() - startedAt, null, `Anthropic API error: ${errMsg}`);
  }

  const latencyMs = Date.now() - startedAt;
  const parsed = parseJudgeResponse(rawText);

  if (!parsed) {
    return {
      verdict: "INCONCLUSIVE",
      reason: "Judge returned unparseable output",
      confidence: null,
      inputTokens: response?.usage?.input_tokens ?? null,
      outputTokens: response?.usage?.output_tokens ?? null,
      latencyMs,
      rawResponse: response,
      parseMethod: "failed",
      status: "failed",
      errorMessage: `Unparseable output: ${rawText.slice(0, 500)}`,
    };
  }

  return {
    verdict: parsed.verdict,
    reason: parsed.reason,
    confidence: parsed.confidence,
    inputTokens: response?.usage?.input_tokens ?? null,
    outputTokens: response?.usage?.output_tokens ?? null,
    latencyMs,
    rawResponse: response,
    parseMethod: parsed.parseMethod,
    status: "completed",
    errorMessage: null,
  };
}

function buildUserPrompt(input: JudgeInput): string {
  const header = input.agentName
    ? `CALL TRANSCRIPT (AI agent: ${input.agentName}${input.durationSeconds ? `, duration: ${Math.round(input.durationSeconds)}s` : ""}):`
    : `CALL TRANSCRIPT:`;

  return `CRITERION:
${input.criterion}

${header}
${input.transcript}

Evaluate the criterion against the transcript. Return only the JSON verdict.`;
}

interface ParsedVerdict {
  verdict: Verdict;
  reason: string;
  confidence: number | null;
  parseMethod: "json" | "json-after-strip" | "regex";
}

function parseJudgeResponse(text: string): ParsedVerdict | null {
  const trimmed = text.trim();

  // Layer 1: direct JSON parse
  const direct = tryJson(trimmed);
  if (direct) return { ...direct, parseMethod: "json" };

  // Layer 2: strip markdown fences
  const stripped = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  if (stripped !== trimmed) {
    const afterStrip = tryJson(stripped);
    if (afterStrip) return { ...afterStrip, parseMethod: "json-after-strip" };
  }

  // Layer 3: regex extract
  const verdictMatch = trimmed.match(/"verdict"\s*:\s*"(PASS|FAIL|INCONCLUSIVE)"/i);
  const reasonMatch = trimmed.match(/"reason"\s*:\s*"([^"]+)"/);
  const confidenceMatch = trimmed.match(/"confidence"\s*:\s*([0-9.]+)/);

  if (verdictMatch && reasonMatch) {
    const conf = confidenceMatch ? parseFloat(confidenceMatch[1]) : null;
    return {
      verdict: verdictMatch[1].toUpperCase() as Verdict,
      reason: reasonMatch[1].slice(0, 250),
      confidence: conf !== null && !isNaN(conf) ? clampConfidence(conf) : null,
      parseMethod: "regex",
    };
  }

  return null;
}

function tryJson(text: string): Omit<ParsedVerdict, "parseMethod"> | null {
  try {
    const obj = JSON.parse(text);
    if (
      obj &&
      typeof obj === "object" &&
      typeof obj.verdict === "string" &&
      typeof obj.reason === "string" &&
      ["PASS", "FAIL", "INCONCLUSIVE"].includes(obj.verdict.toUpperCase())
    ) {
      const conf =
        typeof obj.confidence === "number" && !isNaN(obj.confidence)
          ? clampConfidence(obj.confidence)
          : null;
      return {
        verdict: obj.verdict.toUpperCase() as Verdict,
        reason: obj.reason.slice(0, 250),
        confidence: conf,
      };
    }
  } catch {
    /* fall through */
  }
  return null;
}

function clampConfidence(n: number): number {
  return Math.max(0, Math.min(1, Math.round(n * 100) / 100));
}

function buildFailedResult(
  latencyMs: number,
  rawResponse: unknown,
  errorMessage: string,
): JudgeResult {
  return {
    verdict: "INCONCLUSIVE",
    reason: errorMessage.slice(0, 240),
    confidence: null,
    inputTokens: null,
    outputTokens: null,
    latencyMs,
    rawResponse,
    parseMethod: "failed",
    status: "failed",
    errorMessage,
  };
}
