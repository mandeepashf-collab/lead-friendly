# Lead Friendly — WebRTC Phases 2-5 Cowork Tasks

These tasks continue from Phase 1 (completed). Phase 1 built:
- LiveKit Cloud connected (wss://lead-friendly-bc511t0j.livekit.cloud)
- `/api/webrtc/create-call` — bootstrap endpoint
- `/api/webrtc/token` — token refresh
- `/api/webrtc/webhook` — LiveKit webhook receiver
- `src/lib/livekit/server.ts` — server SDK helpers
- `src/lib/livekit/client.ts` — browser SDK helpers
- `agent-worker/` — Python voice agent (main.py, tools.py, prompt_builder.py, Dockerfile)
- DB migration: calls.call_type, calls.livekit_room_id, ai_agents.webrtc_enabled
- Vercel env vars: LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET

---

## PHASE 2: Browser WebRTC Call Component

**Goal:** Add a "WebRTC Call" test method in the agent builder so users can test agents via browser mic/speaker using LiveKit instead of Telnyx phone calls.

### Task 2.1: Create WebRTCCall.tsx component

Create `src/components/agents/WebRTCCall.tsx` — a browser-based voice call component using `livekit-client`.

The component must:
- Accept same props as VoiceTestCall: `{ agentId, agentName, systemPrompt, voiceId }`
- Call `POST /api/webrtc/create-call` to get `{ serverUrl, accessToken, callId, roomName }`
- Create a LiveKit `Room` instance with `{ adaptiveStream: true, dynacast: true, audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true } }`
- Connect to the room with the access token
- Publish local audio track (microphone)
- Subscribe to remote audio tracks (agent voice) and attach to an `<audio>` element
- Listen to `RoomEvent.DataReceived` for transcript updates from the agent worker (JSON: `{ type: "transcript", role: "user"|"assistant", text: string }`)
- Display live transcript
- Show call duration timer
- Mute/unmute mic toggle
- End call button (disconnects room)
- Match the existing dark theme UI (zinc-900/zinc-800 backgrounds, cyan accents)
- Use the same Lucide icons as VoiceTestCall: Mic, MicOff, Volume2, PhoneOff, Phone, Loader2

Reference the existing VoiceTestCall.tsx at `src/components/agents/VoiceTestCall.tsx` for UI patterns and the AudioWaveform and CallAnalysis imports.

### Task 2.2: Add WebRTC test mode to agent builder

In `src/app/(dashboard)/ai-agents/[id]/page.tsx`:

The agent builder already has test methods. In the "Phone & Test" tab, there are sub-tabs for different test modes. Add a new "WebRTC Call" option alongside the existing "Phone Call" option.

Look for where VoiceTestCall is rendered and add a toggle/tab to switch between:
- **Phone Call** (existing Telnyx-based VoiceTestCall)
- **WebRTC Call** (new WebRTCCall component)

Import: `import { WebRTCCall } from "@/components/agents/WebRTCCall";`

The WebRTC option should be the default when available (eventually), but for now keep Phone Call as default with WebRTC as an alternative test method.

### Task 2.3: Verify and deploy

- Run `npx tsc --noEmit` to check for TypeScript errors
- Deploy with `vercel --prod`

---

## PHASE 3: Agent Worker Deployment Setup

**Goal:** Make the Python agent worker deployable so it actually joins LiveKit rooms and handles calls.

### Task 3.1: Create docker-compose.yml for local testing

Create `agent-worker/docker-compose.yml`:
```yaml
version: "3.8"
services:
  agent:
    build: .
    env_file: .env
    restart: unless-stopped
    environment:
      - LIVEKIT_URL=wss://lead-friendly-bc511t0j.livekit.cloud
```

### Task 3.2: Create Railway/Fly.io deployment config

Create `agent-worker/railway.toml`:
```toml
[build]
builder = "dockerfile"
dockerfilePath = "Dockerfile"

[deploy]
startCommand = "python main.py start"
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 10
```

Create `agent-worker/fly.toml`:
```toml
app = "lead-friendly-agent"
primary_region = "iad"

[build]
dockerfile = "Dockerfile"

[processes]
agent = "python main.py start"

[env]
LIVEKIT_URL = "wss://lead-friendly-bc511t0j.livekit.cloud"
```

### Task 3.3: Add health check endpoint to agent worker

Add a simple HTTP health check to `agent-worker/main.py` so deployment platforms can verify the worker is running. The LiveKit Agents framework supports this natively.

### Task 3.4: Create deployment guide

Create `agent-worker/DEPLOY.md` with step-by-step instructions for:
1. Railway deployment (recommended for simplicity)
2. Fly.io deployment (alternative)
3. Docker Compose local testing
4. Required environment variables

---

## PHASE 4: Integration & Polish

**Goal:** Wire up recording, transcripts, call summaries, and dual-stack (Telnyx + WebRTC) support.

### Task 4.1: Add LiveKit Egress recording support

In `agent-worker/main.py`, after the assistant starts:
- If `agentConfig.enableRecording` is true, start a LiveKit Egress room composite recording
- Use the `livekit` Python SDK's EgressServiceClient
- Save to S3 or store the URL in the call record via API callback

### Task 4.2: Post-call summary for WebRTC calls

Create `src/app/api/webrtc/call-complete/route.ts`:
- Called by the agent worker when a call ends
- Receives: callRecordId, transcript array, outcome, duration
- Generates AI summary using Claude Haiku (same as the Telnyx hangup handler in /api/voice/answer)
- Updates the call record with: transcript, notes (AI summary), outcome, status, duration_seconds, ended_at

### Task 4.3: Transcript storage

The agent worker publishes transcript via data channel. Also need to persist it:
- Agent worker should POST transcript entries to `/api/webrtc/call-complete` on call end
- Or write directly to Supabase `call_turns` table from the worker

### Task 4.4: WebRTC toggle in agent settings

In `src/app/(dashboard)/ai-agents/[id]/page.tsx`:
- Add a "WebRTC Enabled" toggle in the Voice & AI Controls section
- Saves to `ai_agents.webrtc_enabled` column
- When enabled, the agent builder defaults to WebRTC Call for testing

### Task 4.5: Update dashboard and reporting

- In the calls list/detail pages, show `call_type` badge ("WebRTC" vs "Phone")
- In reporting, include WebRTC calls in metrics

---

## PHASE 5: Production Hardening

**Goal:** Monitoring, fallback, scaling, and security.

### Task 5.1: LiveKit webhook configuration

In the LiveKit Cloud dashboard (https://cloud.livekit.io/projects/p_5ublcthv8tw):
- Set webhook URL to: `https://www.leadfriendly.com/api/webrtc/webhook`
- Enable events: room_started, room_finished, participant_joined, participant_left, egress_ended

### Task 5.2: Error handling and fallback

In `src/components/agents/WebRTCCall.tsx`:
- Add connection error handling (retry once, then fall back to VoiceTestCall)
- Handle agent worker not joining (timeout after 10 seconds)
- Display clear error messages

In `agent-worker/main.py`:
- Add try/except around the entire entrypoint
- On failure, update the call record status to "failed"
- Add graceful shutdown handling

### Task 5.3: Rate limiting and auth

In `/api/webrtc/create-call`:
- Add authentication check (user must be logged in)
- Add rate limiting (max 5 concurrent WebRTC calls per org)
- Validate agentId belongs to the user's organization

### Task 5.4: Monitoring dashboard

- Add a "WebRTC Health" section to the admin/settings page showing:
  - Active WebRTC rooms count
  - Agent worker status (connected/disconnected)
  - Average latency metrics

### Task 5.5: Cost tracking

- Track WebRTC call minutes separately
- Add LiveKit usage to the billing/wallet system

---

## Execution Order

For a single Cowork session, do Phases 2 + 3 together (browser component + deployment config).
Then Phase 4 (integration).
Then Phase 5 (hardening) can wait until after real testing.

Recommended: **Start with Phase 2** — it gives the most immediate visible result (test calls from browser).
