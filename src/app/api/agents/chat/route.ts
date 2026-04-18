import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { systemPrompt, messages, agentName } = await request.json()

    if (!systemPrompt) return NextResponse.json({ error: 'No system prompt' }, { status: 400 })

    // Build voice-optimised system prompt for the simulator
    const voiceSystemPrompt = `${systemPrompt}

SIMULATOR MODE — IMPORTANT RULES:
- You are being tested in a text-based call simulator. Respond exactly as you would on a real phone call.
- Keep responses SHORT — 1-3 sentences max. Phone calls are conversational, not essays.
- Do not use bullet points, headers, or markdown. Speak naturally.
- Do not acknowledge that this is a test or simulator.
- Start with the opening greeting only on the FIRST message (when there are no prior messages).`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system: voiceSystemPrompt,
        messages: messages.map((m: any) => ({
          role: m.role,
          content: m.content,
        })),
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('Chat API error:', response.status, err)
      return NextResponse.json({ error: 'AI error' }, { status: 500 })
    }

    const data = await response.json()
    const reply = data.content?.[0]?.text || ''
    return NextResponse.json({ reply, agentName: agentName || 'Agent' })
  } catch (err: any) {
    console.error('Chat route error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
