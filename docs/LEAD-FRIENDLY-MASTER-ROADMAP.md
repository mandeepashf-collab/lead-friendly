# LEAD FRIENDLY — MASTER ROADMAP

**Goal:** Build a product that is better, simpler, and cheaper than GoHighLevel for one specific buyer — small businesses and agencies that want AI voice + SMS follow-up without the 40-menu maze. Ship a functional version in 4 weeks, get first 10 paying customers, then compound.

**Our edge vs GHL:** GHL is a bloated all-in-one that takes weeks to learn. We win by being the "AI caller + follow-up that just works out of the box in 10 minutes." We do fewer things, but each one is clean, fast, and built around AI, not bolted on.

**My commitment to you:** I will handle all the technical heavy lifting — database schema, APIs, voice pipeline, AI logic, dashboards, agency white-label system, integrations, deployment. You handle: product decisions, customer conversations, pricing, positioning, sales. We ship weekly. No excuses.

---

## PHASE 1 — SHIP A WORKING MVP (WEEKS 1–2)

The goal here is not "feature parity." The goal is "a business owner signs up, gets an AI agent calling their leads within 10 minutes, and stops worrying." Everything else waits.

### Week 1 — Lock the core loop

Core loop that must work end-to-end before anything else:
**Upload contacts → Create AI agent in 3 steps → Launch campaign → Calls go out → Transcripts + outcomes saved → Dashboard shows results.**

Tasks:
1. **Fix all existing bugs from Day 1–2.** Deploy latest voice pipeline (answer + gather routes already rewritten). Test 20 real outbound calls. Verify Polly TTS audio plays, Claude responds naturally, transcripts save, hangup triggers properly.
2. **Simplify agent creation to 3 fields only.** Right now there are too many. For MVP: Agent name + Business description + Goal (book meeting / qualify lead / follow up). The AI generates everything else behind the scenes. Advanced tab stays but is hidden by default.
3. **Campaign launch reliability.** The `campaign_launch` handler in `/api/automations/process` needs proper queuing — right now it loops with a 1-second delay which will break on 100+ contacts. Move to a background job pattern (either Vercel cron hitting a processor, or Supabase edge function).
4. **Call outcome classification.** After every call, Claude reads the transcript and tags it: Hot / Warm / Cold / No-answer / Voicemail / Do-not-call. This is the single highest-leverage feature — it saves the operator 30 min per 100 calls.
5. **Clean dashboard.** Five cards: Calls today, Minutes used, Answered %, Hot leads, Meetings booked. Nothing else on the home page.

### Week 2 — Make it feel polished

1. **Onboarding flow.** First-login wizard: enter business name → paste website → we scrape it and pre-fill the agent → buy/assign phone number → upload contacts CSV → launch first campaign. 10 minutes start to first call.
2. **Phone number provisioning via Telnyx API.** User should never leave Lead Friendly to get a number. One click, assigned, ready.
3. **SMS follow-up after calls.** If call outcome is Hot/Warm, auto-send a templated SMS with the meeting link or follow-up question. This is where we quietly become a CRM.
4. **Call recordings + transcripts page.** Already built — needs audio playback on every row and a searchable transcript modal.
5. **Billing infrastructure.** Stripe subscription — $97/mo starter (500 minutes), $297/mo pro (2000 minutes), $997/mo agency (unlimited + white-label). Metered minutes beyond the cap. This unlocks cash flow week 3.

**Phase 1 deliverable:** A real human can sign up, pay, and have an AI calling their leads within 15 minutes. No demo calls needed. The product sells itself.

---

## PHASE 2 — GET 10 PAYING CUSTOMERS (WEEKS 3–4)

Product is now functional. This phase is about proving it works in the wild and closing the first 10 logos. Distribution matters more than features right now.

1. **Landing page rebuild.** One page: hero video of AI calling a lead, 3 benefits (10-min setup, 60% cheaper than hiring an SDR, works while you sleep), pricing, testimonials slot (empty for now), signup CTA. No menus. No blog. No "features" page with 40 bullets.
2. **Demo call on the homepage.** Visitor types their phone number → AI calls them in 10 seconds with a canned "discover how Lead Friendly works" pitch. This single feature converts 4–6× better than any landing page copy.
3. **Free trial — 50 minutes, no credit card.** Removes the biggest friction. Most will convert after they hear it work on their own leads.
4. **Self-serve onboarding videos.** 5 Loom videos, 90 seconds each: setup agent, upload contacts, launch campaign, review calls, connect calendar. Embedded inline in the app.
5. **Intercom / Crisp chat widget.** You handle support personally for the first 50 customers. This is where you learn what actually matters.

**Phase 2 deliverable:** 10 paying customers, $1K–3K MRR, 20+ recorded customer conversations driving the Phase 3 priority list.

---

## PHASE 3 — PULL AWAY FROM GHL (MONTHS 2–3)

Now we use customer feedback to build the stuff GHL does badly. We do not try to match GHL's 400 features. We pick the 10 that matter and make them 10× better.

1. **Simple visual workflow builder.** GHL's workflow builder is powerful but overwhelming. Ours will have 8 triggers, 12 actions, and a linear timeline UI (not a flowchart). Triggers: New contact, Call ended, SMS received, Form submitted, Meeting booked, Tag added, Time delay, Manual. Actions: Start AI call, Send SMS, Send email, Add tag, Move stage, Create task, Wait, Branch (if/else). That's it. Ten minutes to build what takes an hour in GHL.
2. **AI workflow generator.** Copy GHL's "What do you want to automate?" prompt — but ours actually works for calling. User types: "Call new leads within 5 min, if no answer retry in 2 hours, if still no answer send SMS." We generate the workflow they can edit.
3. **Calendar integration.** Google Calendar + Cal.com. AI agent can actually book meetings during the call. This is a killer feature that GHL does but makes you configure 40 things to use.
4. **Pipeline / opportunities view.** Kanban board (Lead → Qualified → Meeting Booked → Closed). Drag-drop. Auto-updates from call outcomes.
5. **Email follow-up.** SMTP or Resend integration. Templated emails after calls. Merge fields from contact data.
6. **Inbox — unified conversations.** All SMS, call transcripts, emails per contact in one thread view. This is the feature that makes users stop leaving the app.
7. **CSV + API imports.** Upload from anywhere. Zapier integration for the rest.
8. **Knowledge base per agent.** Upload PDFs, docs, website URLs → agent uses RAG to answer questions during calls. We already have the scaffolding; needs vector DB (Supabase pgvector).
9. **A/B testing on agent scripts.** Two agents, split traffic, winner stays. Simple.
10. **Reporting.** Calls per day/week, cost per meeting booked, hot-lead conversion, agent performance. Export CSV.

---

## PHASE 4 — AGENCY / WHITE-LABEL (MONTHS 3–5)

This is where the real money is. GHL built a $1B business on this. We copy the model but make the onboarding 10× cleaner.

1. **Sub-accounts.** Agency creates accounts for each of their clients. One login, switch between accounts.
2. **Snapshots.** Agency builds a workflow + agent template once, deploys to all client sub-accounts in one click. GHL calls these "Snapshots" — we call them "Templates."
3. **White-label branding.** Custom domain (app.agencyname.com), custom logo, custom colors, custom login page, custom email sender. Remove all Lead Friendly branding.
4. **Reseller pricing.** Agency buys 20 sub-accounts at wholesale ($50 each), sells to clients at $197 each. They keep the margin. This is the GHL business model — it works because agencies become our sales force.
5. **Agency dashboard.** All client call stats, minutes used, revenue, churn in one view.
6. **Affiliate program.** Any user gets 30% recurring on referrals. Tracked automatically.

---

## PHASE 5 — THE UNFAIR ADVANTAGES (MONTHS 6+)

Things GHL cannot do because they are not AI-native:

1. **Multi-lingual agents.** Spanish, French, Hindi, Portuguese — any language Claude speaks. Massive unlock for international agencies.
2. **Voice cloning.** User uploads 30 seconds of their voice → AI agent calls in their voice. ElevenLabs API already supports this.
3. **Live call handoff.** AI qualifies → human sales rep picks up mid-call when "hot" signal detected. Hybrid AI + human workflow GHL cannot touch.
4. **AI coach for humans.** Real human calls also get transcribed, scored, and coached. Tells the rep "you talked 70% of the time, prospect dropped off at pricing." This turns Lead Friendly into a training platform, not just a tool.
5. **Outbound from CRMs.** Native Salesforce, HubSpot, Pipedrive connectors — "call this contact from your CRM in 1 click." Meets buyers where they already are.
6. **Marketplace.** Pre-built agents for specific industries (real estate, solar, insurance, roofing, med spa). User picks one, edits 3 fields, launches. This is the "App Store" moment.

---

## POSITIONING vs GHL — THE ONE-LINER

**GoHighLevel:** "The all-in-one platform for agencies" — 400 features, 6-week learning curve, looks like SAP.

**Lead Friendly:** "AI voice + follow-up that works in 10 minutes." — 20 features, all sharp, built for the 80% of businesses that do not need CRM-ception.

Every feature we build should pass this test: *"Does this make the 10-minute setup → first call flow faster or more reliable?"* If no, it waits.

---

## TECH PRINCIPLES (so we move fast without wrecking things)

1. **Ship every Friday.** Even if it is one fix. Momentum compounds.
2. **No feature without a customer asking for it** after Phase 2. Before that, we follow this roadmap.
3. **Supabase + Next.js + Vercel is the stack.** No rewrites. No microservices. Boring tech until $100K MRR.
4. **Claude for all AI.** No switching to OpenAI, no fine-tuning, no local models. Claude Haiku for calls (fast + cheap), Claude Sonnet for config generation.
5. **Telnyx for voice + SMS.** Cheaper than Twilio, better control. One vendor for both.
6. **Stripe for billing.** No custom billing. Ever.
7. **Database migrations are sacred.** Every schema change gets a migration file checked into git. No ad-hoc SQL in Supabase UI.
8. **Every API route has auth + org scoping.** We already drift on this — I will audit all routes in Phase 1 Week 1.

---

## WHAT I NEED FROM YOU

1. **Time.** 5–10 hours/week on product decisions, demos, customer conversations. Not coding.
2. **Access.** Keep me working from the shared folder. Respond to my questions within a day when I am stuck.
3. **First 10 customers.** You talk to them. I build what they ask for. We close together.
4. **Pricing decisions.** I will propose, you approve. Gut-check with customers.
5. **Honesty.** If something feels slow or wrong, tell me. I will adjust.

## WHAT YOU CAN EXPECT FROM ME

1. **Full ownership of the technical build.** Architecture, code, deployment, debugging.
2. **Weekly progress notes** in `docs/weekly-updates/`.
3. **Clear what-to-test lists** every Friday so you can validate before we ship.
4. **Unblockers within a day.** If you hit a bug or a customer question I can answer, I answer.
5. **Honest trade-offs.** If something takes 3 days instead of 1, I say so. No sandbagging.

---

## 30-60-90 DAY SCORECARD

**30 days:** MVP shipped, 3 paying customers, core call loop reliable at 95%+ answer rate.
**60 days:** 15 paying customers, $3–5K MRR, workflow builder v1, Google Calendar booking working.
**90 days:** 40 paying customers, $10–15K MRR, agency/white-label live, first reseller partner signed.

If we hit 30/60/90, we raise a small round or self-fund to $100K MRR. If we miss, we re-plan with the customer data we have.

---

## IMMEDIATE NEXT ACTIONS (this week)

1. You deploy the current code to Vercel (voice pipeline fixes) and run 5 test calls.
2. I audit all API routes for auth + org scoping and fix any gaps.
3. I wire up the campaign detail page to the new `/api/campaigns/[id]/calls` endpoint.
4. I simplify the agent creation page from 15 fields to 3.
5. You write down the top 3 objections you imagine a real customer would have. I build responses into the product.

We ship this week. We keep shipping. We win.

— Your technical co-pilot.

---

## STATUS LOG — April 15, 2026 (overnight batch)

### Shipped (pending deploy)

**Voice pipeline — diagnostics + real fix**
- Added `voice_webhook_events` Supabase table with a fire-and-forget logger
  that persists every Telnyx event — diagnostic regardless of Vercel log
  retention.
- Fixed the "Sarah" regression: `loadAgent` was selecting `greeting` +
  `personality` columns that don't exist. Now selects `greeting_message` +
  `system_prompt`. This is why every call spoke Sarah's hardcoded greeting
  regardless of which agent was attached.
- Empty gather streak handling — first silent response gets a "Are you
  there?" re-prompt instead of immediate hangup.
- Inbound phone-number → organization lookup on `call.initiated`.
- Added `book_meeting` Claude tool — the AI agent can now end the call
  with a real appointment row on the calendar.

**Product flow — Upload leads → AI calls → Books appointments**
- Contacts page "Call" button split into two: **AI Call** (indigo) triggers
  your real agent, **Call (You)** (emerald) opens the Human Dialer.
- Agent Builder has a voice picker with play/pause previews and a "Call me"
  test-call button that uses the DRAFT prompt (no save needed).
- New `/calls/human` page — browser-based softphone via `@telnyx/webrtc`
  with keypad, mute/hold/hangup, call-record logging.
- Campaign launcher now org-scopes contacts (was global — security bug),
  uses the org's active phone number (was hardcoded), and dedupes against
  already-called contacts.
- CSV import now handles quoted fields, escaped quotes, and newlines inside
  quoted values (the naive `split` was breaking on real CSVs).
- Call detail view now renders alternating-bubble transcripts for
  `Agent:`/`Customer:` formats, adds a notes/annotation field with save,
  and a "Call Back (Human)" quick action.

**Stripe subscriptions**
- `/api/stripe/checkout` — creates a hosted checkout session for a given
  priceId. Deduplicates Stripe customers per org.
- `/api/stripe/portal` — returns a customer portal URL for self-serve plan
  management.
- `/api/stripe/webhook` — handles `checkout.session.completed`,
  `customer.subscription.created/updated/deleted`,
  `invoice.payment_succeeded/failed`.
- Pricing page CTAs now post to checkout for signed-in users.
- Middleware subscription gate — opt-in via `SUBSCRIPTION_GATE_ENABLED=true`.
  Exempt paths: /billing, /pricing, /suspended, /api/stripe, /api/auth.
- First-login redirect on dashboard → /launchpad when the org has no
  contacts/agents/campaigns yet.

**Migrations**
- `supabase/migrations/004_subscriptions.sql` — adds all subscription columns,
  `calls.notes`, `calls.appointment_id`, `appointments.notes`, and the
  `voice_webhook_events` diagnostic table.

### Not yet shipped (needs user in the morning)

1. `vercel --prod` deploy
2. Apply migration 004_subscriptions.sql in Supabase SQL editor
3. Create Stripe products + webhook endpoint, set 5 env vars
4. (Optional) Google Calendar OAuth registration — handler not built yet,
   appointments still land in the DB regardless
5. Real test call to confirm the webhook events table is populating and the
   agent's voice is now being used

See `docs/MORNING-DEPLOY-CHECKLIST.md` for the exact step-by-step.

