# Lead Friendly — Session Handoff (April 17, 2026)

## Project Overview

**Lead Friendly** is a voice AI calling platform for mortgage protection appointment setting. Next.js 16 app deployed on Vercel at `www.leadfriendly.com`, Python LiveKit agent worker on Railway, Supabase for auth/DB, LiveKit Cloud for WebRTC.

## Tech Stack

- **Frontend**: Next.js 16.2.2, React 19, Tailwind CSS 4, TypeScript
- **Auth/DB**: Supabase (SSR auth with `@supabase/ssr`)
- **Voice (Phone)**: LiveKit Agents v1.5.4 (Python worker on Railway), Deepgram STT Nova-2, ElevenLabs TTS Flash v2.5, Claude Haiku LLM
- **Voice (WebRTC)**: `livekit-client` v2.16.1 (browser SDK), LiveKit Cloud (`wss://lead-friendly-bc511t0j.livekit.cloud`, project `p_5ublcthv8tw`)
- **Payments**: Stripe
- **Deployment**: Vercel (frontend), Railway (agent worker)

## Key Files

- `src/components/agents/WebRTCCall.tsx` — Browser WebRTC call component
- `src/app/api/webrtc/create-call/route.ts` — API to bootstrap WebRTC calls (creates room, mints token)
- `src/lib/livekit/server.ts` — LiveKit server helpers (room creation, tokens, webhooks)
- `src/lib/livekit/client.ts` — Browser-side LiveKit helpers
- `src/middleware.ts` — Auth middleware (uses `getUser()` for server-validated auth)
- `next.config.ts` — Security headers including CSP (recently fixed to include LiveKit)
- `agent-worker/main.py` — Python LiveKit agent worker (main entrypoint)
- `agent-worker/prompt_builder.py` — Builds system prompts from agent config
- `agent-worker/tools.py` — Agent tools (book_meeting, transfer_call, etc.)
- `agent-worker/requirements.txt` — Python deps (livekit-agents>=1.5.0)
- `agent-worker/railway.toml` — Railway deploy config
- `agent-worker/Dockerfile` — Docker build for agent worker

## What Was Fixed This Session

### 1. Authentication Bypass (FIXED & DEPLOYED)
- Changed middleware from `getSession()` to `getUser()` for server-side token validation
- Enabled "Confirm email" in Supabase dashboard

### 2. LiveKit Webhook Blocked by Middleware (FIXED & DEPLOYED)
- Added `/api/webrtc/webhook` to PUBLIC_ROUTES in `src/middleware.ts`

### 3. WebRTC Browser Connection Error (FIXED & DEPLOYED)
- **Root cause**: `Content-Security-Policy` in `next.config.ts` did NOT include `*.livekit.cloud` in `connect-src`, so the browser silently blocked ALL connections to LiveKit Cloud
- **Fix**: Added `https://*.livekit.cloud wss://*.livekit.cloud` to `connect-src` and `media-src` in `next.config.ts`
- **Also**: Downgraded `livekit-client` from v2.18.3 to v2.16.1 (pinned, not `^`) to avoid v1 signaling path issues. v2.17+ tries `/rtc/v1` first; LiveKit Cloud returns 400 instead of 404, breaking the SDK's fallback to `/rtc` (v0)
- **Result**: Browser now connects to LiveKit Cloud room successfully. Status changes from "Connecting" to "Waiting for AI agent..." — meaning WebSocket handshake works.

### 4. Agent Worker Redeployed on Railway (DEPLOYED BUT NOT DISPATCHING)
- Worker registers with LiveKit Cloud: `registered worker id="AW_g9zNhFAdUhfW" url="wss://lead-friendly-bc511t0j.livekit.cloud"`
- All plugins load: deepgram, elevenlabs, silero, anthropic v1.5.4
- VAD model pre-warms successfully
- **BUT**: Worker does NOT join rooms when WebRTC calls start. The browser shows "Waiting for AI agent..." indefinitely.

---

## CRITICAL: What Needs Fixing Next

### P0: Agent Worker Not Dispatching to Rooms

**Status**: The worker registers with LiveKit Cloud but never joins rooms created by the frontend.

**What's Working**:
- `/api/webrtc/create-call` API works (returns 200 with serverUrl, accessToken, roomName)
- Rooms are created on LiveKit Cloud with metadata containing agentConfig
- Room names follow pattern: `call_{agentId}_{timestamp}`
- Browser client connects to room successfully
- Agent worker is registered with LiveKit Cloud

**What's NOT Working**:
- Agent worker never receives dispatch / never joins the room
- No logs in Railway after "registered worker" about receiving jobs

**Likely Causes to Investigate**:
1. **LiveKit Agents dispatch rules**: The `WorkerOptions` in `main.py` has no explicit `agent_name` or namespace set. LiveKit Agents v1.5 may require explicit dispatch configuration or the room needs specific metadata for dispatch to work.
2. **Room metadata format**: Check if the agent worker expects specific metadata format for auto-dispatch. The room metadata from `create-call/route.ts` contains `{agentConfig, contactId, callRecordId}`.
3. **LiveKit Cloud agent dispatch settings**: There may be configuration needed in the LiveKit Cloud dashboard (project settings) to enable agent dispatch.
4. **Explicit room-join needed**: The worker may need to explicitly request to join rooms via the LiveKit API rather than relying on auto-dispatch. Check LiveKit Agents v1.5 docs for `JobRequest` and dispatch patterns.
5. **Missing `agent_name` in WorkerOptions**: Try adding `agent_name="lead-friendly"` to WorkerOptions and see if dispatch changes.

**Debug Steps**:
1. Check LiveKit Cloud dashboard → Settings → Agents tab for any dispatch configuration
2. Add more logging to `main.py` before the entrypoint to see if the worker even receives job requests
3. Try creating a room manually via LiveKit API and see if the worker picks it up
4. Check LiveKit Agents v1.5 docs for the correct dispatch pattern — may need `request_fnc` in WorkerOptions
5. Try running the worker locally (`python main.py dev`) with verbose logging to see dispatch attempts

### P1: Agent Response Speed (Phone Calls)
- User reported phone agent is slow to understand and respond
- Likely latency chain: Deepgram STT → Claude Haiku → ElevenLabs TTS
- Investigate: Deepgram endpointing settings, ElevenLabs streaming, agent worker latency
- Check `min_endpointing_delay=0.5` in AgentSession — might be too high or too low

### P2: Brandon Agent Template for New Signups
- New accounts should get a default "Brandon" mortgage protection agent pre-created
- Need to add to signup/onboarding flow

### P3: General Polish & Testing
- End-to-end testing after WebRTC is fully working
- White-label features testing
- Campaign flow testing

---

## Environment Details

### Vercel Environment Variables
- `LIVEKIT_URL` = `wss://lead-friendly-bc511t0j.livekit.cloud`
- `LIVEKIT_API_KEY` = `APIjwpkCnzXf9NF`
- `LIVEKIT_API_SECRET` = (set in Vercel)
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

### Railway Environment Variables (Agent Worker)
- Same LiveKit credentials as Vercel
- `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`, `DEEPGRAM_API_KEY`
- `LEAD_FRIENDLY_API_URL` = `https://www.leadfriendly.com`

### LiveKit Cloud
- Dashboard: `https://cloud.livekit.io/projects/p_5ublcthv8tw`
- Project: `p_5ublcthv8tw`
- Server: `wss://lead-friendly-bc511t0j.livekit.cloud`

### Git
- Repo: `https://github.com/mandeepashf-collab/lead-friendly`
- Branch: `main`
- Latest commit: `112736d` (fix: add LiveKit Cloud to CSP connect-src and media-src)

## Important Notes

1. `vercel --prod` deploys local files directly. Git-triggered deploys build from the latest commit. Always commit+push first, then `vercel --prod`.
2. `livekit-client` is pinned to `2.16.1` (not `^2.16.1`) to prevent auto-upgrading to v2.17+ which has the v1 signaling issue.
3. Supabase "Confirm email" is now enabled — new signups must verify email.
4. Railway agent worker auto-deploys from the repo when you run `railway up` from the `agent-worker` directory.
5. The CSP in `next.config.ts` must be updated whenever you add new external services.
