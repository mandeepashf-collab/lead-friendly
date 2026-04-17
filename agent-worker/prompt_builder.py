"""
System prompt builder for Lead Friendly AI voice agents.

Mirrors the buildSystemPrompt logic from src/app/api/voice/answer/route.ts
so the WebRTC agent produces identical behavior to the Telnyx webhook agent.
"""


def build_system_prompt(config: dict) -> str:
    """Build the full system prompt from agent config."""

    name = config.get("name", "Assistant")
    personality = config.get("personality", "")
    base_prompt = config.get("systemPrompt", "")
    objection_handling = config.get("objectionHandling", "")
    knowledge_base = config.get("knowledgeBase", "")
    closing_script = config.get("closingScript", "")
    dnc_phrases = config.get("dncPhrases", [])

    parts: list[str] = []

    # ── Core identity ───────────────────────────────────────────
    parts.append(f"You are {name}, a professional phone agent.")

    if personality:
        parts.append(f"Personality: {personality}")

    # ── Voice call rules ────────────────────────────────────────
    parts.append("""
═══ VOICE CALL RULES ═══
• You are on a LIVE PHONE CALL. Speak naturally like a human — no markdown, no bullets, no special characters.
• ALWAYS respond to what the caller JUST said. Read their words carefully and reply accordingly.
• If the caller answers a question, acknowledge their answer and move forward. NEVER repeat a question they already answered.
• NEVER repeat the same sentence or question twice in a call. If you already asked something, move on.
• Keep responses SHORT: 1-2 sentences max. People on phone calls don't want essays.
• Use conversational fillers naturally: "Got it", "Sure thing", "I see", "Of course".
• If you don't understand, say so briefly: "Sorry, could you say that again?"
• NEVER say "as an AI" or "I'm a language model" or break character.
• Do NOT use any formatting — no asterisks, no bold, no lists. Just natural speech.
""".strip())

    # ── Agent script / base prompt ──────────────────────────────
    if base_prompt:
        parts.append(f"═══ YOUR SCRIPT ═══\n{base_prompt}")

    # ── Objection handling ──────────────────────────────────────
    if objection_handling:
        parts.append(f"═══ OBJECTION HANDLING ═══\n{objection_handling}")

    # ── Knowledge base ──────────────────────────────────────────
    if knowledge_base:
        parts.append(f"═══ KNOWLEDGE BASE ═══\n{knowledge_base}")

    # ── Closing script ──────────────────────────────────────────
    if closing_script:
        parts.append(f"═══ CLOSING SCRIPT ═══\n{closing_script}")

    # ── DNC phrases ─────────────────────────────────────────────
    if dnc_phrases:
        phrase_list = ", ".join(f'"{p}"' for p in dnc_phrases)
        parts.append(
            f"═══ DO NOT CALL ═══\n"
            f"If the caller says any of these phrases, politely end the call: {phrase_list}"
        )

    return "\n\n".join(parts)
