# Lead Friendly — Cowork Session Task (April 18, 2026)

## PROJECT CONTEXT

Lead Friendly is a voice AI calling platform for mortgage protection appointment setting. It's a Next.js 16 app (Vercel) with a Python LiveKit agent worker (Railway), Supabase for auth/DB, and LiveKit Cloud for WebRTC.

**All project code is in the folder the user selected.** Read HANDOFF.md, AUDIT_DAY2.md, and AUDIT_DAY2_DEEP.md in the project root for full context. Read the codebase before making changes.

**Tech stack:** Next.js 16.2.2, React 19, Tailwind CSS 4, TypeScript, Supabase SSR, livekit-client 2.16.1 (pinned), livekit-server-sdk 2.15.1, Python LiveKit Agents v1.5.4 on Railway, Deepgram STT, ElevenLabs TTS, Claude Haiku LLM.

**Deployment:** `vercel --prod` from project root for frontend. `railway up` from agent-worker/ for the Python worker. Always `git add` + `git commit` + `git push` before deploying.

---

## WHAT'S ALREADY DONE (don't redo these)

- CSP fixed to allow LiveKit Cloud connections
- livekit-client pinned to v2.16.1 (avoid v1 signaling)
- Auth middleware uses getUser() (server-validated)
- LiveKit webhook added to PUBLIC_ROUTES
- AgentDispatchClient.createDispatch() added to create-call route (commit f5c1f16)
- UUID sanitization for appointment assigned_to field
- Migration 010_contacts_lender_name.sql created (needs to be run in Supabase)
- Deepgram endpointing_ms=150, min_endpointing_delay=0.2, max_endpointing_delay=3.0

---

## TASK LIST — PRIORITIZED

### P0: Verify Agent Dispatch Works

The #1 blocker. We switched from putting `RoomAgentDispatch` in `createRoom()` to using `AgentDispatchClient.createDispatch()`. This was deployed in commit f5c1f16. 

**If it still doesn't work**, investigate these angles:
1. Check if the Vercel env var `LIVEKIT_API_KEY` matches what Railway uses — they must be the same LiveKit Cloud project
2. Check Railway logs for any dispatch/job errors after a room is created
3. Try the token-based approach: put `RoomAgentDispatch` in the participant's access token via `token.roomConfig = new RoomConfiguration({ agents: [...] })` in `src/lib/livekit/server.ts` createAccessToken()
4. Check if `livekit-server-sdk` v2.15.1's AgentDispatchClient actually works or needs a newer version
5. As last resort, try removing `agent_name` from WorkerOptions (revert to auto-dispatch) and see if that's what's needed

**Key files:**
- `src/lib/livekit/server.ts` — createRoom(), dispatchAgent(), createAccessToken()
- `src/app/api/webrtc/create-call/route.ts` — the API that creates rooms + dispatches
- `agent-worker/main.py` — Python worker with WorkerOptions(agent_name="lead-friendly")

### P1: Unify Call Statistics

Dashboard says 28 calls, Call Logs says 103, AI Agents says 0, Billing says 0. Five views of the same data disagree.

1. Create a single Supabase database view or function that computes call stats from the `calls` table
2. Point Dashboard, Call Logs, AI Agents, Campaigns, and Billing at the same source
3. Fix call duration: should be `ended_at - started_at`, not 0:00
4. Fix "Unknown" contacts in Call Logs: reverse-lookup phone number to contacts table

**Key files:**
- `src/app/(dashboard)/page.tsx` — Dashboard
- `src/app/(dashboard)/calls/` — Call Logs
- `src/app/(dashboard)/ai-agents/` — AI Agents page
- `src/app/(dashboard)/billing/` — Billing page

### P2: Fix Voice ID Display Names

AI agent voice field shows raw ElevenLabs IDs (`iP95p4xoKVk53GoZ742B`) instead of names. Create a mapping of voice ID → friendly name and use it everywhere voices are displayed.

**Key file:** `src/app/(dashboard)/ai-agents/[id]/page.tsx`

### P3: Build Contact Detail Page

The biggest structural gap. Currently clicking "view" on a contact opens the Edit modal. Need a proper `/contacts/[id]` page with:

- Identity card sidebar (name, phone, email, tags, status, lifecycle)
- Tabbed main area: Timeline, Conversations, Calls, Deals, Tasks, Custom Fields
- API endpoint: `GET /api/contacts/[id]/overview`

Full spec is in AUDIT_DAY2_DEEP.md section A.

**Create the files:**
- `src/app/(dashboard)/contacts/[id]/page.tsx`
- `src/app/api/contacts/[id]/overview/route.ts`

### P4: Fix Horizontal Overflow

AI Agents, Settings, and Agent Configure pages have horizontal scrollbars because tab strips and cards overflow. Fix with `overflow-x-auto` on tab strips and proper max-width constraints.

### P5: Fix Launchpad "Choose Plan" Step

Launchpad step 5 says "Choose your plan" but the user already has an active Growth Plan ($297/mo). Hide or mark complete if `subscription.status = active`.

### P6: Fix Maya's Outbound Prompt

Maya is flagged Outbound but her system prompt is inbound ("Thank you for calling..."). The corrected outbound prompt is in AUDIT_DAY2_DEEP.md section B. Update the agent record in the database or provide UI to fix it.

### P7: Automation Builder Improvements

From AUDIT_DAY2_DEEP.md section C — the highest-impact improvements:
1. Add If/Else branching action
2. Add "from number" picker for SMS actions
3. Add variable picker component (reuse from Instructions page)
4. Split "Save" into "Save draft" + "Save & activate" with confirmation modal
5. Add SMS segment counter (160 char = 1 segment)

### P8: New User Seeding — Brandon Template

New signups should get a pre-created "Brandon" mortgage protection agent. SQL and template are in `src/lib/agents/templates/mp-appt-setter-v1.ts`. Wire it into the signup/onboarding flow.

---

## IMPORTANT NOTES

1. **Don't modify agent-worker/main.py unless you can also deploy to Railway.** Frontend changes go to Vercel via `vercel --prod`.
2. **The lender_name migration needs to be run manually in Supabase SQL editor.** The file is at `supabase/migrations/010_contacts_lender_name.sql`.
3. **livekit-client MUST stay pinned at 2.16.1** — do not upgrade.
4. **CSP in next.config.ts** — if you add any new external service, add its domain to connect-src.
5. **Always use getUser() not getSession()** for Supabase auth checks.
6. **Git repo:** github.com/mandeepashf-collab/lead-friendly, branch: main
7. **LiveKit Cloud:** wss://lead-friendly-bc511t0j.livekit.cloud, project p_5ublcthv8tw
