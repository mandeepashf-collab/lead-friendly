# Lead Friendly — WebRTC Voice Agent Implementation Plan

## Current State vs Target State

### Current Architecture (Telnyx Webhook Loop)
```
User Phone ←→ Telnyx PSTN ←→ Webhook Events (HTTP)
                                    ↓
                            /api/voice/answer
                                    ↓
                     transcription_start (Google STT)
                                    ↓
                     call.transcription webhook
                                    ↓
                     Claude Haiku (API call)
                                    ↓
                     ElevenLabs TTS → playback_start
                                    ↓
                     call.playback.ended → loop
```
**Latency: ~2-4 seconds per turn** (webhook round-trips + STT batch + TTS generation + Telnyx playback)

### Target Architecture (LiveKit WebRTC)
```
Browser/Phone ←→ LiveKit SFU ←→ AI Voice Worker
                  (WebRTC)        (same room)
                                    ↓
                     Deepgram Streaming STT (~100ms)
                                    ↓
                     Claude Haiku Streaming (~250ms first token)
                                    ↓
                     ElevenLabs Streaming TTS (~200ms first audio)
                                    ↓
                     Published back as audio track
```
**Target Latency: ~600-900ms end-of-speech to start-of-response**

---

## Implementation Phases

### Phase 1: LiveKit Infrastructure + Proof of Concept (Week 1)

#### 1.1 Install Dependencies
```bash
npm install livekit-client livekit-server-sdk
pip install livekit livekit-agents livekit-plugins-deepgram livekit-plugins-openai livekit-plugins-elevenlabs
```

#### 1.2 Database Schema Changes
```sql
-- Add WebRTC-related columns
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS webrtc_enabled boolean DEFAULT false;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS call_type text DEFAULT 'telnyx'; -- 'telnyx' | 'webrtc'
ALTER TABLE calls ADD COLUMN IF NOT EXISTS livekit_room_id text;
```

#### 1.3 New Files to Create

| File | Purpose |
|------|---------|
| `src/app/api/webrtc/create-call/route.ts` | Bootstrap endpoint — creates LiveKit room, mints token, dispatches agent worker |
| `src/app/api/webrtc/token/route.ts` | Token refresh endpoint |
| `src/app/api/webrtc/webhook/route.ts` | LiveKit webhook receiver (room events, recording events) |
| `src/lib/livekit/server.ts` | LiveKit server SDK helpers (room creation, token minting) |
| `src/lib/livekit/client.ts` | Browser-side LiveKit connection helpers |
| `src/components/agents/WebRTCCall.tsx` | Browser WebRTC call component (replaces VoiceTestCall for web) |
| `agent-worker/main.py` | Python AI voice worker (LiveKit Agents framework) |
| `agent-worker/pipeline.py` | ASR → LLM → TTS pipeline with streaming |
| `agent-worker/tools.py` | AI tool execution (book_meeting, transfer, etc.) |
| `agent-worker/requirements.txt` | Python dependencies |
| `agent-worker/Dockerfile` | Container for deployment |

#### 1.4 Bootstrap API (`/api/webrtc/create-call`)

```typescript
// POST /api/webrtc/create-call
// Body: { agentId, contactId?, testMode? }
// Returns: { serverUrl, accessToken, callId, roomName }

import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';

export async function POST(req) {
  const { agentId, contactId, testMode } = await req.json();
  
  // 1. Load agent config from DB
  const agent = await loadAgent(agentId);
  
  // 2. Create unique room name
  const roomName = `call_${agentId}_${Date.now()}`;
  
  // 3. Create LiveKit room
  const roomService = new RoomServiceClient(LK_URL, LK_API_KEY, LK_API_SECRET);
  await roomService.createRoom({ name: roomName, emptyTimeout: 300 });
  
  // 4. Mint browser participant token
  const token = new AccessToken(LK_API_KEY, LK_API_SECRET, {
    identity: contactId || `web_user_${Date.now()}`,
    name: 'Caller',
  });
  token.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true });
  
  // 5. Create call record in DB
  const callRecord = await supabase.from('calls').insert({
    ai_agent_id: agentId,
    contact_id: contactId,
    direction: 'inbound',
    status: 'initiated',
    call_type: 'webrtc',
    livekit_room_id: roomName,
  }).select().single();
  
  // 6. Dispatch agent worker (sends room metadata so worker joins)
  await roomService.updateRoomMetadata(roomName, JSON.stringify({
    agentId,
    callRecordId: callRecord.data.id,
    agentConfig: {
      name: agent.name,
      systemPrompt: agent.system_prompt,
      voiceId: agent.voice_id,
      voiceSpeed: agent.voice_speed,
      greeting: agent.greeting_message,
      // ... all agent settings
    }
  }));
  
  return Response.json({
    serverUrl: process.env.LIVEKIT_URL,
    accessToken: await token.toJwt(),
    callId: callRecord.data.id,
    roomName,
  });
}
```

#### 1.5 Environment Variables (add to Vercel)
```
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=APIxxxxx
LIVEKIT_API_SECRET=xxxxx
LIVEKIT_WEBHOOK_SECRET=xxxxx
```

---

### Phase 2: AI Voice Worker (Week 2)

#### 2.1 Python Agent Worker (`agent-worker/main.py`)

```python
"""
Lead Friendly AI Voice Agent Worker
Runs as a LiveKit Agent — joins rooms and handles voice conversations.
Uses: Deepgram STT → Claude Haiku → ElevenLabs TTS
"""

from livekit.agents import (
    AutoSubscribe, JobContext, WorkerOptions, cli, llm
)
from livekit.agents.voice_assistant import VoiceAssistant
from livekit.plugins import deepgram, elevenlabs, anthropic
import json

async def entrypoint(ctx: JobContext):
    # Parse agent config from room metadata
    metadata = json.loads(ctx.room.metadata or '{}')
    agent_config = metadata.get('agentConfig', {})
    
    # Configure STT (Deepgram Nova-2 streaming)
    stt = deepgram.STT(
        model="nova-2",
        language="en",
        smart_format=True,
        interim_results=True,
        endpointing=200,  # 200ms silence = end of utterance
    )
    
    # Configure LLM (Claude Haiku)
    chat_llm = anthropic.LLM(
        model="claude-haiku-4-5-20251001",
        temperature=agent_config.get('ai_temperature', 0.7),
    )
    
    # Configure TTS (ElevenLabs Flash v2.5)
    tts = elevenlabs.TTS(
        model_id="eleven_flash_v2_5",
        voice_id=agent_config.get('voiceId', '21m00Tcm4TlvDq8ikWAM'),
        voice_settings=elevenlabs.VoiceSettings(
            stability=agent_config.get('voice_stability', 0.5),
            similarity_boost=0.75,
            speed=agent_config.get('voice_speed', 1.0),
        ),
    )
    
    # Build system prompt (same logic as buildSystemPrompt in route.ts)
    system_prompt = build_system_prompt(agent_config)
    
    # Create initial chat context
    initial_ctx = llm.ChatContext()
    initial_ctx.append(role="system", text=system_prompt)
    
    # Define tools (book_meeting, transfer_call, end_call)
    tools = build_agent_tools(ctx, metadata)
    
    # Create Voice Assistant
    assistant = VoiceAssistant(
        vad=silero.VAD.load(),     # Voice Activity Detection
        stt=stt,
        llm=chat_llm,
        tts=tts,
        chat_ctx=initial_ctx,
        fnc_ctx=tools,
        interrupt_min_words=2,      # Allow barge-in after 2 words
        min_endpointing_delay=0.5,  # 500ms silence = user done speaking
    )
    
    # Connect to room and start
    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)
    assistant.start(ctx.room)
    
    # Speak greeting
    greeting = agent_config.get('greeting', f"Hi, this is {agent_config.get('name', 'your assistant')}.")
    await assistant.say(greeting, allow_interruptions=True)

if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))
```

#### 2.2 Tool Functions (`agent-worker/tools.py`)

```python
from livekit.agents import llm
import httpx

class AgentTools:
    def __init__(self, api_base_url: str, call_record_id: str, agent_config: dict):
        self.api_base = api_base_url
        self.call_id = call_record_id
        self.config = agent_config
    
    @llm.ai_callable(description="Book a meeting after the lead confirms date and time")
    async def book_meeting(self, date: str, start_time: str, title: str = "", notes: str = ""):
        async with httpx.AsyncClient() as client:
            resp = await client.post(f"{self.api_base}/api/appointments/book", json={
                "call_id": self.call_id,
                "date": date,
                "start_time": start_time,
                "title": title,
                "notes": notes,
            })
        return f"Meeting booked for {date} at {start_time}"
    
    @llm.ai_callable(description="Transfer the call to a human agent")
    async def transfer_call(self, reason: str):
        # Signal the frontend to initiate transfer
        return f"Transferring call: {reason}"
    
    @llm.ai_callable(description="End the call gracefully")
    async def end_call(self, reason: str, outcome: str = "completed"):
        async with httpx.AsyncClient() as client:
            await client.patch(f"{self.api_base}/api/calls/{self.call_id}", json={
                "status": "completed",
                "outcome": outcome,
                "notes": reason,
            })
        return "Call ending"
```

#### 2.3 Deployment (`agent-worker/Dockerfile`)

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["python", "main.py", "start"]
```

Deploy options: Railway, Fly.io, Cloud Run, or a VPS with Docker.

---

### Phase 3: Browser WebRTC Component (Week 2-3)

#### 3.1 WebRTCCall Component (`src/components/agents/WebRTCCall.tsx`)

This replaces VoiceTestCall with a proper LiveKit-based WebRTC connection.

```typescript
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Room, RoomEvent, Track, RemoteTrack,
  createLocalAudioTrack, ConnectionState,
} from 'livekit-client';

interface Props {
  agentId: string;
  agentName: string;
  systemPrompt: string;
  voiceId?: string;
  onCallEnd?: (data: { duration: number; transcript: string[] }) => void;
}

export function WebRTCCall({ agentId, agentName, systemPrompt, voiceId, onCallEnd }: Props) {
  const [connectionState, setConnectionState] = useState<'idle'|'connecting'|'connected'|'disconnected'>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [transcript, setTranscript] = useState<{ role: string; text: string }[]>([]);
  const [duration, setDuration] = useState(0);
  const roomRef = useRef<Room | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  
  const startCall = useCallback(async () => {
    setConnectionState('connecting');
    
    // 1. Get LiveKit token from our API
    const res = await fetch('/api/webrtc/create-call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId, systemPrompt, voiceId }),
    });
    const { serverUrl, accessToken, callId } = await res.json();
    
    // 2. Create and connect to LiveKit room
    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true },
    });
    roomRef.current = room;
    
    // 3. Handle events
    room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
      if (track.kind === Track.Kind.Audio) {
        const el = track.attach();
        document.body.appendChild(el); // auto-play agent audio
      }
    });
    
    room.on(RoomEvent.DataReceived, (payload: Uint8Array) => {
      const msg = JSON.parse(new TextDecoder().decode(payload));
      if (msg.type === 'transcript') {
        setTranscript(prev => [...prev, { role: msg.role, text: msg.text }]);
      }
    });
    
    room.on(RoomEvent.Disconnected, () => {
      setConnectionState('disconnected');
    });
    
    // 4. Connect
    await room.connect(serverUrl, accessToken);
    
    // 5. Publish mic
    const micTrack = await createLocalAudioTrack({ echoCancellation: true, noiseSuppression: true });
    await room.localParticipant.publishTrack(micTrack);
    
    setConnectionState('connected');
  }, [agentId, systemPrompt, voiceId]);
  
  const endCall = useCallback(() => {
    roomRef.current?.disconnect();
    setConnectionState('disconnected');
    onCallEnd?.({ duration, transcript: transcript.map(t => `${t.role}: ${t.text}`) });
  }, [duration, transcript, onCallEnd]);
  
  const toggleMute = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;
    room.localParticipant.audioTrackPublications.forEach(pub => {
      if (pub.track) pub.track.isMuted ? pub.track.unmute() : pub.track.mute();
    });
    setIsMuted(!isMuted);
  }, [isMuted]);
  
  // Duration timer
  useEffect(() => {
    if (connectionState !== 'connected') return;
    const timer = setInterval(() => setDuration(d => d + 1), 1000);
    return () => clearInterval(timer);
  }, [connectionState]);
  
  // ... render call UI with mic button, end call, transcript, duration
}
```

---

### Phase 4: Integration & Polish (Week 3-4)

#### 4.1 Dual-Stack Support
Keep existing Telnyx flow for PSTN calls. Use WebRTC for:
- Browser "Test Audio" (agent builder page)
- Web-based inbound calls (embedded widget)
- Future: mobile SDK

Decision point in the agent builder:
```
Test Methods: [Phone Call] [WebRTC Call] [Chat] [AI Simulation]
```

#### 4.2 Transcript Streaming via DataChannel
The Python agent worker publishes transcript updates to the LiveKit DataChannel:
```python
# In the agent worker, after each STT/LLM turn:
await ctx.room.local_participant.publish_data(
    json.dumps({
        "type": "transcript",
        "role": "user",
        "text": user_utterance,
        "timestamp": time.time(),
    }).encode(),
    reliable=True,
)
```

Browser subscribes via `RoomEvent.DataReceived` and displays real-time transcript.

#### 4.3 Recording via LiveKit Egress
```python
# Start recording when agent joins
from livekit import api

async def start_recording(room_name: str, call_id: str):
    egress = api.EgressServiceClient(LK_URL, LK_API_KEY, LK_API_SECRET)
    await egress.start_room_composite_egress(
        room_name,
        audio_only=True,
        file_outputs=[api.EncodedFileOutput(
            file_type=api.EncodedFileType.OGG,
            filepath=f"recordings/{call_id}.ogg",
            s3=api.S3Upload(bucket="lf-recordings", ...),
        )],
    )
```

#### 4.4 PSTN Bridge (Telnyx SIP → LiveKit)
For outbound phone calls through WebRTC pipeline:
```
Telnyx SIP Trunk → LiveKit SIP Bridge → Same Room as Agent Worker
```
This lets phone calls use the same low-latency pipeline.

---

### Phase 5: Production Hardening (Week 4-5)

#### 5.1 Horizontal Scaling
- Agent workers run as stateless containers (1 worker per concurrent call)
- LiveKit Agents framework auto-dispatches workers to rooms
- Scale: Kubernetes HPA or Railway auto-scaling

#### 5.2 Regional Deployment
- LiveKit Cloud handles multi-region SFU routing
- Agent workers deployed in US-East and US-West
- TURN on 443/TLS for restrictive networks (built into LiveKit)

#### 5.3 Monitoring
- LiveKit provides room-level metrics (jitter, packet loss, latency)
- Custom metrics: STT latency, LLM first-token time, TTS first-audio time
- Alert on p95 latency > 1.5 seconds

#### 5.4 Fallback
- If LiveKit connection fails → fall back to Telnyx webhook flow
- If agent worker crashes → auto-reconnect or graceful hangup message
- Circuit breaker pattern (same as current ElevenLabs fallback)

---

## File Structure (New Files)

```
lead-friendly/
├── src/
│   ├── app/api/
│   │   └── webrtc/
│   │       ├── create-call/route.ts    # Bootstrap: room + token + dispatch
│   │       ├── token/route.ts          # Token refresh
│   │       └── webhook/route.ts        # LiveKit webhook receiver
│   ├── lib/
│   │   └── livekit/
│   │       ├── server.ts               # Server SDK helpers
│   │       └── client.ts               # Browser helpers
│   └── components/agents/
│       └── WebRTCCall.tsx              # Browser WebRTC call component
│
├── agent-worker/                       # Python LiveKit Agent
│   ├── main.py                         # Entrypoint
│   ├── pipeline.py                     # ASR → LLM → TTS pipeline
│   ├── tools.py                        # AI tool functions
│   ├── prompt_builder.py               # System prompt construction
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
```

## Migration Strategy

1. **Phase 1-2**: Build WebRTC as a parallel system (no changes to existing Telnyx flow)
2. **Phase 3**: Add "WebRTC Call" as a new test method in agent builder
3. **Phase 4**: Once validated, make WebRTC the default for web-based calls
4. **Phase 5**: Bridge Telnyx PSTN calls through LiveKit SIP for unified pipeline
5. **Eventually**: Telnyx webhook flow becomes the fallback only

## Cost Comparison

| Component | Current (Telnyx) | WebRTC (LiveKit Cloud) |
|-----------|-----------------|----------------------|
| Media transport | $0.005/min (Telnyx) | $0.004/min (LiveKit Cloud) |
| STT | Free (Telnyx Google) | $0.0043/min (Deepgram Nova-2) |
| LLM | ~$0.001/turn (Haiku) | Same |
| TTS | ~$0.003/turn (ElevenLabs) | Same |
| **Total per minute** | **~$0.01-0.02** | **~$0.01-0.02** |

Cost is similar, but latency drops from 2-4s to under 1s per turn.

## Key Decision: LiveKit Cloud vs Self-Hosted

**Recommendation: Start with LiveKit Cloud, migrate to self-hosted at scale.**

- LiveKit Cloud: $0.004/min, zero ops, multi-region, managed TURN
- Self-hosted: ~$0.001/min at scale, requires K8s ops, TURN management
- Break-even: ~50,000 minutes/month

## Environment Variables Needed

```env
# LiveKit (add to Vercel + agent worker)
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=APIxxxxxx
LIVEKIT_API_SECRET=xxxxxx

# Agent Worker (already have these)
ANTHROPIC_API_KEY=sk-ant-...
ELEVENLABS_API_KEY=...
DEEPGRAM_API_KEY=...   # Need to add this

# Supabase (agent worker needs access)
SUPABASE_URL=https://zdxdcgiwimbhgaqfgbzl.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
```
