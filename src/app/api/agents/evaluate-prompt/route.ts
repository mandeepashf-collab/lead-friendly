import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const SYSTEM_PROMPT = `You are an expert AI voice agent prompt evaluator. Analyze the given voice agent prompt and provide actionable feedback.

Score the prompt 1-100 on these criteria:
- Clarity: Are instructions clear and unambiguous?
- Conversational tone: Does it instruct natural phone conversation?
- Brevity guidance: Does it encourage short, spoken responses?
- Objection handling: Does it cover common objections?
- Goal orientation: Is the call objective clear?
- Safety: Does it have DNC/compliance awareness?

Respond in this exact JSON format:
{
  "score": <number 1-100>,
  "grade": "A" | "B" | "C" | "D" | "F",
  "strengths": ["<strength 1>", "<strength 2>"],
  "improvements": ["<specific actionable improvement 1>", "<specific actionable improvement 2>"],
  "suggested_additions": ["<specific line to add 1>", "<specific line to add 2>"],
  "suggested_prompt": "<the full improved version of the prompt with your suggestions applied>",
  "summary": "<1-2 sentence overall assessment>"
}`

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { prompt, agentName, role } = body as {
      prompt: string
      agentName?: string
      role?: string
    }

    if (!prompt || prompt.trim().length === 0) {
      return NextResponse.json(
        { error: 'Prompt is required' },
        { status: 400 }
      )
    }

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    })

    let userMessage = `Evaluate the following voice agent prompt:\n\n${prompt.trim()}`
    if (agentName) {
      userMessage += `\n\nAgent name: ${agentName}`
    }
    if (role) {
      userMessage += `\nAgent role: ${role}`
    }

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    })

    const rawText =
      message.content[0].type === 'text' ? message.content[0].text : ''

    const cleaned = rawText
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim()

    let parsed
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      console.error('Failed to parse evaluation response:', rawText.substring(0, 500))
      return NextResponse.json(
        { error: 'Failed to parse evaluation result' },
        { status: 500 }
      )
    }

    return NextResponse.json(parsed)
  } catch (err: unknown) {
    console.error('Evaluate prompt error:', err)
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
