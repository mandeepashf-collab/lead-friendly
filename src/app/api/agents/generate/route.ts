import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { description, knowledgeBase } = await request.json()
    if (!description || description.trim().length < 10) {
      return NextResponse.json({ error: 'Description too short' }, { status: 400 })
    }

    const systemPrompt = `You are an expert AI voice agent configurator for a sales platform. A business owner will describe their business. Generate a complete, production-ready AI voice agent configuration.

Respond with ONLY valid JSON — no markdown, no backticks, no explanation. Raw JSON only.

Required JSON structure:
{
  "agentName": "A realistic first name (Alex, Jordan, Maya, Sam, Riley, Casey, Max, Morgan)",
  "personality": "professional OR friendly OR assertive",
  "greeting": "The exact opening line when someone picks up. Natural, 1-2 sentences, mentions company name.",
  "systemPrompt": "Comprehensive prompt 300-500 words. Sections: IDENTITY, QUALIFICATION (4-5 questions, numbered), ROUTING (hot/warm/cold logic), RULES (behavior constraints), END GOAL. Be specific to THIS business — use their actual name, services, hours, location.",
  "objectionHandling": "4-5 objections with natural responses. Format: \\"Objection\\" → \\"Response\\" — one per line.",
  "knowledgeBase": "Structured bullet points of all key business facts: name, location, hours, services, pricing if mentioned, policies, FAQs from uploaded documents."
}

Make the agent sound natural and specific to the business. Never use [placeholder] text in the output — use the actual business details from the description.`

    const userMessage = `Business description:\n${description.trim()}${knowledgeBase ? `\n\nUploaded documents:\n${knowledgeBase}` : ''}`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('Claude API error:', response.status, err)
      return NextResponse.json({ error: err, details: response.status }, { status: 500 })
    }

    const claudeData = await response.json()
    const rawText = claudeData.content?.[0]?.text || ''
    const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

    let parsed
    try {
      parsed = JSON.parse(cleaned)
    } catch (e) {
      console.error('JSON parse failed:', rawText.substring(0, 300))
      return NextResponse.json({ error: 'Failed to parse agent config' }, { status: 500 })
    }

    // Normalise field names — Claude sometimes returns snake_case
    const normalised: Record<string, string> = {
      agentName:         parsed.agentName         || parsed.agent_name         || '',
      personality:       parsed.personality                                      || 'friendly',
      greeting:          parsed.greeting                                          || '',
      systemPrompt:      parsed.systemPrompt      || parsed.system_prompt       || '',
      objectionHandling: parsed.objectionHandling || parsed.objection_handling  || parsed.objections || '',
      knowledgeBase:     parsed.knowledgeBase     || parsed.knowledge_base      || parsed.knowledge  || '',
    }

    // Validate all fields present
    const required = ['agentName','personality','greeting','systemPrompt','objectionHandling']
    for (const field of required) {
      if (!normalised[field]) return NextResponse.json({ error: `Missing: ${field}` }, { status: 500 })
    }

    return NextResponse.json(normalised)
  } catch (err: any) {
    console.error('Generate error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
