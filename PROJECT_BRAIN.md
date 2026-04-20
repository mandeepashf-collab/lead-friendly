# Lead Friendly — Project Brain (v3)

**Last updated:** April 19, 2026 — afternoon
**Owner:** Mandeep Rao (mandeepashf@gmail.com)
**Live site:** https://www.leadfriendly.com
**Repo:** github.com/mandeepashf-collab/lead-friendly (branch: `main`)
**Latest commit:** `c1b3f3b` — "fix(script): validate phone number format in rotation diagnostic"

> **Canonical source of truth.** Older session summaries describe earlier architecture that has been superseded. When in doubt, this file wins.

---

## 1. What Lead Friendly Is

AI-powered sales CRM positioned as a GoHighLevel competitor for small businesses. Core differentiator: AI voice agents that make outbound sales calls (currently mortgage protection appointment setting).

Target user: solo founders, small sales teams (1–5 people) who want to be live and calling leads in under 10 minutes. Not agencies managing dozens of clients.

### Major milestones reached

- **Apr 18 evening**: WebRTC voice agent working end-to-end in production for the first time
- **Apr 19 morning**: User-editable prompt UI verified end-to-end (agent follows user's saved script dynamically)

---

## 2. Architecture (Current)

### Frontend
- **Next.js 16.2.2** (App Router, Turbopack)
- **React 19**
- **Tailwind CSS 4** — dark zinc-950 theme, indigo-600 accent
- **TypeScript**
- Hosted on **Vercel** (`mandeepashf-collabs-projects/lead-friendly`)

### Backend / Data
- **Supabase** (SSR auth using `@supabase/ssr`, `getUser()` for server-validated auth)
- Project: `zdxdcgiwimbhgaqfgbzl.supabase.co`

### Voice Pipeline (WebRTC — primary production pipeline)
- **LiveKit Cloud**: `wss://lead-friendly-bc511t0j.livekit.cloud` (project `p_5ublcthv8tw`)
- **Browser client**: `livekit-client` pinned at exactly `2.16.1` — **DO NOT UPGRADE**
- **Python agent worker** on Railway (`agent-worker/main.py`), LiveKit Agents v1.5.4, registered as `agent_name="lead-friendly"`
- **Pipeline**: mic → Deepgram STT Nova-2 → Claude Haiku → ElevenLabs Flash v2.5 → speaker
- **Known issue**: 5-6 second latency between user speaking and agent responding (being diagnosed Apr 19 PM)

### Agent Config Delivery (critical to understand)
- Config (system_prompt, greeting_message, voice_id, name) travels via **LiveKit room metadata**
- Three paths can deliver it: `createRoom()` + explicit `createDispatch()` + token-embedded `RoomAgentDispatch`
- Worker reads from **`ctx.job.metadata` (preferred, always populated by dispatch)** with fallback to `ctx.room.metadata`
- **Never** reads via HTTP fetch from the Python worker
- This is the mechanism that makes UI prompt edits take effect on next call

### Voice Pipeline (Telnyx — secondary, for "ring my phone" test-call flow)
- `/api/agents/test-call` uses Telnyx for the "ring my phone to hear this agent" preview during agent setup
- Telnyx account: admin@leadfriendly.com, 3 numbers active:
  - `+17196421726` rotation_order=0
  - `+14255481585` rotation_order=1
  - `+12722194909` rotation_order=2 (flagged "Potential Spam" by carriers due to overuse pre-rotation)
- All 3 assigned to Call Control app "Lead Friendly CC" (App ID: `2935474723410151094`)
- Distinct from LiveKit — they coexist by design

### Payments
- **Stripe intentionally deferred** — wires up after voice pipeline is demo-stable
- Schema exists (`organizations.subscription_status`, `stripe_customer_id`, `stripe_subscription_id`) but no webhook, no checkout
- Current band-aid: `Lead Friendly` org has `subscription_status='active'` set manually for Launchpad filter

### Domain & DNS
- **leadfriendly.com** registered at IONOS, expires 2028
- DNS: A `@` → `76.76.21.21`, CNAME `www` → `817cdce0234c18b5.vercel-dns-017.com`
- **Always use `https://www.leadfriendly.com`** (with www) for webhooks — bare domain causes 307 redirects

---

## 3. Environment Variables (verified Apr 19)

### Vercel (production)
| Variable | Value / Fingerprint | Notes |
|----------|---------------------|-------|
| `LIVEKIT_URL` | `wss://lead-friendly-bc511t0j.livekit.cloud` | |
| `LIVEKIT_API_KEY` | `API...9NF` | |
| `LIVEKIT_API_SECRET` | `ZVG...6HU` | |
| `NEXT_PUBLIC_APP_URL` | `https://www.leadfriendly.com` | must include www |
| `DEEPGRAM_API_KEY` | set | |
| `ELEVENLABS_API_KEY` | **rotated Apr 18** (Creator tier) | Old key leaked in chat, was rotated |
| `ANTHROPIC_API_KEY` | set | |
| `TELNYX_API_KEY` | `KEY0...yQkJ` | |
| `TELNYX_APP_ID` | `2935474723410151094` | **verified Apr 19 matches Telnyx portal** |
| `TELNYX_SIP_CONNECTION_ID` | set | distinct from APP_ID |
| `TELNYX_SIP_PASSWORD` | set | |
| `NEXT_PUBLIC_SUPABASE_URL` | set | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | set | |

### Railway (lead-friendly-agent service) — 9 vars confirmed
| Variable | Value |
|----------|-------|
| `LIVEKIT_URL` | same as Vercel (must match) |
| `LIVEKIT_API_KEY` | same as Vercel (must match) |
| `LIVEKIT_API_SECRET` | same as Vercel (must match) |
| `DEEPGRAM_API_KEY` | set |
| `ELEVENLABS_API_KEY` | rotated Apr 18 |
| **`ELEVEN_API_KEY`** | **added Apr 18 — Python SDK requires this name, not ELEVENLABS_API_KEY** |
| `ANTHROPIC_API_KEY` | set |
| `LEAD_FRIENDLY_API_URL` | set |
| `SUPABASE_SERVICE_ROLE_KEY` | set |

### .env.local (developer machine only — gitignored)
- Had **two stale values** caught on Apr 19:
  - `TELNYX_APP_ID` was `2935...7970` (wrong) — corrected to `2935474723410151094`
  - `ELEVENLABS_API_KEY` was old pre-rotation key — updated to current Creator key
- **Pattern flagged**: local dev env drift from production; worth periodic audit

### Diag endpoint
`/api/webrtc/diag` returns URL + key/secret fingerprints without exposing secrets — use this to verify parity between layers.

---

## 4. Shipped to Production (complete commit log)

### Apr 19 session (today)
| # | SHA | Fix |
|---|-----|-----|
| 14 | `ade5e3f` | Brandon's outbound mortgage protection prompt + greeting (via `scripts/update-brandon-prompt.ts`) |
| 15 | `d3e2890` | Remove deprecated `AgentSession.wait_for_close()` — was throwing AttributeError in cleanup |
| 16 | `a6211d6` | Number pool rotation fix (4 bugs: column rename `daily_count→daily_used`/`daily_limit→daily_cap`, sort by `rotation_order` then `last_used_at NULLS FIRST`, removed hardcoded `+12722194909` from AI Agent test call button) |
| 17 | `b9bc4c9` | **Worker prefers `ctx.job.metadata` over `ctx.room.metadata`** — was reading empty room metadata and falling back to hardcoded "Assistant" default prompt. This was the root cause of Brandon speaking generic responses. |
| 18 | `c1b3f3b` | Script: validate phone number format in rotation diagnostic (prevent accidentally calling literal "+1YOURCELLNUMBER" placeholder) |

### Apr 18 session
| # | SHA | Fix |
|---|-----|-----|
| 9 | `cf7b907` | Recover `/ai-agents/build` page — `.gitignore` was silently excluding it |
| 10 | `17d855e` | Maya prompt rewrite script |
| 11 | `b886468` | P5 — Launchpad subscription filter |
| 12 | `f7d1ebc` | P2 — Voice-name helpers on 5 surfaces + ElevenLabs catalog swap |
| 13 | `bd79846` | P4 — Horizontal overflow fixes + `.scrollbar-none` utility |
| — | `b445510` | **ElevenLabs plugin kwarg fix (`model_id` → `model`)** — this unblocked worker initialization |

### Earlier sessions (foundational)
| # | SHA | Fix |
|---|-----|-----|
| 1 | `81bdb08` | Auth middleware uses `getUser()`; webhook in PUBLIC_ROUTES |
| 2 | `0c38342` | Pinned `livekit-client` to 2.16.1 |
| 3 | `112736d` | CSP fix — LiveKit Cloud in `connect-src`/`media-src` |
| 5 | `f5c1f16` | `AgentDispatchClient.createDispatch()` + appointment UUID validation + `lender_name` column |
| 6 | `fd8ce99` | P0 — Token-embedded RoomAgentDispatch + `/api/webrtc/diag` |
| 7 | `f4c8f4d` | P1 — Unified call stats (migration 011, views, hooks) |
| 8 | `b9c2295` | P2 partial — Voice names on AI Agents list + detail |

### Database patches applied (no commit, direct SQL)
- Migration `010_contacts_lender_name.sql` — `lender_name` column
- Migration `011_call_stats_view.sql` — trigger + 3 views
- Apr 18: Maya prompt + greeting + type → outbound
- Apr 18: `Lead Friendly` org `subscription_status` → 'active' (band-aid)
- Apr 19: `phone_numbers.rotation_order` staggered (0, 1, 2) for the 3 Telnyx numbers
- Apr 19: Brandon's system_prompt + greeting_message → mortgage protection appointment setter

---

## 5. Current State — What Works and What's Open

### ✅ VERIFIED WORKING END-TO-END (as of Apr 19 PM)
- **Agent creation flow** (3-tab UI: Build with AI / Templates / Manual)
- **WebRTC voice agent**: browser mic → Deepgram → Claude Haiku → ElevenLabs → browser speaker
- **Agent config delivery**: user edits prompt on Instructions tab → Save → next call picks up new content (proven via "weather rule" test)
- **P0 LiveKit dispatch**: 3-way dispatch proven, token-embedded metadata path is the reliable one
- **Unified call stats** (Dashboard, Call Logs, Billing, AI Agents pages)
- **Voice-name display** on all 7 UI surfaces
- **Horizontal overflow** on AI Agents / Settings / Agent Configure pages
- **Telnyx number pool rotation** at the code level (all 3 numbers deployed, rotation_order staggered)

### 🟡 KNOWN ISSUES (being addressed today)

1. **Agent response latency 5-6 seconds** — pin-drop silences, agent sometimes misses user speech. Likely tunable via Deepgram endpointing, VAD min_silence_duration, LLM max_tokens. Cowork investigating. Target: under 1.5s.

2. **Contact-page "Call" button** shows "Live" with timer but phone doesn't ring. Also the transcript shows AI agent text ("Agent: Hi, this is Sarah from Lead Friendly") even though Manual Calls should be human-to-human. Claude Code investigating.

3. **Top-right dialpad button** triggers Chrome "Open Pick an app?" popup on `tel:` URL. Should route through in-browser dialer instead. Claude Code investigating.

### 🔴 KNOWN ISSUES (deferred, not blocking)

- **Post-call transcript/recording not saved**: `_post_call_complete` function fires with `call_record_id` empty → skips silently. `create-call` isn't generating a call record upfront. Requires `ctx.add_shutdown_callback` integration. 4-6 hour feature, goes on tomorrow.
- **Post-call API error 307: Redirecting** — minor redirect issue on the post-call endpoint. Likely missing trailing slash or bare-domain URL.
- **Call History UI doesn't show recordings or transcripts** — dependent on saving them first.
- **Annotate tab needs recordings to be useful** — dependent on recording feature.
- **Template variable substitution not working at call time**: `{{contact.first_name}}` and `{{business_name}}` speak literally instead of being replaced. Separate feature.
- **Duplicate `package-lock.json` at `C:\Users\mande\package-lock.json`** confuses Turbopack workspace-root — safe to delete from home dir.
- **Migration 011 git** references `mobile_phone`, DB has `cell_phone` — follow-up commit needed to sync.

---

## 6. Priority Queue (Revised Apr 19 PM)

### Today (in progress)
1. **Latency tuning** (Cowork) — propose config changes in report, I review, then apply
2. **Phone call path diagnosis** (Claude Code) — contact call + manual vs AI leakage + tel: popup

### Next session (tomorrow likely)
3. **Call recording + transcript persistence** — biggest feature gap. Build:
   - `create-call` generates `call_record_id` upfront (ready before worker joins)
   - Worker's `_post_call_complete` uses `ctx.add_shutdown_callback` to fire after session end
   - Transcript lines saved to DB as they happen (not all at end)
   - Audio recording stored (LiveKit Egress or equivalent)
   - Call History UI renders recording player + transcript pane
   - Annotate tab consumes the recording + transcript
4. **Fix the Post-call 307 redirect** — low hanging fruit, likely just the URL
5. **Template variable substitution** — make `{{contact.first_name}}` actually substitute at call time

### Later
| Priority | Task | Notes |
|---|---|---|
| P1 | Fix AI Minutes sidebar counter | Stale widget, migration 011 didn't update |
| P2 | P3 Contact Detail page `/contacts/[id]` | 404s currently (biggest UX gap) |
| P2 | P7 Automation Builder (5 sub-tasks) | |
| P3 | Public landing page | Biggest trust barrier for new visitors |
| P3 | Stripe integration | **Deferred by design until voice is demo-stable** |
| P3 | P8 Brandon template scaffold | Auto-seed new orgs with default agent |
| Later | Basic email sequences | Table-stakes CRM |
| Later | Analytics dashboard | Beyond current stats views |

---

## 7. Verify-Don't-Trust Checklist

**This project has repeatedly had situations where one layer lies about another's state.** Before trusting any change, verify independently.

### Documented cases from recent sessions
- `.gitignore` silently excluded a 585-line page from every commit (Apr 18)
- Maya UI showed "Outbound" but DB column said `inbound` (Apr 18)
- Launchpad code shipped correctly but UI unchanged (data was null, code worked fine) (Apr 18)
- Cowork's Edit tool silently truncated files — same byte count, fewer lines (Apr 18)
- ElevenLabs Free tier was blocking TTS, looked like code bug for hours (Apr 18)
- Railway "registered worker" log appeared from an OLD container while NEW container was mid-deploy (Apr 18)
- Agent spoke generic responses while DB had correct prompt (metadata path mismatch, Apr 19)
- `.env.local` had stale `TELNYX_APP_ID` (fingerprint differed from prod by last 4 chars) (Apr 19)
- `ELEVENLABS_API_KEY` env var name on Vercel vs `ELEVEN_API_KEY` needed on Railway (Apr 18)

### Verification steps
1. **After git commit** — `git status` confirms file is tracked, not just staged
2. **After `.gitignore` change** — `git ls-files --others --ignored --exclude-standard -- src/` should return zero source files
3. **After deploy** — hard refresh (Ctrl+Shift+R), not just F5
4. **After data change** — verify with direct SQL query, not UI inspection
5. **After Cowork/AI-tool edits** — `npx tsc --noEmit` + `npm run build` + `wc -l` + `tail -5` before committing
6. **After Railway deploy** — check timestamp AND `registered worker` log line. "Registered" alone isn't sufficient; match against expected rebuild window.
7. **After env var change** — fingerprint-compare (first 4 chars + last 4 chars + length) across Vercel, Railway, .env.local. Never paste full values.
8. **After prompt edit in UI** — Railway logs should show the new `agent_config metadata source=ctx.job.metadata preview=...` line with the edited content

---

## 8. Hard Rules — Never Break These

1. **`livekit-client` stays pinned at exactly `2.16.1`** — do not upgrade
2. **Supabase auth uses `getUser()`**, not `getSession()` (server-validated)
3. **CSP in `next.config.ts`** must include `https://*.livekit.cloud wss://*.livekit.cloud` in both `connect-src` and `media-src`
4. **Run migrations manually** in Supabase SQL Editor (no auto-migration)
5. **Deploy `vercel --prod` from project root**, not subdirectories
6. **LiveKit credentials must match exactly** between Vercel and Railway (same project)
7. **Don't modify `agent-worker/main.py`** unless you can also deploy to Railway via `railway up`
8. **Webhooks use `https://www.leadfriendly.com`** (with www) — bare domain causes 307 redirects
9. **NEVER paste API keys in chat** — treat any key that lands in conversation as leaked. Rotate immediately.
10. **`.gitignore` patterns anchored with leading `/`** — unanchored `build/`, `dist/`, `out/` match any folder
11. **Python ElevenLabs SDK requires env var `ELEVEN_API_KEY`**, not `ELEVENLABS_API_KEY` (which is Vercel's name). Railway needs both, or at least `ELEVEN_API_KEY`.
12. **Agent worker reads config from `ctx.job.metadata`** — never add HTTP fetches to the worker startup path. Keep metadata-only delivery.
13. **Forbidden-path rules for Cowork/Claude Code should be literal filename matches**, not directory globs — "Don't touch `agent-worker/main.py`" not "Don't touch `agent-worker/`" (the broader form blocks legitimate deploy commands).

---

## 9. Tooling Setup — Strengths and Failure Modes

| Tool | Good for | Known failure modes |
|------|----------|---------------------|
| **Claude.ai (this chat — the "brain")** | Project planning, reconciling conflicting state, writing specs/prompts for other tools, synthesizing reports | No direct code execution, no file system access, no git. Coordinates others. Can drive Chrome extension for browser-based verification. |
| **Claude Code in VS Code** | Git operations, targeted file edits, running builds/deploys, one-off scripts | Primary shipping tool. Most reliable for production work. May be blocked by overly-broad forbidden-path rules (scope them tight). |
| **Cowork** | Big refactors, multi-file edits, reading large files, diagnostic reports | (1) Cannot do git on Windows paths. (2) Cannot run `vercel --prod`. (3) Edit tool has historically truncated files — ALWAYS run `npx tsc --noEmit` + `npm run build` + `wc -l` + `tail -5` after editing. (4) Sandbox FUSE snapshot can show pre-existing file content wrong (real files may be fine). |
| **Claude in Chrome extension** | Browser verification (dashboards, UI spot-checks, reading env var lists, running SQL via page automation) | (1) Unreliable past ~4 min in one session. (2) MCP server can go fully unresponsive. (3) Fall back to user-paste when it flakes. |
| **Supabase SQL Editor** | Schema changes, migrations, data inspection, data patches | Manual only. `CREATE POLICY IF NOT EXISTS` does NOT work — use `CREATE POLICY`. |
| **Railway dashboard + CLI** | Deploy worker, check logs, manage env vars | `railway up` triggers auto-build. Env var changes trigger auto-redeploy. Rolling deploys can leave old workers alive during transition — verify deploy timestamp matches expected rebuild. |
| **Telnyx portal** | Number management, Call Control apps, CDR review | CDRs lag real-time by ~minutes. CDR "answered" + 30-60s duration + no actual ring = likely carrier spam screener silently accepting the call. |

### Multi-agent coordination rules
- **Claude Code owns all git** (commits, pushes, deploys)
- **Cowork owns file edits** for whatever Claude Code isn't currently touching
- **Assign non-overlapping file sets** to each (e.g. Cowork→agent-worker/, Claude Code→src/)
- `git status` before committing to catch the other agent's in-flight work
- Commit other agent's files SEPARATELY (different commit message)
- If `npm run dev` / `npm run build` is running in one, don't start another (port collision)

---

## 10. Key IDs & References

| Service | ID / Reference |
|---------|----------------|
| Supabase project | `zdxdcgiwimbhgaqfgbzl` |
| Supabase dashboard | `https://supabase.com/dashboard/project/zdxdcgiwimbhgaqfgbzl` |
| Your org (Lead Friendly) | `41b43e35-24d0-40d7-b26a-cd6bc456938a` |
| Your auth user ID | Still verify — seen as both `81d42e33-...` and `59e70fbf-...` across sessions |
| **Brandon agent** | **`ebd227e0-b33d-4b25-b5cf-aca3617f7ce4`** — type=outbound, voice_id=`iP95p4xoKVk53GoZ742B` (Chris), mortgage protection appointment setter |
| Maya agent | `96e56d81-60d0-4d9e-9d7e-be65880db17c` — type=outbound, dental appointment setter |
| LiveKit project | `p_5ublcthv8tw` |
| LiveKit URL | `wss://lead-friendly-bc511t0j.livekit.cloud` |
| Deepgram project | `deee9252-22e3-4d7d-87d6-a37209cf359f` |
| Telnyx App ID (Call Control) | `2935474723410151094` |
| Railway project | `2bc9bad7-856f-4b59-9f23-e6cf6859d067` |
| Railway service (lead-friendly-agent) | `9e60d6aa-2e56-40b0-aa7d-37e5afe2f7d9` |

### Known phone numbers (phone_numbers table)
| Number | Friendly Name | rotation_order | Status |
|--------|---------------|----------------|--------|
| `+17196421726` | (719) 642-1726 | 0 (first in queue) | active |
| `+14255481585` | Lead Friendly 2 | 1 | active |
| `+12722194909` | Lead Friendly Main | 2 (last — spam flagged) | active |

All row IDs:
- `+17196421726` → `e70938b4-44b6-4793-b2f8-d5f8fb5480f7`
- `+14255481585` → `b574badd-c8e7-471e-873e-f48f6a3acc41`
- `+12722194909` → `586a02a9-7bf7-45c6-94da-0ad5cf4b7bd1`

---

## 11. Cowork Handoff Snippet

Paste this as the first message to a new Cowork session:

> You are working on Lead Friendly, a voice AI calling platform at `C:\Users\mande\Desktop\lead-friendly`. Start by reading these files in order:
> 1. `PROJECT_BRAIN.md` — canonical current state (always wins if conflicts with other docs)
> 2. `COWORK_TASK.md` — prioritized task list (if present)
> 3. `AUDIT_DAY2_DEEP.md` — detailed specs for Contact Detail page, automation builder, design system
>
> Check PROJECT_BRAIN.md §6 "Priority Queue" for what's next. Remember:
> - Git commits go through Claude Code in VS Code (not Cowork) due to Windows `.git/index.lock` issues
> - Your Edit tool has historically truncated files. ALWAYS verify with `wc -l` and `tail -5` after each edit, then run `npx tsc --noEmit` AND `npm run build` before declaring work done
> - livekit-client stays pinned at 2.16.1
> - Agent worker reads config from `ctx.job.metadata` (never `ctx.room.metadata` as primary, never HTTP fetch)
> - Do not modify agent-worker/main.py unless you can deploy to Railway via `railway up`
> - Do not modify next.config.ts CSP without understanding LiveKit domains are required
> - Forbidden-path rules are literal filenames, not directory globs

---

## 12. Session Log — Apr 19, 2026

### Wins
- **5 commits shipped** (ade5e3f, d3e2890, a6211d6, b9bc4c9, c1b3f3b)
- **Brandon speaks the mortgage protection script** (metadata fallback fix)
- **User-editable prompt UI verified end-to-end** (weather rule test)
- **Number pool rotation fully wired** (4 bugs fixed: column names, sort, hardcoded number, rotation_order staggering)
- **Brandon's wait_for_close AttributeError removed** (session cleanup no longer noisy)
- **Production Vercel `TELNYX_APP_ID` confirmed correct** (only local .env.local was stale)
- **ElevenLabs key rotated after accidental leak** (good security hygiene recovery)

### Diagnostics this session
- **Metadata root cause**: Claude Code traced that worker reads from `ctx.room.metadata` but dispatch populates `ctx.job.metadata`, causing empty config → hardcoded "Assistant" fallback. Fix was one line.
- **TELNYX_APP_ID root cause**: Diagnostic script used `.env.local` value which was 2935...7970 instead of correct 2935...1094. Production Vercel had correct value all along.

### Corrections to prior PROJECT_BRAIN
- Stripe integration is **intentionally deferred**, NOT broken (confirmed this morning)
- Agent config travels via **LiveKit room metadata**, not HTTP fetch (this is a deliberate architecture choice — simpler, more reliable than network calls from the worker)
- User-editable prompt UI is **already built and working** on the Instructions tab at `/ai-agents/[id]` — no code needed, just needed product verification

### Biggest lesson from this session
**When architecture looks broken, check the latest stack trace before assuming the architecture is wrong.** The WebRTC dispatch pipeline worked perfectly all along — every failure this week was a single-line glue bug (plugin kwarg, env var name, metadata field). Trust the architecture, chase the exact error.

### In progress (Cowork + Claude Code running in parallel)
- **Cowork**: proposing latency tuning config changes for agent-worker (target: 5-6s → under 1.5s)
- **Claude Code**: diagnosing contact-page call button (F1: phone doesn't ring, F2: AI transcript on manual call, G: tel: dialer popup)

When reports come back, review for correctness, then apply fixes and deploy.
