# Browser Softphone — Architecture Memo

**Date:** Apr 21, 2026
**Status:** Locked (decisions below). This document is the source of truth for the browser-softphone build.
**Depends on:** Migration 013 applied.

---

## 1. Purpose

Replace the callback-bridge dialer (ring rep's cell → bridge to contact) with a **browser softphone** matching the GoHighLevel / Aircall / Dialpad UX:

- Rep wears a USB headset and talks through the browser
- All audio flows: rep browser → WebRTC → LiveKit room → LiveKit SIP participant → Telnyx trunk → PSTN
- Same media path AI agents already use. The only structural change: the far end of the LiveKit room is a SIP dial-out to a real phone number instead of the `agent-worker` Python process.

---

## 2. Locked decisions (Apr 21)

| # | Decision | Value |
|---|----------|-------|
| 1 | Development cadence | Sequential in a single session today; recording/transcript/forwarding tomorrow |
| 2 | Call recording | **Always on**, no toggle |
| 3 | Transcription | Always on, Deepgram nova-3 async after call ends |
| 4 | Hold | **Deferred to v2** — mute is the MVP substitute |
| 5 | Smart callback routing | **Yes**, both Flow A (rep) and Flow B (AI agent) |
| 6 | Rep cell fallback | **Yes**, when browser is offline |
| 7 | Mobile support | **Desktop only** for MVP (Chrome / Edge / Firefox) |
| 8 | Dock UI | Floating bottom-right (Aircall-style), not sidebar |
| 9 | Outbound CLI | User's own numbers, picker in dock, persist last-used per rep |

---

## 3. Industry baseline (what we're matching)

Every mature browser softphone — Aircall, Dialpad, GHL, JustCall — converges on the same patterns:

- **Lifecycle states:** `idle → initiating → ringing → connected → ending → ended` (+ `failed` branches)
- **Room topology:** 1 call = 1 room = 2 participants (rep browser + SIP-egress leg). Ephemeral.
- **UI surface:** Persistent, always-visible, collapsible dock that survives route changes
- **MVP controls:** Mute, DTMF keypad, hangup, mic picker. Hold + transfer + conference are v2.
- **Recording:** Always-on in modern CRMs. Toggleable recording is a 2015 pattern.
- **Presence:** Explicit status (`available | busy | away | offline`) — schema now, UI can be v2.
- **Tab-switch guard:** Duplicate tabs break WebRTC audio. Industry standard: detect via `BroadcastChannel`, enforce primary tab.

Our wedge is AI-native CRM, not a better softphone than Aircall. The softphone must **not be a reason to churn** — it does not need to innovate on phone UI.

---

## 4. Data model changes (Migration 013)

Migration 013 is additive. Preserves all 160 existing call rows (110 `telnyx` + 50 `webrtc`).

### `calls` table — new columns

| Column | Type | Purpose |
|--------|------|---------|
| `transcript_status` | text (CHECK: pending/processing/completed/failed) | Drives async Deepgram worker |
| `recording_duration_seconds` | integer | Billing, analytics, egress verification |
| `recording_disclosed` | boolean NOT NULL DEFAULT false | WA two-party consent tracking |
| `callback_routing_expires_at` | timestamptz | Smart callback routing TTL |

### `calls.call_type` — new CHECK constraint

Currently free-text. New constraint allows:
- `telnyx` (110 existing rows, legacy TeXML/Telnyx-direct)
- `webrtc` (50 existing rows, rep-browser ↔ AI test calls)
- `webrtc_outbound_pstn` — **rep browser → PSTN** (this build)
- `webrtc_inbound_pstn` — **PSTN → rep browser** (this build)
- `sip_outbound`, `sip_inbound` — forward-compat for explicit LiveKit SIP tagging
- `callback_bridge` — legacy flow

### `calls` — reused existing columns

| Column | How we use it |
|--------|---------------|
| `user_id uuid` | Rep attribution (who initiated the softphone call) |
| `recording_url text` | Supabase Storage URL for the mixed recording |
| `transcript text` | Final transcript from Deepgram |
| `ai_agent_id uuid` | Tells inbound webhook which Flow (A or B) to use |

### `profiles` table — new columns

| Column | Type | Purpose |
|--------|------|---------|
| `cell_phone_e164` | text | Rep's cell for inbound fallback |
| `cell_phone_fallback_enabled` | boolean NOT NULL DEFAULT false | Opt-in to cell fallback |
| `softphone_status` | text (CHECK: available/busy/away/offline) | Presence (UI deferred) |
| `softphone_status_updated_at` | timestamptz | Presence freshness |

### Known tech debt (not addressed by 013)

- `agent_id` vs `ai_agent_id` duplication on `calls`
- `provider` column defaulting to `'retell'` (pre-LiveKit era)
- `transcript` is text, not jsonb (word-level timestamps can't be indexed)

All v2.

---

## 5. Backend API routes

All four routes protected by Supabase session auth + RLS.

### `POST /api/softphone/initiate`

**Request body:**
```json
{ "contactId": "uuid", "fromNumber": "+17196421726" }
```

**Behavior:**
1. Validate caller (rep) is authenticated and belongs to org
2. Validate `fromNumber` is owned by the rep's org
3. Insert `calls` row:
   - `call_type = 'webrtc_outbound_pstn'`
   - `user_id = <authenticated rep>`
   - `direction = 'outbound'`
   - `status = 'initiated'`
   - `from_number = <picker value>`
   - `to_number = <contact's primary phone>`
   - `callback_routing_expires_at = now() + interval '72 hours'`
4. Create LiveKit room: `call_${calls.id}`, `empty_timeout: 0`
5. Mint rep access token (identity: `rep_${user_id}`)
6. Create SIP participant via LiveKit `CreateSIPParticipant` against outbound trunk `ST_afEZKgTV6r9s`, identity `sip_${contact_id}`
7. Start LiveKit Egress → Supabase Storage (`call-recordings/{org_id}/{call_id}.ogg`)
8. Return `{ callId, roomName, token, wsUrl }`

### `POST /api/softphone/hangup`

**Request body:** `{ "callId": "uuid" }`

**Behavior:**
1. Validate caller owns the call row
2. Remove rep from room (triggers SIP BYE automatically)
3. Let the LiveKit webhook handle terminal-state DB updates (see below)
4. Return `{ ok: true }`

### `POST /api/softphone/dtmf`

**Request body:** `{ "callId": "uuid", "digits": "123#" }`

**Behavior:**
1. Validate caller owns the call row and it's still active
2. Forward DTMF to SIP participant via LiveKit server API
3. Return `{ ok: true }`

### `POST /api/livekit/webhook`

**This route fixes the "call rows stuck active post-hangup" bug.**

Receives LiveKit server webhooks. Listens for:
- `room_finished` → mark call `completed`, set `ended_at`, compute `duration_seconds`
- `participant_disconnected` (if SIP participant) → mark call `completed` or `failed` based on disconnect reason
- `egress_ended` → update `recording_url` and `recording_duration_seconds`, set `transcript_status = 'pending'`

**Security:** verify LiveKit webhook signature. Do not trust body without signature match.

The LiveKit webhook is the authoritative source for terminal call state. We stop trusting the browser to report its own death.

---

## 6. Smart callback routing

### Flow A — rep outbound → customer misses → customer calls back

1. Rep initiates outbound to Bob from `+17196421726`
2. Bob doesn't pick up. `calls` row persists with `callback_routing_expires_at = now() + 72h`
3. An hour later Bob calls `+17196421726` back
4. Telnyx → LiveKit-Inbound SIP trunk → our inbound dispatch webhook
5. Webhook queries:
   ```sql
   SELECT user_id, ai_agent_id FROM calls
   WHERE to_number = '+<bob>'
     AND from_number = '+17196421726'
     AND callback_routing_expires_at > now()
   ORDER BY started_at DESC NULLS LAST, created_at DESC
   LIMIT 1
   ```
6. Match returns `user_id` → rep identified
7. If rep's softphone is online (presence = `available`), dispatch call to their browser
8. If offline + `cell_phone_fallback_enabled = true`, SIP dial their cell

### Flow B — AI agent outbound → customer misses → customer calls back

Same query as above. If match returns `ai_agent_id` (user_id null), route to that agent's inbound configuration — agent follows its inbound script.

### No match — fallback to default inbound behavior

Number's default routing applies (currently: Brandon for most, LiveKit-Inbound canary for `+12722194909`).

---

## 7. Recording & transcription pipeline

### Recording

- LiveKit Egress `RoomComposite` starts at call connect
- Destination: Supabase Storage bucket `call-recordings`, path `{org_id}/{call_id}.ogg`
- Single mixed track (stereo: rep-left, customer-right) — useful for diarization later
- Webhook on `egress_ended` updates `calls.recording_url` + `calls.recording_duration_seconds`
- Sets `calls.transcript_status = 'pending'`

### Transcription

- Background worker (Railway, same service as agent-worker or separate) polls:
  ```sql
  SELECT id, recording_url FROM calls
  WHERE transcript_status = 'pending' AND recording_url IS NOT NULL
  ORDER BY ended_at ASC LIMIT 50
  ```
- For each: download recording → Deepgram nova-3 async → store result in `calls.transcript`
- Mark `transcript_status = 'completed'` or `'failed'`

### Cost budget

- Recording storage: ~10 MB/hour at Opus 64kbps → Supabase Storage $0.021/GB/month → trivial at current scale
- Deepgram nova-3: ~$0.0043/min → adds ~$0.26/hour to call cost

---

## 8. Frontend — `<Softphone />` dock

Floating bottom-right. Mounted in root layout (`src/app/layout.tsx`) so it survives route changes.

### Visual states

**Idle pill (48×240):**
- Rep presence indicator (dot)
- Outbound number picker (dropdown of org's numbers, last-used persists to localStorage)
- One click to expand

**Dialing / Ringing (expanded card):**
- Contact name + number
- Elapsed timer since initiate
- Live status label
- Hangup button (red)

**Connected (full dock ~360×480):**
- Contact info at top (name, phone, org if set)
- Elapsed timer
- Recording indicator ("● REC")
- **Mute** toggle
- **DTMF keypad** (12 buttons, also keyboard-bindable)
- **Hangup** button (red, prominent)
- **Mic picker** (device dropdown)
- **Call notes** textarea (auto-saves to `calls.notes` every 2s)
- Disclosure line: "This call is recorded and transcribed"

### Behaviors

- Draggable, position persists to localStorage
- Keyboard shortcut `Cmd/Ctrl+Shift+D` to toggle expand/collapse
- Collapses to pill on route change if call is not active
- On incoming call (future Flow A routing): full expansion, ringtone, Accept/Reject buttons

### Tab-switch guard

- `BroadcastChannel('leadfriendly-softphone')` on mount
- If another tab responds within 100ms: show "Softphone is open in another tab" banner, disable dial button
- Only primary tab holds the LiveKit connection
- Set `navigator.mediaSession` with call metadata during active call → OS media controls show "On a call with [contact]", prevents accidental tab-closes

### Reuse from existing WebRTCCall.tsx

Estimated 60% reusable:
- Room connection logic
- Media track publishing
- Mute handlers
- Device enumeration
- Disconnect cleanup

New:
- SIP participant creation (server-side)
- DTMF send path
- Persistent dock chrome
- Tab-switch guard
- Recording indicator UI
- Call notes autosave

---

## 9. Compliance — WA two-party consent

Washington State requires both parties consent to recording. Mortgage brokers and insurance agents (our ICP) are in recording-aware industries but their customers may not be.

### MVP compliance implementation

1. **Dock UI always shows:** "Calls are recorded and transcribed" disclosure text (near dial button, and again during active call)
2. **Rep-facing onboarding copy:** First-run modal: "Lead Friendly records and transcribes all calls. You must verbally disclose recording to the other party at the start of every call to comply with state law (WA, CA, FL, IL, MD, MA, MT, NV, NH, PA and others require two-party consent)."
3. **AI agent scripts:** All outbound AI agent scripts include the disclosure line at the start
4. **Inbound AI agents:** First utterance includes disclosure
5. **Tracking:** `calls.recording_disclosed` defaults false, flipped true when the rep marks disclosure made OR the AI agent script confirms delivery

This is cheap to add now, expensive to retrofit after a complaint.

---

## 10. Build order — today + tomorrow

### Today (Apr 21)

1. **Memo + migration** (this document) — commit to repo
2. Apply migration 013 — Supabase SQL editor
3. Run verification queries — confirm counts, columns, indexes
4. Build API routes:
   - `POST /api/softphone/initiate`
   - `POST /api/softphone/hangup`
   - `POST /api/softphone/dtmf`
   - `POST /api/livekit/webhook`
5. Smoke-test via curl: trigger a call, verify your cell rings, verify webhook closes the row
6. Build `<Softphone />` dock — idle + connected states
7. Wire mute, DTMF keypad, hangup, mic picker
8. Wire "Call" buttons on `/contacts` and `/people/[id]` to dock
9. Tab-switch guard (`BroadcastChannel`)
10. End-to-end test: browser → real phone number

### Tomorrow (Apr 22)

11. LiveKit Egress recording pipeline
12. Deepgram async transcription worker
13. Callback routing (Flows A + B) — inbound webhook logic
14. Rep-cell fallback for offline browser
15. Full disclosure copy in UI + agent scripts
16. Dogfood: 10 real outbound calls from dock

### Deferred to v2

- Hold (with hold-music track publisher)
- Warm transfer, blind transfer
- Conference (add third party)
- Recording toggle (currently always-on)
- Explicit presence UI
- Voicemail drop
- Click-to-call browser extension
- Power dialer / auto-dialer
- Local presence (area-code matching) — compliance minefield
- Mobile softphone (desktop-only in MVP)

---

## 11. Open risks

- **WA two-party consent** — covered in §9; build disclosure in from day one
- **Telnyx outbound CLI verification** — if numbers aren't verified for caller-ID presentation, carriers strip/replace. Verify before demo calls.
- **LiveKit Egress pricing** — confirm per-minute rate before committing to always-on recording. Adds a line item to the $0.052/min COGS target.
- **iOS Safari** — WebRTC graveyard. MVP is desktop-only. Mobile reps would need a native app, explicitly out of scope.
- **Tab-switch bug** — existing known issue will bite the softphone. The `BroadcastChannel` guard ships with the softphone, not before — they're the same code path.
