# Morning Deploy Checklist — April 15, 2026

Everything built overnight is landed on your working branch. This is the
exact sequence to run when you're back at the keyboard. Don't skip steps —
each one unblocks the next.

Estimated total time: **90 minutes** (longer if Stripe + Google OAuth take longer to register).

---

## 0) Pull & typecheck (2 min)

```bash
cd ~/Desktop/lead-friendly
git status               # confirm you're on the right branch
./node_modules/.bin/tsc --noEmit
```

Expected: no output (clean).

If you see errors — they'll be trivial (missing import) and fixable in 1 minute.

---

## 1) Apply the Supabase migration (5 min)

Open Supabase SQL editor → paste the contents of
`supabase/migrations/004_subscriptions.sql` → Run.

What it adds:
- `organizations.stripe_customer_id`, `stripe_subscription_id`,
  `subscription_status`, `subscription_plan_id`,
  `subscription_current_period_end`, `trial_ends_at`
- `calls.notes` and `calls.appointment_id`
- `appointments.notes`
- `voice_webhook_events` diagnostic table (idempotent)

Verify:
```sql
select column_name from information_schema.columns
where table_name='organizations' and column_name like 'stripe%';
```
Should return 5 rows.

---

## 2) Configure Stripe (20 min)

### 2a. Create products in Stripe Dashboard

Go to https://dashboard.stripe.com/products → **+ Add product** three times:

| Product | Price | Billing | Price ID (copy to env var) |
|---------|-------|---------|----------------------------|
| Lead Friendly Starter | $97/mo | Recurring monthly | `STRIPE_PRICE_STARTER` |
| Lead Friendly Growth | $297/mo | Recurring monthly | `STRIPE_PRICE_GROWTH` |
| Lead Friendly Agency | $497/mo | Recurring monthly | `STRIPE_PRICE_AGENCY` |

On each product page, click the price → copy the `price_...` ID.

### 2b. Create the webhook endpoint

Stripe Dashboard → Developers → Webhooks → **Add endpoint**:
- **URL**: `https://www.leadfriendly.com/api/stripe/webhook`
- **Events**: select
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_succeeded`
  - `invoice.payment_failed`
- After creating, click **Reveal** on the signing secret → copy to `STRIPE_WEBHOOK_SECRET`.

### 2c. Set all Stripe env vars in Vercel

```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_STARTER=price_...
STRIPE_PRICE_GROWTH=price_...
STRIPE_PRICE_AGENCY=price_...
```

(Start with test keys if you're nervous — flip to live later.)

### 2d. DO NOT flip the subscription gate yet

Leave `SUBSCRIPTION_GATE_ENABLED` **unset** (or set to `false`) until you've
verified checkout end-to-end. Flipping it on with no prices configured will
lock every existing user out.

---

## 3) Deploy to Vercel (5 min)

```bash
cd ~/Desktop/lead-friendly
vercel --prod
```

Watch the build — any TypeScript errors here that didn't show up locally
usually come from env mismatches. If the build fails, `vercel logs --follow`.

---

## 4) Test the voice call fix (10 min)

This is the critical one. With the new logging, we'll know exactly where
silence came from before.

1. Open your phone, call your Telnyx number.
2. Hang up after 10 seconds of whatever happens.
3. In Supabase SQL editor:
   ```sql
   select event_type, received_at, payload->>'state' as state
   from voice_webhook_events
   order by received_at desc limit 30;
   ```
4. You should see: `call.initiated` → `call.answered` → `call.speak.ended` → `call.gather_using_speech.ended`.

If `call.gather_using_speech.ended` comes back with `result: 'no-speech'`
but your voice was audible, Telnyx ASR isn't configured — check the
`speech_model` on the answer route.

If you never see `call.speak.ended`, ElevenLabs TTS isn't firing — check
`ELEVENLABS_API_KEY` and the voice_id on your agents.

### Test the new "Sarah" fix

Previously every call spoke the hardcoded Sarah greeting regardless of
which agent was attached. With `loadAgent` now selecting the correct
columns (`greeting_message` + `system_prompt`), calling a contact that
belongs to an org with a real agent should speak that agent's greeting.

Quick check:
```sql
select id, name, greeting_message, system_prompt, voice_id
from ai_agents where organization_id = '<your-org-id>';
```
Then make a manual test call from the Agent Builder's new "Call me" button.

---

## 5) Test the Human Dialer (5 min)

1. Visit https://www.leadfriendly.com/calls/human
2. Status strip should go: Connecting… → Ready to dial
3. Dial your own mobile, answer it.
4. Hang up, check /calls — you should see a call with no AI agent attached.

If the status strip stays on "Connecting…" forever:
- Check `TELNYX_SIP_USERNAME` + `TELNYX_SIP_PASSWORD` in Vercel
- Or set `TELNYX_SIP_CONNECTION_ID` + `TELNYX_API_KEY` for token auth

If it shows a red error: the browser's mic permission might be blocked.

---

## 6) Test the Contacts "AI Call" split (2 min)

1. Visit /contacts, click any contact with a phone
2. You should see TWO call buttons: "AI Call" (indigo) and "Call (You)" (emerald)
3. Click AI Call — the outbound call starts with your real agent's voice
4. Click Call (You) — redirects to /calls/human with the contact prefilled

---

## 7) Test the Campaign launcher (3 min)

1. Create a campaign with 2-3 contacts
2. Start it — calls should be triggered from YOUR org's phone number (not a
   hardcoded one) and dedupe against already-called contacts

---

## 8) Set up Google Calendar OAuth (optional, 20 min)

Only needed if you want AI agents to actually push bookings into Google
Calendar. Without this, the `book_meeting` tool still writes to the
`appointments` table — the calendar sync is additive.

1. https://console.cloud.google.com/apis/credentials → OAuth 2.0 Client IDs → Create
2. Application type: Web application
3. Authorized redirect URI: `https://www.leadfriendly.com/api/google-calendar/callback`
4. Copy Client ID + Secret → Vercel env:
   - `GOOGLE_CALENDAR_CLIENT_ID`
   - `GOOGLE_CALENDAR_CLIENT_SECRET`
   - `GOOGLE_CALENDAR_REDIRECT_URI=https://www.leadfriendly.com/api/google-calendar/callback`

Note: the actual OAuth callback handler isn't built yet — that's next sprint.
For now, the `appointments` row is authoritative.

---

## 9) Flip the subscription gate (5 min)

After confirming:
- [ ] Stripe test checkout succeeds
- [ ] Webhook flips org.subscription_status to 'active' in Supabase
- [ ] Your own org has subscription_status = 'active'

THEN flip `SUBSCRIPTION_GATE_ENABLED=true` in Vercel env → redeploy.

This starts forcing all users without an active sub to /billing. If you
want to soften this, you can backfill `trial_ends_at` for existing orgs:

```sql
update organizations set trial_ends_at = now() + interval '14 days'
where subscription_status is null;
```

That gives everyone a 14-day trial before they hit the paywall.

---

## 10) Sanity-check the new AI booking tool (5 min)

Call your Telnyx number → when the agent asks, say "can you book a meeting
for tomorrow at 3 pm." After the call hangs up:

```sql
select id, title, appointment_date, start_time, status, notes, booked_by
from appointments order by created_at desc limit 5;
```

You should see a new row with `booked_by='ai_agent'`.

If not — Claude may not have chosen to use the tool. Try being more
explicit: "Yes, please book me for tomorrow at 3 PM." The tool prompt
instructs Claude to only call it after explicit confirmation.

---

## If anything goes wrong

- Voice issues → check `voice_webhook_events` table first
- Stripe webhook not firing → Stripe Dashboard → Webhooks → your endpoint → "Recent deliveries" tab shows every attempt + response
- Deploy fails → `vercel logs --follow` during the build
- Contact Call button 400s → confirm `phone_numbers` has at least one `status='active'` row for your org
- Human Dialer "No SIP credentials" → see /api/telnyx/token/route.ts for the two supported auth modes

---

**When in doubt, read `voice_webhook_events` and `calls` tables. The whole
pipeline writes to them.**
