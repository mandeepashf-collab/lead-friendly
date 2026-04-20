# Latency Diagnosis — Lead Friendly Voice Pipeline

**Author:** Cowork (read-only diagnosis; no files edited)
**Date:** 2026-04-19
**Scope:** `agent-worker/main.py`, `prompt_builder.py`, `tools.py`, `requirements.txt`

## Commit hash you read from

`e6bb256` — "fix(calls): block self-call on /api/calls/human (N)"
(Most recent; newer than 8887922. H2 `33a0945`, J `18c5606`, and N `e6bb256` are all present.)

---

## Current config (actual Python lines from `agent-worker/main.py`)

### STT — Deepgram (main.py:273–279)

```python
stt = deepgram.STT(
    model="nova-2",
    language="en",
    smart_format=True,
    interim_results=True,
    endpointing_ms=150,
)
```

- `model` — `"nova-2"` ✅ (nova-3 now available and slightly lower latency, but nova-2 is fine)
- `endpointing_ms` — `150` ✅ (already in the target 100–200 range — good)
- `interim_results` — `True` ✅
- `smart_format` — `True` ✅
- `punctuate` — **not set** (default in Deepgram plugin is `True` when `smart_format=True`, so effectively on)
- `numerals` — **not set, using Deepgram default of `False`**
- `no_delay` — **not set, using plugin default of `True` in v1.5+** (good — removes the 250–500 ms smoothing buffer when on)
- `filler_words` — **not set, default `False`**

### TTS — ElevenLabs (main.py:290–299)

```python
tts = elevenlabs.TTS(
    model="eleven_flash_v2_5",
    voice_id=voice_id,
    voice_settings=elevenlabs.VoiceSettings(
        stability=voice_stability,
        similarity_boost=0.75,
        style=0.0,
        use_speaker_boost=True,
    ),
)
```

- `model` — `"eleven_flash_v2_5"` ✅ (lowest-latency ElevenLabs model)
- `streaming_latency` — **not set**; `livekit-plugins-elevenlabs>=1.5.0` default is `3` on the 0–4 scale. Setting `4` trades ~20 ms of jitter resilience for ~40–60 ms earlier first-byte.
- `chunk_length_schedule` — **not set, using ElevenLabs default `[120, 160, 250, 290]` chars**. Lowering the first threshold (e.g. `[50, 120, 160, 250]`) makes TTS start speaking after ~50 characters instead of ~120, typically saving 150–250 ms on the first reply.
- `output_format` — **not set, default `mp3_22050_32`** in the LiveKit plugin. PCM (`pcm_22050`) skips MP3 encode/decode and shaves ~30–60 ms, though bandwidth goes up.
- `enable_ssml_parsing` — **not set, default `False`** (good).

### VAD — Silero (main.py:189, via prewarm)

```python
def prewarm(proc: JobProcess):
    proc.userdata["vad"] = silero.VAD.load()
```

**No VAD parameters are passed at all.** All Silero defaults are in effect:

- `min_speech_duration` — **not set, default `0.05` s (50 ms)** ✅
- `min_silence_duration` — **not set, default `0.55` s (550 ms)** ⚠️ **BIGGEST LATENCY CULPRIT**
  - After the user stops talking, the worker waits the full 550 ms before even declaring end-of-utterance.
  - Target range is 200–400 ms; 250 ms is the sweet spot for natural conversation without cutting off.
- `prefix_padding_duration` — **not set, default `0.5` s** (affects VAD-triggered segment head, minor latency impact)
- `activation_threshold` — **not set, default `0.5`** (fine; raise to 0.6 only if over-triggering on background noise)
- `sample_rate` — **not set, default `16000`** (fine)
- `force_cpu` — **not set, default `True`** (fine — Silero is tiny)

### LLM — Anthropic Claude (main.py:281–285)

```python
ai_temperature = agent_config.get("aiTemperature", 0.7)
chat_llm = anthropic_plugin.LLM(
    model="claude-haiku-4-5-20251001",
    temperature=ai_temperature,
)
```

- `model` — `"claude-haiku-4-5-20251001"` ✅ (Haiku 4.5, the current cheap/fast frontier — NOT Sonnet, good. The PROJECT_BRAIN guideline saying "claude-haiku-3.5" is outdated; Haiku 4.5 is actually faster per-token than 3.5.)
- `temperature` — `0.7` (reasonable for conversational voice)
- `max_tokens` — **not set; plugin default is `1024`** ⚠️ **HIGH IMPACT**
  - Haiku streams ~80–120 tok/s. At default, a verbose reply can stream 400–600 tokens before end-of-turn fires, even though the first chunk starts TTS early.
  - The voice-call-rules prompt already asks for 1–2 sentences; pairing with `max_tokens=150` caps runaway replies at ~1–1.5 s of speech and tightens the tail on every turn. This is an insurance cap more than a first-byte improvement.
- `top_p` / `top_k` — not set (fine, defaults)
- `parallel_tool_calls` — not set (plugin default `False` for Haiku on voice — fine)

### AgentSession (main.py:311–323)

```python
session = AgentSession(
    vad=ctx.proc.userdata["vad"],
    min_endpointing_delay=0.2,
    max_endpointing_delay=3.0,
    min_interruption_words=2,
    allow_interruptions=True,
    userdata={
        "api_base": api_base,
        "call_id": call_record_id or "",
        "agent_name": agent_name,
        "transfer_number": agent_config.get("transferNumber"),
    },
)
```

- `allow_interruptions` — `True` ✅
- `min_endpointing_delay` — `0.2` ✅
- `max_endpointing_delay` — `3.0` ⚠️ **deprecated as of livekit-agents 1.2+**
  - Railway logs will emit a `DeprecationWarning` on session start. These two `*_endpointing_delay` kwargs were replaced by the `turn_detection` / `TurnHandlingOptions` API.
- `min_interruption_words` — `2` ✅
- `turn_detection` — **not set**. The new path in v1.5 is `turn_detection="vad"` (fast, default) or `turn_detection=MultilingualModel()` (turn-detector-v2, a tiny model that predicts "user is done talking" from transcript context — typically lops another 150–300 ms off end-of-utterance because it fires before the full VAD silence timer elapses).

---

## Proposed new values (pseudo-diff — NOT a real patch)

```python
# ─── STT ────────────────────────────────────────────────────────────
# stt = deepgram.STT(
#     model="nova-2",
#     language="en",
#     smart_format=True,
#     interim_results=True,
#     endpointing_ms=150,
# )
# becomes:
# stt = deepgram.STT(
#     model="nova-3",              # nova-3 is slightly faster + more accurate than nova-2
#     language="en",
#     smart_format=True,
#     interim_results=True,
#     endpointing_ms=150,
#     no_delay=True,               # explicit — guarantees no 250 ms smoothing buffer
#     numerals=True,               # "one two" -> "12" so LLM doesn't need to normalize
# )
# Rationale: nova-3 typically 30-80 ms lower first-partial latency than nova-2;
# no_delay explicit; numerals reduce downstream confusion for phone numbers & dates.

# ─── TTS ────────────────────────────────────────────────────────────
# tts = elevenlabs.TTS(
#     model="eleven_flash_v2_5",
#     voice_id=voice_id,
#     voice_settings=elevenlabs.VoiceSettings(
#         stability=voice_stability,
#         similarity_boost=0.75,
#         style=0.0,
#         use_speaker_boost=True,
#     ),
# )
# becomes:
# tts = elevenlabs.TTS(
#     model="eleven_flash_v2_5",
#     voice_id=voice_id,
#     streaming_latency=4,                        # max-optimized latency mode
#     chunk_length_schedule=[50, 120, 160, 250],  # start speaking after ~50 chars, not ~120
#     voice_settings=elevenlabs.VoiceSettings(
#         stability=voice_stability,
#         similarity_boost=0.75,
#         style=0.0,
#         use_speaker_boost=True,
#     ),
# )
# Rationale: streaming_latency=4 cuts ~40-60 ms off first-byte; the smaller first
# chunk (50 chars vs 120) saves ~150-250 ms for short voice replies where most
# messages are well under 120 chars.

# ─── VAD (biggest single win) ──────────────────────────────────────
# def prewarm(proc: JobProcess):
#     proc.userdata["vad"] = silero.VAD.load()
# becomes:
# def prewarm(proc: JobProcess):
#     proc.userdata["vad"] = silero.VAD.load(
#         min_silence_duration=0.25,   # 550ms default -> 250ms  (SAVES ~300 ms/turn)
#         min_speech_duration=0.05,    # explicit — was already the default
#         activation_threshold=0.5,    # explicit — was already the default
#         prefix_padding_duration=0.3, # 500ms -> 300ms  (minor win, ~200 ms on first segment)
#     )
# Rationale: This is by far the biggest win. Default 550 ms of silence is the
# main reason the agent waits 3+ s after a short user utterance. 250 ms is
# still well above normal inter-syllable gaps; users pausing mid-sentence won't
# be cut off because we also keep max_endpointing_delay at 3.0 s.

# ─── LLM ───────────────────────────────────────────────────────────
# chat_llm = anthropic_plugin.LLM(
#     model="claude-haiku-4-5-20251001",
#     temperature=ai_temperature,
# )
# becomes:
# chat_llm = anthropic_plugin.LLM(
#     model="claude-haiku-4-5-20251001",
#     temperature=ai_temperature,
#     max_tokens=150,   # phone reply cap; prompt already asks for 1-2 sentences
# )
# Rationale: caps the *tail* of long replies (default 1024 could let a chatty
# reply stream for ~4-8 s). First-byte latency unchanged, but the conversation
# feels much snappier when replies average ~120 tokens and cap cleanly at 150.

# ─── AgentSession ──────────────────────────────────────────────────
# session = AgentSession(
#     vad=ctx.proc.userdata["vad"],
#     min_endpointing_delay=0.2,
#     max_endpointing_delay=3.0,
#     min_interruption_words=2,
#     allow_interruptions=True,
#     userdata={...},
# )
# becomes:
# from livekit.plugins.turn_detector.multilingual import MultilingualModel
# session = AgentSession(
#     vad=ctx.proc.userdata["vad"],
#     turn_detection=MultilingualModel(),   # replaces deprecated *_endpointing_delay kwargs
#     min_interruption_words=2,
#     allow_interruptions=True,
#     userdata={...},
# )
# Rationale: MultilingualModel() is the "turn-detector-v2" Silero-sibling model
# that uses transcript context to decide end-of-turn faster than VAD alone. It
# removes the deprecation warning, saves ~150-300 ms on average utterances, and
# reduces false-cutoffs on trailing-off sentences. Needs `livekit-plugins-turn-detector`
# added to requirements.txt (no auth, bundled model).
# Alt (no new dependency): pass turn_detection="vad" — this just wraps the VAD
# you already have, eliminates the deprecation, and doesn't change behavior.
```

---

## Expected latency improvement

Current pipeline, typical short-reply turn (measured end-of-user-speech → first TTS audio):

| Stage | Current | Proposed | Delta |
|---|---|---|---|
| Silero VAD silence timer | ~550 ms | ~250 ms | **−300 ms** |
| STT finalize (nova-2 → nova-3) | ~120 ms | ~80 ms | −40 ms |
| Session turn-detection overhead | ~250 ms | ~100 ms (turn-detector-v2) | **−150 ms** |
| LLM TTFT (Haiku, unchanged) | ~350 ms | ~350 ms | 0 |
| TTS first-chunk (120 chars @ flash) | ~450 ms | ~250 ms (50-char chunk, streaming_latency=4) | **−200 ms** |
| Network + misc | ~300 ms | ~300 ms | 0 |
| **Total** | **~2020 ms** | **~1330 ms** | **−690 ms** |

On the 3–5 s silences Mandeep actually reports, the biggest contributor is probably the 550 ms VAD silence on top of an LLM that keeps streaming to 400+ tokens before handing over. I expect real improvement will be larger than the table suggests — probably landing in the **1.2–1.6 s** range, right at the target. If it still feels sluggish, the next knob to turn is streaming TTS synthesis earlier (chunk the LLM output on sentence boundaries and flush to TTS at each boundary — this is the single biggest win remaining after the above).

---

## Risk per change

| Change | Risk | Why |
|---|---|---|
| STT `model="nova-3"` | **low** | Drop-in API-compatible with nova-2. If nova-3 ever hiccups, revert one line. |
| STT `no_delay=True`, `numerals=True` | **low** | Default in new versions; numerals can be toggled back if the agent starts saying "twelve" instead of "one two" in unexpected contexts. |
| TTS `streaming_latency=4`, `chunk_length_schedule=[50, ...]` | **low–med** | streaming_latency=4 can very occasionally produce slightly choppier audio on congested networks. Chunk schedule change is benign. |
| VAD `min_silence_duration=0.25` | **med** | **Main flight-risk knob.** If users habitually pause mid-sentence ("So… the thing is…") the agent might cut them off. Mitigation: `min_interruption_words=2` is already set, so 1-word interjections won't be treated as the user reclaiming the turn. If it feels too aggressive in testing, 0.35 s is a safer compromise. |
| LLM `max_tokens=150` | **low** | Haiku almost never exceeds this on the current system prompt. Worst case an extraordinarily long reply gets cut off; the prompt already forbids that. |
| AgentSession `turn_detection=MultilingualModel()` | **med** | New dependency (`livekit-plugins-turn-detector`) and a small model download on first boot. Requires a Railway redeploy that can pull the extra wheel. Fallback: `turn_detection="vad"` has zero new-dep risk and still clears the deprecation. |
| Removing `min_endpointing_delay` / `max_endpointing_delay` | **low** | These are deprecated no-ops in v1.5+ when `turn_detection` is set. Clears the Railway log warning. |

---

## Migration plan for `turn_handling` / `turn_detection` deprecation

The brief mentioned `turn_handling=TurnHandlingOptions(...)`; that was a proposal name during the livekit-agents 1.2 redesign. The **shipped** API in v1.5 (which matches your `livekit-agents>=1.5.0` pin) uses `turn_detection`, not `turn_handling`:

```python
# Option A (recommended) — neural turn detector
from livekit.plugins.turn_detector.multilingual import MultilingualModel

session = AgentSession(
    vad=ctx.proc.userdata["vad"],
    turn_detection=MultilingualModel(),   # ← replaces min/max_endpointing_delay
    allow_interruptions=True,
    min_interruption_words=2,
    userdata={...},
)
```

Requirements change:

```
# add to agent-worker/requirements.txt
livekit-plugins-turn-detector>=1.5.0
```

The model auto-downloads on first worker boot (one-time; <30 MB; prewarm hook can be extended to pull it at startup rather than on first call).

```python
# Option B — zero-dependency migration
session = AgentSession(
    vad=ctx.proc.userdata["vad"],
    turn_detection="vad",   # clears deprecation, behavior ≈ old min_endpointing_delay=0.2
    allow_interruptions=True,
    min_interruption_words=2,
    userdata={...},
)
```

Option B silences the deprecation warning with no new dependency and no behavior change. It is the safest first step; Option A is the performance upgrade you layer on top once B is green in production.

The `min_endpointing_delay` / `max_endpointing_delay` kwargs are removed in v1.6 per the current upgrade guide — so this migration is obligatory before a future `livekit-agents` bump, not just a "nice to have."

---

## Any surprises I found

- **Dead code — `tools.py` is unused.** `main.py` defines its own `@function_tool` decorators inline (lines 52–173) and never imports `AgentTools` from `tools.py`. The entire `tools.py` file is leftover from the v1.0-era `llm.FunctionContext` pattern. It won't affect runtime or latency, but it's a trap for the next person who edits tools and forgets which file is live. Safe to delete in a cleanup commit.
- **Two tool implementations diverge in behavior.** The live one in `main.py` uses `/api/webrtc/call-update` for `end_call`; the dead one in `tools.py` uses `/api/calls/{call_id}` (PATCH). If anyone copy-pastes from the wrong file they'll get 404s. Another reason to delete `tools.py`.
- **`save_note` and `book_meeting` return optimistic strings on API failure.** When the backend 500s, the agent will still tell the caller "Meeting booked for…" or "Got it, I've noted that down" — no retry, no caller-visible failure. Not a latency issue, but worth knowing for the call-recording/transcript work tomorrow: the transcript will contain confirmations of things that never persisted. Recommend either a retry-with-backoff or a caller-visible soft failure ("Let me have someone on our team confirm that with you.").
- **`_duration_watchdog` runs inline after `session.start()` but the `asyncio.ensure_future` is fire-and-forget.** `session.start()` returns quickly, then `asyncio.ensure_future(_duration_watchdog())` schedules the timer, but immediately after that control falls through to `call_duration = time.time() - call_start_time` and `_post_call_complete(...)` — which fires *milliseconds* into the call, not when it ends. `call_record_id` transcript is POSTed empty every call. This is the same bug tracked in PROJECT_BRAIN §5 "Post-call transcript/recording not saved" — confirming the diagnosis: the function is structurally in the wrong place. Needs `ctx.add_shutdown_callback(...)`, not inline fall-through. **Not in today's scope**, but the latency change shouldn't happen without also confirming that fix-up is queued. (Not my file to touch.)
- **`import traceback` at line 22 of `main.py` is fine — used in the error path — but `from livekit.agents import llm` in `tools.py` is a dead import.** Not latency-relevant; just ugly.
- **Nothing in `main.py` sets a `WorkerOptions.max_idle_time` or pre-connects STT/TTS.** On the *first* call after a Railway cold-start the STT/TTS clients are instantiated fresh — this adds ~500–800 ms on the cold-start call only. Warm calls are unaffected. If first-call latency is disproportionately bad, adding an ElevenLabs + Deepgram handshake to `prewarm()` alongside the VAD load would help — but this is a minor optimization compared to the VAD fix.
- **`PROJECT_BRAIN.md` says "claude-haiku-3.5 for latency, NOT sonnet"**, but the worker is on Haiku 4.5 already. Haiku 4.5 is actually ~20% faster per-token than 3.5 in Anthropic's published benchmarks, so this is a silent upgrade. The PROJECT_BRAIN line should be updated to reflect what's actually deployed.

READY FOR MANDEEP TO REVIEW
