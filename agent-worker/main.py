"""
Lead Friendly — AI Voice Agent Worker

LiveKit Agents framework worker that:
  1. Auto-joins rooms matching `call_*` pattern
  2. Reads agent config from room metadata
  3. Runs the ASR → LLM → TTS voice pipeline
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

from dotenv import load_dotenv

load_dotenv()

from livekit import rtc
from livekit.agents import (
    AutoSubscribe,
    JobContext,
    JobProcess,
    WorkerOptions,
    cli,
    llm,
)
from livekit.agents.voice_assistant import VoiceAssistant
from livekit.plugins import deepgram, elevenlabs, silero
from livekit.plugins import anthropic as anthropic_plugin

from prompt_builder import build_system_prompt
from tools import AgentTools

logger = logging.getLogger("lf-agent")
logger.setLevel(logging.INFO)


def prewarm(proc: JobProcess):
    """Pre-load the Silero VAD model on worker startup (before any call)."""
    proc.userdata["vad"] = silero.VAD.load()
    logger.info("VAD model pre-warmed")


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
    contact_id = metadata.get("contactId")

    agent_name = agent_config.get("name", "Assistant")
    logger.info(
        "Joining room=%s agent=%s call=%s",
        ctx.room.name,
        agent_name,
        call_record_id,
    )

    # ── Configure STT (Deepgram Nova-2 streaming) ───────────────
    stt = deepgram.STT(
        model="nova-2",
        language="en",
        smart_format=True,
        interim_results=True,
        endpointing=300,  # 300ms silence = end of utterance
    )

    # ── Configure LLM (Claude Haiku) ────────────────────────────
    ai_temperature = agent_config.get("aiTemperature", 0.7)
    chat_llm = anthropic_plugin.LLM(
        model="claude-haiku-4-5-20251001",
        temperature=ai_temperature,
    )

    # ── Configure TTS (ElevenLabs Flash v2.5) ───────────────────
    voice_id = agent_config.get("voiceId", "21m00Tcm4TlvDq8ikWAM")
    voice_speed = agent_config.get("voiceSpeed", 1.0)
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

    # ── Build system prompt ─────────────────────────────────────
    system_prompt = build_system_prompt(agent_config)

    initial_ctx = llm.ChatContext()
    initial_ctx.append(role="system", text=system_prompt)

    # ── Build tool functions ────────────────────────────────────
    api_base = os.getenv("LEAD_FRIENDLY_API_URL", "https://leadfriendly.com")
    tools = AgentTools(
        api_base_url=api_base,
        call_record_id=call_record_id or "",
        agent_config=agent_config,
    )
    fnc_ctx = tools.create_function_context()

    # ── Create Voice Assistant ──────────────────────────────────
    assistant = VoiceAssistant(
        vad=ctx.proc.userdata["vad"],
        stt=stt,
        llm=chat_llm,
        tts=tts,
        chat_ctx=initial_ctx,
        fnc_ctx=fnc_ctx,
        interrupt_min_words=2,        # Allow barge-in after 2 words
        min_endpointing_delay=0.5,    # 500ms silence = user done speaking
    )

    # ── Track transcript for data channel publishing ────────────
    transcript_log: list[dict] = []
    call_start_time = time.time()

    @assistant.on("user_speech_committed")
    def on_user_speech(msg):
        """User finished speaking — publish transcript update."""
        text = msg.content if hasattr(msg, "content") else str(msg)
        entry = {"role": "user", "text": text, "ts": time.time() - call_start_time}
        transcript_log.append(entry)
        asyncio.ensure_future(_publish_transcript(ctx, entry))

    @assistant.on("agent_speech_committed")
    def on_agent_speech(msg):
        """Agent finished speaking — publish transcript update."""
        text = msg.content if hasattr(msg, "content") else str(msg)
        entry = {"role": "assistant", "text": text, "ts": time.time() - call_start_time}
        transcript_log.append(entry)
        asyncio.ensure_future(_publish_transcript(ctx, entry))

    # ── Connect and start ───────────────────────────────────────
    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)

    assistant.start(ctx.room)
    logger.info("Voice assistant started in room %s", ctx.room.name)

    # ── Speak greeting ──────────────────────────────────────────
    greeting = agent_config.get(
        "greeting",
        f"Hi, this is {agent_name}. How can I help you today?",
    )
    await assistant.say(greeting, allow_interruptions=True)

    # ── Monitor for max duration ────────────────────────────────
    max_duration = agent_config.get("maxDurationMins", 10) * 60

    async def _duration_watchdog():
        await asyncio.sleep(max_duration)
        logger.info("Max duration reached (%ds), ending call", max_duration)
        await assistant.say(
            "I appreciate your time, but I need to wrap up this call. Have a great day!",
            allow_interruptions=False,
        )
        await asyncio.sleep(3)
        await ctx.room.disconnect()

    asyncio.ensure_future(_duration_watchdog())

    # Keep the entrypoint alive until the room closes
    await assistant.join()


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


if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            prewarm_fnc=prewarm,
        )
    )
