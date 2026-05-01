-- =============================================================
-- 041: Minute period reset infrastructure
-- =============================================================
-- Subscription-anchored period rollover. Two callers:
--   1. Stripe webhook (customer.subscription.updated) -- happy path
--   2. Daily cron /api/cron/reset-period-bundles -- safety net for missed webhooks
--
-- The RPC is idempotent: if called with a period_end <= what's already stored,
-- it does nothing. This protects against webhook + cron racing or replay.
--
-- Applied via Supabase MCP: 2026-04-30
-- =============================================================

-- 1. Audit log for period resets (debugging + ops visibility)
CREATE TABLE period_reset_log (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  old_period_starts_at timestamptz,
  old_period_ends_at timestamptz,
  new_period_starts_at timestamptz NOT NULL,
  new_period_ends_at timestamptz NOT NULL,
  minutes_used_at_reset integer NOT NULL,
  source text NOT NULL CHECK (source IN ('stripe_webhook', 'cron_safety', 'manual', 'initial_subscription')),
  stripe_subscription_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_period_reset_log_org_created ON period_reset_log(organization_id, created_at DESC);
CREATE INDEX idx_period_reset_log_source_created ON period_reset_log(source, created_at DESC);

ALTER TABLE period_reset_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members can view own period resets" ON period_reset_log
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
  );

COMMENT ON TABLE period_reset_log IS
  'Audit trail of every minute-period rollover. Debugging + ops visibility for missed webhooks.';

-- 2. reset_minute_period RPC -- atomic, idempotent
CREATE OR REPLACE FUNCTION reset_minute_period(
  p_org_id uuid,
  p_new_period_starts_at timestamptz,
  p_new_period_ends_at timestamptz,
  p_source text,
  p_stripe_subscription_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_current_starts_at timestamptz;
  v_current_ends_at timestamptz;
  v_minutes_used integer;
BEGIN
  IF p_source NOT IN ('stripe_webhook', 'cron_safety', 'manual', 'initial_subscription') THEN
    RAISE EXCEPTION 'reset_minute_period: invalid source %', p_source;
  END IF;

  IF p_new_period_ends_at <= p_new_period_starts_at THEN
    RAISE EXCEPTION 'reset_minute_period: new period_ends_at (%) must be after starts_at (%)',
      p_new_period_ends_at, p_new_period_starts_at;
  END IF;

  -- Lock the org row to prevent concurrent resets
  SELECT current_period_starts_at, current_period_ends_at, current_period_minutes_used
    INTO v_current_starts_at, v_current_ends_at, v_minutes_used
  FROM organizations WHERE id = p_org_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organization % not found', p_org_id;
  END IF;

  -- Idempotency: if the new period_end is not strictly newer, no-op.
  IF v_current_ends_at IS NOT NULL AND p_new_period_ends_at <= v_current_ends_at THEN
    RETURN jsonb_build_object(
      'reset', false,
      'reason', 'period_not_advancing',
      'current_period_ends_at', v_current_ends_at,
      'attempted_period_ends_at', p_new_period_ends_at
    );
  END IF;

  UPDATE organizations
  SET current_period_starts_at = p_new_period_starts_at,
      current_period_ends_at = p_new_period_ends_at,
      current_period_minutes_used = 0
  WHERE id = p_org_id;

  INSERT INTO period_reset_log (
    organization_id,
    old_period_starts_at,
    old_period_ends_at,
    new_period_starts_at,
    new_period_ends_at,
    minutes_used_at_reset,
    source,
    stripe_subscription_id
  ) VALUES (
    p_org_id,
    v_current_starts_at,
    v_current_ends_at,
    p_new_period_starts_at,
    p_new_period_ends_at,
    v_minutes_used,
    p_source,
    p_stripe_subscription_id
  );

  RETURN jsonb_build_object(
    'reset', true,
    'old_period_ends_at', v_current_ends_at,
    'new_period_ends_at', p_new_period_ends_at,
    'minutes_reset', v_minutes_used
  );
END $$;

REVOKE ALL ON FUNCTION reset_minute_period(uuid, timestamptz, timestamptz, text, text) FROM public;
GRANT EXECUTE ON FUNCTION reset_minute_period(uuid, timestamptz, timestamptz, text, text) TO service_role;

COMMENT ON FUNCTION reset_minute_period IS
  'Atomic period rollover: zeros current_period_minutes_used, advances period window, logs to audit table. Idempotent against replays. Service role only.';
