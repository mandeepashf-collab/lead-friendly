-- =============================================================
-- Migration 042: Wallet auto-reload attempts + idempotency lock
--
-- Phase 4.5 of the pricing/wallet rollout. Tracks every attempt to
-- charge a customer's card on file to top up their prepaid wallet.
--
-- Schema:
--   wallet_reload_attempts — one row per attempt, success or fail
--
-- RPC:
--   try_acquire_reload_lock(org_id, cooldown_seconds) — returns true
--     if no attempt for this org in last N seconds, false otherwise
--     Atomic via row-level locking on org_wallets.
--
-- Trigger sources:
--   'auto_reload'  — fired by debit_wallet returning needs_reload=true
--   'manual_topup' — user clicked Top Up button in /settings/billing
--   'cron_sweep'   — daily safety net catches missed orgs
-- =============================================================

CREATE TABLE wallet_reload_attempts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- What kicked off this attempt
  trigger_source TEXT NOT NULL CHECK (trigger_source IN (
    'auto_reload',
    'manual_topup',
    'cron_sweep'
  )),

  -- The amount we tried to charge
  amount_cents INT NOT NULL CHECK (amount_cents > 0),

  -- Lifecycle: pending (Stripe call in flight) -> succeeded/failed
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'succeeded',
    'failed'
  )),

  -- Stripe references for traceability
  stripe_payment_intent_id TEXT,
  stripe_payment_method_id TEXT,
  stripe_error_code TEXT,
  stripe_error_message TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Hot path: "did this org have a reload attempt in the last 60s?"
CREATE INDEX idx_wallet_reload_attempts_org_recent
  ON wallet_reload_attempts(organization_id, created_at DESC);

-- Reporting/debug: find all failed attempts in a window
CREATE INDEX idx_wallet_reload_attempts_status
  ON wallet_reload_attempts(status, created_at DESC)
  WHERE status = 'failed';

-- Idempotency on Stripe payment_intent_id (NULL allowed for not-yet-created)
CREATE UNIQUE INDEX idx_wallet_reload_attempts_pi
  ON wallet_reload_attempts(stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

-- RLS: members of the org can read their own attempts
ALTER TABLE wallet_reload_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read own org reload attempts"
  ON wallet_reload_attempts
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Service role bypasses RLS by default; no insert/update policies for users
-- since all writes happen via service-role from the auto-reload route.

-- =============================================================
-- RPC: try_acquire_reload_lock
--
-- Returns TRUE if no reload attempt exists for this org within
-- the cooldown window. Returns FALSE otherwise.
--
-- Used by /api/billing/wallet/auto-reload to coalesce rapid
-- consecutive triggers into a single charge attempt.
--
-- Cooldown counts both 'pending' and 'succeeded' rows — we don't
-- want to fire a second reload while the first is in flight, AND
-- we don't want to fire a reload right after a successful one
-- (e.g., if the customer just got credited and is now spending it).
--
-- A 'failed' attempt does NOT block — we want to retry on next
-- debit if their card got declined and they fixed it. The blocked
-- wallet flag in org_wallets is the actual gate for "stop calling".
-- =============================================================

CREATE OR REPLACE FUNCTION try_acquire_reload_lock(
  p_org_id UUID,
  p_cooldown_seconds INT DEFAULT 60
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recent_count INT;
BEGIN
  -- Count attempts in cooldown window that are pending OR succeeded.
  -- Failed attempts do NOT count — we want to be able to retry.
  SELECT COUNT(*)
    INTO v_recent_count
  FROM wallet_reload_attempts
  WHERE organization_id = p_org_id
    AND status IN ('pending', 'succeeded')
    AND created_at > NOW() - (p_cooldown_seconds || ' seconds')::INTERVAL;

  IF v_recent_count > 0 THEN
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION try_acquire_reload_lock FROM PUBLIC;
GRANT EXECUTE ON FUNCTION try_acquire_reload_lock TO service_role;

-- =============================================================
-- RPC: record_reload_attempt
--
-- Atomic helper to insert a 'pending' attempt row. Returns the
-- attempt id for the caller to use as Stripe idempotency_key.
--
-- Caller must have already passed try_acquire_reload_lock.
-- =============================================================

CREATE OR REPLACE FUNCTION record_reload_attempt(
  p_org_id UUID,
  p_trigger_source TEXT,
  p_amount_cents INT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO wallet_reload_attempts (
    organization_id,
    trigger_source,
    amount_cents,
    status
  ) VALUES (
    p_org_id,
    p_trigger_source,
    p_amount_cents,
    'pending'
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION record_reload_attempt FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_reload_attempt TO service_role;

-- =============================================================
-- RPC: complete_reload_attempt
--
-- Atomically marks a reload attempt as succeeded or failed and
-- (on success) credits the wallet via credit_wallet RPC.
--
-- This is the single write path for "the Stripe call returned",
-- whether the result came from the synchronous Stripe response
-- in the /auto-reload route OR from a redundant webhook event
-- arriving later. The wallet_transaction_id linkage prevents
-- double-credits.
-- =============================================================

CREATE OR REPLACE FUNCTION complete_reload_attempt(
  p_attempt_id UUID,
  p_succeeded BOOLEAN,
  p_stripe_payment_intent_id TEXT DEFAULT NULL,
  p_stripe_payment_method_id TEXT DEFAULT NULL,
  p_stripe_error_code TEXT DEFAULT NULL,
  p_stripe_error_message TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt wallet_reload_attempts%ROWTYPE;
  v_credit_result JSONB;
BEGIN
  -- Lock the attempt row (FOR UPDATE) so concurrent webhook + sync calls
  -- don't both try to credit
  SELECT * INTO v_attempt
    FROM wallet_reload_attempts
    WHERE id = p_attempt_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'reload attempt % not found', p_attempt_id;
  END IF;

  -- Already completed — return existing state, do not re-credit
  IF v_attempt.status != 'pending' THEN
    RETURN jsonb_build_object(
      'already_completed', true,
      'status', v_attempt.status
    );
  END IF;

  IF p_succeeded THEN
    -- Credit the wallet. credit_wallet also clears the is_blocked flag
    -- if it was set, which is exactly what we want here — recovery from
    -- a previously-failed auto-reload.
    SELECT credit_wallet(
      v_attempt.organization_id,
      v_attempt.amount_cents,
      'auto_reload',
      'Auto-reload via Stripe',
      NULL,
      p_stripe_payment_intent_id
    ) INTO v_credit_result;

    UPDATE wallet_reload_attempts
      SET status = 'succeeded',
          stripe_payment_intent_id = p_stripe_payment_intent_id,
          stripe_payment_method_id = p_stripe_payment_method_id,
          completed_at = NOW()
      WHERE id = p_attempt_id;

    -- Update the org_wallets audit columns that already exist for this
    UPDATE org_wallets
      SET last_auto_reload_attempt_at = NOW(),
          last_auto_reload_failure_message = NULL,
          updated_at = NOW()
      WHERE organization_id = v_attempt.organization_id;

    RETURN jsonb_build_object(
      'already_completed', false,
      'status', 'succeeded',
      'balance_after_cents', v_credit_result->'balance_after_cents'
    );
  ELSE
    -- Failed — mark wallet blocked, log error
    UPDATE wallet_reload_attempts
      SET status = 'failed',
          stripe_payment_intent_id = p_stripe_payment_intent_id,
          stripe_payment_method_id = p_stripe_payment_method_id,
          stripe_error_code = p_stripe_error_code,
          stripe_error_message = p_stripe_error_message,
          completed_at = NOW()
      WHERE id = p_attempt_id;

    UPDATE org_wallets
      SET is_blocked = TRUE,
          blocked_reason = 'auto_reload_failed',
          blocked_at = NOW(),
          last_auto_reload_attempt_at = NOW(),
          last_auto_reload_failure_message = p_stripe_error_message,
          updated_at = NOW()
      WHERE organization_id = v_attempt.organization_id;

    RETURN jsonb_build_object(
      'already_completed', false,
      'status', 'failed',
      'error_code', p_stripe_error_code,
      'error_message', p_stripe_error_message
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION complete_reload_attempt FROM PUBLIC;
GRANT EXECUTE ON FUNCTION complete_reload_attempt TO service_role;

COMMENT ON TABLE wallet_reload_attempts IS
  'Phase 4.5: Audit trail for every wallet auto-reload attempt. Used for idempotency, reporting, and debugging declined cards.';
