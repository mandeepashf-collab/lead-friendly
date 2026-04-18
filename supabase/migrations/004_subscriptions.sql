-- ────────────────────────────────────────────────────────────────
-- 004_subscriptions.sql
--
-- Adds the Stripe subscription columns used by /api/stripe/webhook
-- and the middleware subscription gating. Also adds a `notes` column
-- to `calls` so users can annotate calls from the UI.
--
-- Run this in Supabase SQL editor BEFORE enabling the Stripe webhook,
-- otherwise the webhook will fail to persist subscription state.
-- ────────────────────────────────────────────────────────────────

-- organizations: Stripe subscription fields
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS stripe_customer_id              TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id          TEXT,
  ADD COLUMN IF NOT EXISTS subscription_status             TEXT,
  ADD COLUMN IF NOT EXISTS subscription_plan_id            TEXT,
  ADD COLUMN IF NOT EXISTS subscription_current_period_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_ends_at                   TIMESTAMPTZ;

-- Unique index on customer id so we can look up orgs by Stripe customer
CREATE UNIQUE INDEX IF NOT EXISTS organizations_stripe_customer_id_unique
  ON organizations (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- calls: annotation column
ALTER TABLE calls
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL;

-- appointments: book_meeting tool additions
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS notes   TEXT;

-- voice_webhook_events diagnostics table (used by the voice webhook logger)
CREATE TABLE IF NOT EXISTS voice_webhook_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  event_type       TEXT,
  call_control_id  TEXT,
  payload          JSONB,
  raw_body         TEXT
);

CREATE INDEX IF NOT EXISTS voice_webhook_events_call_control_id_idx
  ON voice_webhook_events (call_control_id, created_at DESC);

CREATE INDEX IF NOT EXISTS voice_webhook_events_event_type_idx
  ON voice_webhook_events (event_type, created_at DESC);

-- Retention: keep 7 days of diagnostic events. Drop older ones with a cron
-- (set up in Supabase Dashboard if desired) — uncomment to enable now:
-- DELETE FROM voice_webhook_events WHERE created_at < NOW() - INTERVAL '7 days';
