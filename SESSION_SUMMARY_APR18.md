# Lead Friendly — Full Session Summary (April 17–18, 2026)

## Owner: Mandeep Rao (mandeepashf@gmail.com)

---

## PROJECT

**Lead Friendly** — a voice AI calling platform for mortgage protection appointment setting. Users create AI agents (like "Brandon" for mortgage protection), upload contacts, run calling campaigns, and the AI agent handles live phone conversations to book appointments.

**Live site:** https://www.leadfriendly.com
**Git repo:** github.com/mandeepashf-collab/lead-friendly (branch: main)

---

## TECH STACK

| Layer | Tech | Where |
|-------|------|-------|
| Frontend | Next.js 16.2.2, React 19, Tailwind CSS 4, TypeScript | Vercel |
| Auth & DB | Supabase (SSR auth with `@supabase/ssr`) | Supabase Cloud |
| Voice (Phone) | LiveKit Agents v1.5.4, Deepgram STT Nova-2, ElevenLabs TTS Flash v2.5, Claude Haiku | Railway (Python worker) |
| Voice (WebRTC) | livekit-client v2.16.1 (browser), LiveKit Cloud | LiveKit Cloud |
| Payments | Stripe | Stripe |

**LiveKit Cloud:** wss://lead-friendly-bc511t0j.livekit.cloud, project p_5ublcthv8tw
**Deployment:** `vercel --prod` (frontend), `railway up` from agent-worker/ (Python worker)

---

## ALL FIXES APPLIED — CHRONOLOGICAL

### Commit 81bdb08 — Auth + Webhook + Signaling
- Changed Supabase auth middleware from `getSession()` to `getUser()` for server-validated auth
- Added `/api/webrtc/webhook` to PUBLIC_ROUTES in middleware.ts
- Enabled "Confirm email" in Supabase dashboard

### Commit 0c38342 — LiveKit Client Downgrade
- Pinned `livekit-client` to `2.16.1` (was `^2.18.3`)
- v2.17+ tries `/rtc/v1` signaling path first; LiveKit Cloud returns 400 instead of 404, breaking the SDK's fallback to `/rtc` (v0)

### Commit 112736d — CSP Fix (ROOT CAUSE of WebRTC "Failed to Fetch")
- Added `https://*.livekit.cloud wss://*.livekit.cloud` to Content-Security-Policy `connect-src` and `media-src` in `next.config.ts`
- This was the actual reason the browser couldn't connect to LiveKit — CSP was silently blocking all external connections

### Commit 31edb3a — Explicit Agent Dispatch (First Attempt)
- Added `agent_name="lead-friendly"` to Python WorkerOptions in `agent-worker/main.py`
- Added `RoomAgentDispatch` in the `agents` array of `createRoom()` call
- Added Deepgram endpointing_ms=150, min_endpointing_delay=0.2, max_endpointing_delay=3.0
- **Result:** Still didn't work — `agents` array in CreateRoomRequest doesn't trigger dispatch

### Commit f5c1f16 — AgentDispatchClient Fix + Bug Fixes
- **AGENT DISPATCH:** Discovered that `RoomAgentDispatch` in `createRoom()` does NOT trigger worker dispatch. LiveKit docs say you need either `AgentDispatchClient.createDispatch()` (server API) or `RoomAgentDispatch` in the participant's access token
- Added `AgentDispatchClient` singleton and `dispatchAgent()` function to `src/lib/livekit/server.ts`
- Updated `create-call/route.ts` to call `dispatchAgent(roomName, "lead-friendly", fullMetadata)` after room creation
- **APPOINTMENT FIX:** Added UUID validation in `createAppointment()` and `updateAppointment()` — coerces non-UUID `assigned_to` values to null instead of crashing Postgres
- **LENDER NAME FIX:** Created `supabase/migrations/010_contacts_lender_name.sql` — adds the `lender_name` column that the frontend sends but the DB never had

### Commit fd8ce99 — Agent Dispatch Hardened + Diag Endpoint (Overnight Session)
- Added token-based dispatch as belt-and-suspenders: `RoomAgentDispatch` embedded in participant access token via `RoomConfiguration`
- Created `/api/webrtc/diag` endpoint to verify LiveKit env-var fingerprints match between Vercel and Railway
- Now dispatch is attempted three ways: (1) AgentDispatchClient.createDispatch(), (2) token-embedded RoomAgentDispatch, (3) worker's auto-dispatch as fallback

### Commit f4c8f4d — Unified Call Stats (Overnight Session)
- Created `supabase/migrations/011_call_stats_view.sql` — single DB view for all call statistics
- Created `src/app/api/stats/calls/route.ts` — unified stats API endpoint
- Created `src/hooks/use-call-stats.ts` — React hook for call stats
- Updated Dashboard, Call Logs, AI Agents, and Billing to use the same data source
- Fixed call duration computation (was showing 0:00)
- Fixed "Unknown" contacts in Call Logs (reverse-lookup from phone number)

### Commit b9c2295 — Voice ID Display Names (Overnight Session)
- Created `src/lib/voices.ts` — mapping of ElevenLabs voice IDs to friendly names (Rachel, Adam, Bella, etc.)
- Updated AI Agents list page and detail page to show voice names instead of raw IDs

---

## DATABASE MIGRATIONS TO RUN

Run these in Supabase SQL Editor if not already done:

1. **`supabase/migrations/010_contacts_lender_name.sql`**
   ```sql
   ALTER TABLE contacts ADD COLUMN IF NOT EXISTS lender_name text;
   ```

2. **`supabase/migrations/011_call_stats_view.sql`** — creates the unified call stats view (check file for full SQL)

---

## FILES CREATED/MODIFIED THIS SESSION

### New Files
| File | Purpose |
|------|---------|
| `src/app/api/webrtc/diag/route.ts` | LiveKit diagnostic endpoint — verifies env vars match |
| `src/app/api/stats/calls/route.ts` | Unified call statistics API |
| `src/hooks/use-call-stats.ts` | React hook for unified call stats |
| `src/lib/voices.ts` | ElevenLabs voice ID → friendly name mapping |
| `supabase/migrations/010_contacts_lender_name.sql` | Adds lender_name column to contacts |
| `supabase/migrations/011_call_stats_view.sql` | Unified call stats DB view |
| `HANDOFF.md` | Project handoff document |
| `AUDIT_DAY2.md` | Day 2 bug audit (10 items, ranked P0–P2) |
| `AUDIT_DAY2_DEEP.md` | Deep analysis: Contact Detail spec, Maya prompt, Automations fixes, Design System |
| `COWORK_TASK.md` | Prioritized task list for overnight/next sessions |
| `SESSION_FIX_PLAN.md` | Fix plan from first overnight session |

### Modified Files
| File | What Changed |
|------|-------------|
| `next.config.ts` | Added LiveKit Cloud to CSP connect-src and media-src |
| `package.json` | Pinned livekit-client to 2.16.1 |
| `src/middleware.ts` | Added webhook to PUBLIC_ROUTES, uses getUser() |
| `src/lib/livekit/server.ts` | Added AgentDispatchClient, dispatchAgent(), token-based dispatch |
| `src/app/api/webrtc/create-call/route.ts` | Reordered to create call record first, added dispatchAgent() call |
| `src/hooks/use-appointments.ts` | UUID validation for assigned_to and contact_id |
| `src/hooks/use-calls.ts` | Updated to use unified stats |
| `src/app/(dashboard)/page.tsx` (or dashboard/page.tsx) | Uses unified call stats |
| `src/app/(dashboard)/ai-agents/page.tsx` | Voice ID friendly names |
| `src/app/(dashboard)/ai-agents/[id]/page.tsx` | Voice ID friendly names |
| `agent-worker/main.py` | Added agent_name="lead-friendly", Deepgram endpointing, latency tuning |

---

## CURRENT GIT STATE

Latest commit: `b9c2295` — "P2: map voice IDs to friendly names"

All commits on branch `main`, pushed to origin.

---

## WHAT'S STILL OPEN (P3–P8)

### P3: Contact Detail Page (BIGGEST structural gap)
Currently no way to see all interactions with a contact. Need `/contacts/[id]` page with identity card sidebar, tabbed main area (Timeline, Conversations, Calls, Deals, Tasks, Custom Fields). Full spec in AUDIT_DAY2_DEEP.md section A.

### P4: Horizontal Overflow Fix
AI Agents, Settings, and Agent Configure pages have horizontal scrollbars. Tab strips and cards overflow their containers.

### P5: Launchpad "Choose Plan" Step
Shows "Choose your plan" even though user has active Growth Plan ($297/mo). Should auto-complete if subscription.status = active.

### P6: Maya's Outbound Prompt
Flagged Outbound but prompt says "Thank you for calling..." (inbound). Corrected outbound prompt is in AUDIT_DAY2_DEEP.md section B.

### P7: Automation Builder Improvements
No branching (If/Else), no from-number picker, no variable picker, no SMS segment counter, save button auto-activates workflows. Full list in AUDIT_DAY2_DEEP.md section C.

### P8: New User Seeding — Brandon Template
New signups should get a pre-created "Brandon" mortgage protection agent. Template exists at `src/lib/agents/templates/mp-appt-setter-v1.ts`.

### Other Audit Items (from AUDIT_DAY2.md)
- Hard-coded demo notifications (should be real or labeled)
- Agency alerts banner fires incorrectly (says clients need attention when minutes = 0)
- Modal validation errors not visible (error appears at top, user looking at bottom)
- Quick Add modal cut off on small viewports
- Business Profile not included in Launchpad onboarding

---

## CRITICAL RULES FOR ANY NEW SESSION

1. **livekit-client MUST stay pinned at 2.16.1** — do NOT upgrade
2. **Always use getUser() not getSession()** for Supabase auth
3. **CSP in next.config.ts** — add domains for any new external service
4. **Don't modify agent-worker/main.py** unless you can also deploy to Railway via `railway up`
5. **Run migrations manually** in Supabase SQL Editor — there's no auto-migration setup
6. **Deploy order:** git commit + push → `vercel --prod` from project root (NOT from subdirectories)
7. **LiveKit credentials must match** between Vercel and Railway — same API key/secret for the same project

---

## ENVIRONMENT REFERENCES

| Service | URL / Key |
|---------|-----------|
| Vercel | https://www.leadfriendly.com |
| LiveKit Cloud | wss://lead-friendly-bc511t0j.livekit.cloud |
| LiveKit Project | p_5ublcthv8tw |
| LiveKit API Key | APIjwpkCnzXf9NF |
| Supabase | (check Vercel env vars) |
| GitHub | github.com/mandeepashf-collab/lead-friendly |
| Railway | agent-worker deployment |

---

## HOW TO HAND OFF TO A NEW COWORK SESSION

Paste this as the first message:

> You are working on Lead Friendly, a voice AI calling platform. The project folder has been selected. Start by reading these files in order:
> 1. `SESSION_SUMMARY_APR18.md` — full history of all fixes and current state
> 2. `COWORK_TASK.md` — prioritized task list
> 3. `AUDIT_DAY2_DEEP.md` — detailed specs for Contact Detail page, Maya's prompt, Automations, Design System
>
> Work through the remaining open items (P3–P8). The P0–P2 fixes are already committed and deployed. Start with P3 (Contact Detail page) as it's the biggest structural gap. Commit and deploy after each major feature.
