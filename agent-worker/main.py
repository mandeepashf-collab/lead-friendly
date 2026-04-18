"""
Lead Friendly — AI Voice Agent Worker (LiveKit Agents v1.5+)

LiveKit Agents framework worker that:
  1. Auto-joins rooms matching `call_*` pattern
  2. Reads agent config from room metadata
  3. Runs the ASR → LLM → TTS voice pipeline via AgentSession
  4. Publishes transcript updates over data channel
  5. Calls back to the Lead Friendly API for tool execution

Usage:
  python main.py start               # Production mode
  python main.py dev                  # Dev mode (auto-reload)
  python main.py start --url <URL>    # Connect to specific LiveKit server
"""

import asyncio
import json
import logging
import os
import time
import traceback

import httpx
from dotenv import load_dotenv

load_dotenv()

from livekit.agents import (
    Agent,
    AgentSession,
    AutoSubscribe,
    JobContext,
    JobProcess,
    RunContext,
    WorkerOptions,
    cli,
    function_tool,
)
from livekit.plugins import deepgram, elevenlabs, silero
from livekit.plugins import anthropic as anthropic_plugin

from prompt_builder import build_system_prompt

logger = logging.getLogger("lf-agent")
logger.setLevel(logging.INFO)


# ── Agent Tools ─────────────────────────────────────────────────────
# Defined as standalone @function_tool functions (v1.5 pattern)

@function_tool(
    description=(
        "Book a meeting/appointment after the lead confirms a date and time. "
        "Call this when the person agrees to schedule."
    ),
)
async def book_meeting(
    context: RunContext,
    date: str,
    start_time: str,
    title: str = "",
    notes: str = "",
) -> str:
    """Book an appointment for the lead."""
    ud = context.userdata
    logger.info("book_meeting date=%s time=%s", date, start_time)
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"{ud['api_base']}/api/appointments/book",
                json={
                    "call_id": ud["call_id"],
                    "date": date,
                    "start_time": start_time,
                    "title": title or f"Appointment for {ud['agent_name']}",
                    "notes": notes,
                },
                headers=_api_headers(),
            )
            if resp.status_code < 300:
                return f"Meeting booked for {date} at {start_time}. Confirmation sent."
            else:
                logger.error("book_meeting API error: %s", resp.text[:200])
                return f"I've noted the appointment for {date} at {start_time}. Our team will confirm shortly."
    except Exception as e:
        logger.error("book_meeting failed: %s", e)
        return f"I've noted the appointment for {date} at {start_time}. Our team will confirm shortly."


@function_tool(
    description=(
        "Transfer the call to a human agent or specific phone number. "
        "Use when the caller requests to speak with someone or the conversation "
        "requires human intervention."
    ),
)
async def transfer_call(context: RunContext, reason: str) -> str:
    """Transfer the call to a human representative."""
    ud = context.userdata
    transfer_number = ud.get("transfer_number")
    logger.info("transfer_call reason=%s number=%s", reason, transfer_number)
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            await client.post(
                f"{ud['api_base']}/api/calls/{ud['call_id']}/transfer",
                json={"reason": reason, "transfer_number": transfer_number},
                headers=_api_headers(),
            )
    except Exception as e:
        logger.warning("transfer_call API notification failed: %s", e)

    if transfer_number:
        return "Transferring you now. One moment please."
    else:
        return "Let me connect you with a team member. One moment please."


@function_tool(
    description=(
        "End the call gracefully. Use when the conversation is naturally "
        "concluding, the caller wants to hang up, or the call objective is met."
    ),
)
async def end_call(
    context: RunContext,
    reason: str,
    outcome: str = "completed",
) -> str:
    """End the call and update the call record."""
    ud = context.userdata
    logger.info("end_call reason=%s outcome=%s", reason, outcome)
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            await client.patch(
                f"{ud['api_base']}/api/webrtc/call-update",
                json={
                    "callRecordId": ud["call_id"],
                    "status": "completed",
                    "outcome": outcome,
                    "notes": reason,
                },
                headers=_api_headers(),
            )
    except Exception as e:
        logger.warning("end_call API update failed: %s", e)
    return "Call ending. Goodbye!"


@function_tool(
    description=(
        "Save a note or piece of information collected during the call. "
        "Use to record important details the caller shares."
    ),
)
async def save_note(
    context: RunContext,
    note: str,
    category: str = "general",
) -> str:
    """Save a note about the call."""
    ud = context.userdata
    logger.info("save_note category=%s note=%s", category, note[:80])
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            await client.post(
                f"{ud['api_base']}/api/calls/{ud['call_id']}/notes",
                json={"note": note, "category": category},
                headers=_api_headers(),
            )
    except Exception as e:
        logger.warning("save_note API failed: %s", e)
    return "Got it, I've noted that down."


def _api_headers() -> dict[str, str]:
    """Build auth headers for internal API calls."""
    headers: dict[str, str] = {"Content-Type": "application/json"}
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    if service_key:
        headers["x-service-key"] = service_key
    return headers


# ── Prewarm ─────────────────────────────────────────────────────────

def prewarm(proc: JobProcess):
    """Pre-load the Silero VAD model on worker startup (before any call)."""
    proc.userdata["vad"] = silero.VAD.load()
    logger.info("VAD model pre-warmed")


# ── Entrypoint ──────────────────────────────────────────────────────

async def entrypoint(ctx: JobContext):
    """
    Main entrypoint — runs once per call (per LiveKit room).

    The room metadata (set by /api/webrtc/create-call) contains:
      {
        agentConfig: { name, systemPrompt, voiceId, ... },
        contactId: string | null,
        callRecordId: string,
      }
    """

    # ── Parse room metadata ─────────────────────────────────────
    raw_metadata = ctx.room.metadata or "{}"
    try:
        metadata = json.loads(raw_metadata)
    except json.JSONDecodeError:
        logger.error("Failed to parse room metadata: %s", raw_metadata[:200])
        metadata = {}

    agent_config = metadata.get("agentConfig", {})
    call_record_id = metadata.get("callRecordId")
    api_base = os.getenv("LEAD_FRIENDLY_API_URL", "https://www.leadfriendly.com")

    try:
        await _run_voice_session(ctx, agent_config, call_record_id, api_base)
    except Exception as e:
        logger.error(
            "Voice session failed for call=%s: %s\n%s",
            call_record_id,
            e,
            traceback.format_exc(),
        )
        # Mark call as failed via API
        if call_record_id:
            try:
                async with httpx.AsyncClient(timeout=15) as client:
                    await client.post(
                        f"{api_base}/api/webrtc/call-update",
                        json={
                            "callRecordId": call_record_id,
                            "status": "failed",
                            "notes": f"Agent error: {str(e)[:200]}",
                        },
                        headers=_api_headers(),
                    )
            except Exception:
                logger.warning("Failed to mark call as failed in API")


async def _run_voice_session(
    ctx: JobContext,
    agent_config: dict,
    call_record_id: str | None,
    api_base: str,
):
    """Inner session logic — separated so entrypoint can catch errors."""

    agent_name = agent_config.get("name", "Assistant")
    logger.info(
        "Joining room=%s agent=%s call=%s",
        ctx.room.name,
        agent_name,
        call_record_id,
    )

    # ── Build system prompt ─────────────────────────────────────
    system_prompt = build_system_prompt(agent_config)

    # ── Configure plugins ───────────────────────────────────────
    stt = deepgram.STT(
        model="nova-2",
        language="en",
        smart_format=True,
        interim_results=True,
        endpointing=300,
    )

    ai_temperature = agent_config.get("aiTemperature", 0.7)
    chat_llm = anthropic_plugin.LLM(
        model="claude-haiku-4-5-20251001",
        temperature=ai_temperature,
    )

    voice_id = agent_config.get("voiceId", "21m00Tcm4TlvDq8ikWAM")
    voice_stability = agent_config.get("voiceStability", 0.5)

    tts = elevenlabs.TTS(
        model_id="eleven_flash_v2_5",
        voice_id=voice_id,
        voice_settings=elevenlabs.VoiceSettings(
            stability=voice_stability,
            similarity_boost=0.75,
            style=0.0,
            use_speaker_boost=True,
        ),
    )

    # ── Create Agent with tools ─────────────────────────────────
    agent = Agent(
        instructions=system_prompt,
        tools=[book_meeting, transfer_call, end_call, save_note],
        stt=stt,
        llm=chat_llm,
        tts=tts,
    )

    # ── Create AgentSession ─────────────────────────────────────
    session = AgentSession(
        vad=ctx.proc.userdata["vad"],
        min_endpointing_delay=0.5,
        min_interruption_words=2,
        allow_interruptions=True,
        userdata={
            "api_base": api_base,
            "call_id": call_record_id or "",
            "agent_name": agent_name,
            "transfer_number": agent_config.get("transferNumber"),
        },
    )

    # ── Track transcript ────────────────────────────────────────
    transcript_log: list[dict] = []
    call_start_time = time.time()

    @session.on("user_input_transcribed")
    def on_user_speech(ev):
        """User finished speaking — log transcript."""
        text = ev.transcript if hasattr(ev, "transcript") else str(ev)
        if not text or not text.strip():
            return
        entry = {"role": "user", "text": text, "ts": time.time() - call_start_time}
        transcript_log.append(entry)
        # Publish transcript to browser via data channel
        asyncio.ensure_future(_publish_transcript(ctx, entry))

    @session.on("agent_state_changed")
    def on_agent_state(ev):
        """Track agent speech for transcript."""
        pass  # Transcript is captured via speech events below

    @session.on("conversation_item_added")
    def on_item_added(ev):
        """Capture agent responses in transcript."""
        item = ev.item if hasattr(ev, "item") else ev
        if hasattr(item, "role") and item.role == "assistant":
            text = ""
            if hasattr(item, "text_content"):
                text = item.text_content
            elif hasattr(item, "content") and isinstance(item.content, str):
                text = item.content
            elif hasattr(item, "content") and isinstance(item.content, list):
                for c in item.content:
                    if hasattr(c, "text"):
                        text += c.text
            if text and text.strip():
                entry = {"role": "assistant", "text": text, "ts": time.time() - call_start_time}
                transcript_log.append(entry)
                asyncio.ensure_future(_publish_transcript(ctx, entry))

    # ── Connect and start ───────────────────────────────────────
    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)

    await session.start(
        agent=agent,
        room=ctx.room,
    )
    logger.info("Agent session started in room %s", ctx.room.name)

    # ── Speak greeting ──────────────────────────────────────────
    greeting = agent_config.get(
        "greeting",
        f"Hi, this is {agent_name}. How can I help you today?",
    )
    await session.generate_reply(instructions=f"Say exactly this greeting: {greeting}")

    # ── Monitor for max duration ────────────────────────────────
    max_duration = agent_config.get("maxDurationMins", 10) * 60

    async def _duration_watchdog():
        await asyncio.sleep(max_duration)
        logger.info("Max duration reached (%ds), ending call", max_duration)
        await session.generate_reply(
            instructions="Say: I appreciate your time, but I need to wrap up this call. Have a great day!"
        )
        await asyncio.sleep(3)
        await ctx.room.disconnect()

    asyncio.ensure_future(_duration_watchdog())

    # Keep the entrypoint alive until the room closes
    await session.wait_for_close()

    # ── Post-call: persist transcript + get AI summary ─────────
    call_duration = time.time() - call_start_time
    await _post_call_complete(
        api_base=api_base,
        call_record_id=call_record_id,
        transcript_log=transcript_log,
        duration=call_duration,
    )


async def _publish_transcript(ctx: JobContext, entry: dict):
    """Send a transcript entry to all participants via data channel."""
    try:
        payload = json.dumps({"type": "transcript", **entry}).encode("utf-8")
        await ctx.room.local_participant.publish_data(
            payload,
            reliable=True,
        )
    except Exception as e:
        logger.warning("Failed to publish transcript: %s", e)


async def _post_call_complete(
    api_base: str,
    call_record_id: str | None,
    transcript_log: list[dict],
    duration: float,
):
    """POST transcript + metadata to the Lead Friendly API for summary generation."""
    if not call_record_id:
        logger.warning("No call_record_id — skipping post-call completion")
        return

    url = f"{api_base}/api/webrtc/call-complete"
    payload = {
        "callRecordId": call_record_id,
        "transcript": transcript_log,
        "duration": duration,
        "endReason": "call_ended",
    }

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(url, json=payload, headers=_api_headers())
            if resp.status_code < 300:
                logger.info(
                    "Post-call complete for call=%s (turns=%d, duration=%.0fs)",
                    call_record_id,
                    len(transcript_log),
                    duration,
                )
            else:
                logger.error(
                    "Post-call API error %d: %s",
                    resp.status_code,
                    resp.text[:300],
                )
    except Exception as e:
        logger.error("Post-call API request failed: %s\n%s", e, traceback.format_exc())


if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            prewarm_fnc=prewarm,
        )
    )
