-- =============================================================
-- 037: Atomic RPCs for minute usage + wallet operations
-- =============================================================
-- All money operations go through these RPCs to ensure:
--   - Race condition safety (FOR UPDATE row locks)
--   - Append-only ledger (every change creates a wallet_transactions row)
--   - Returns enough info for callers to trigger downstream actions
--     (auto-reload, block call, send alert email)
--
-- Applied via Supabase MCP: 2026-04-30
-- =============================================================

-- -------------------------------------------------------------
-- increment_minutes_used: atomic increment of period minute counter
-- -------------------------------------------------------------
-- Round up: 30s = 1 min, 61s = 2 min (industry standard).
-- Returns: { minutes_added, new_total }
-- Caller decides whether overage applies based on tier bundle limit.
CREATE OR REPLACE FUNCTION increment_minutes_used(
  p_org_id uuid,
  p_seconds integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_minutes_added integer;
  v_new_total integer;
BEGIN
  IF p_seconds <= 0 THEN
    RETURN jsonb_build_object('minutes_added', 0, 'new_total',
      (SELECT current_period_minutes_used FROM organizations WHERE id = p_org_id));
  END IF;

  v_minutes_added := CEIL(p_seconds::numeric / 60)::integer;

  UPDATE organizations
  SET current_period_minutes_used = current_period_minutes_used + v_minutes_added
  WHERE id = p_org_id
  RETURNING current_period_minutes_used INTO v_new_total;

  IF v_new_total IS NULL THEN
    RAISE EXCEPTION 'Organization % not found', p_org_id;
  END IF;

  RETURN jsonb_build_object(
    'minutes_added', v_minutes_added,
    'new_total', v_new_total
  );
END $$;

REVOKE ALL ON FUNCTION increment_minutes_used(uuid, integer) FROM public;
GRANT EXECUTE ON FUNCTION increment_minutes_used(uuid, integer) TO service_role;

COMMENT ON FUNCTION increment_minutes_used(uuid, integer) IS
  'Atomic: rounds seconds up to whole minutes, increments organizations.current_period_minutes_used. Service role only.';

-- -------------------------------------------------------------
-- debit_wallet: atomic debit with insufficient-funds protection
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION debit_wallet(
  p_org_id uuid,
  p_amount_cents integer,
  p_description text,
  p_call_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_balance_before integer;
  v_balance_after integer;
  v_threshold integer;
  v_blocked boolean;
BEGIN
  IF p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'debit_wallet: p_amount_cents must be positive, got %', p_amount_cents;
  END IF;

  -- Lock the wallet row
  SELECT balance_cents, auto_reload_threshold_cents, is_blocked
    INTO v_balance_before, v_threshold, v_blocked
  FROM org_wallets WHERE organization_id = p_org_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'org_wallets row missing for organization %', p_org_id;
  END IF;

  IF v_blocked THEN
    RETURN jsonb_build_object('success', false, 'reason', 'wallet_blocked', 'balance_cents', v_balance_before);
  END IF;

  IF v_balance_before < p_amount_cents THEN
    UPDATE org_wallets SET
      is_blocked = true,
      blocked_reason = 'zero_balance',
      blocked_at = now()
    WHERE organization_id = p_org_id;
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'insufficient_funds',
      'balance_cents', v_balance_before
    );
  END IF;

  v_balance_after := v_balance_before - p_amount_cents;

  UPDATE org_wallets SET balance_cents = v_balance_after WHERE organization_id = p_org_id;

  INSERT INTO wallet_transactions (
    organization_id, type, amount_cents, balance_before_cents, balance_after_cents,
    description, call_id
  ) VALUES (
    p_org_id, 'debit', -p_amount_cents, v_balance_before, v_balance_after,
    p_description, p_call_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'balance_before_cents', v_balance_before,
    'balance_after_cents', v_balance_after,
    'needs_reload', v_balance_after < v_threshold
  );
END $$;

REVOKE ALL ON FUNCTION debit_wallet(uuid, integer, text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION debit_wallet(uuid, integer, text, uuid) TO service_role;

COMMENT ON FUNCTION debit_wallet(uuid, integer, text, uuid) IS
  'Atomic: locks wallet row, debits balance_cents, inserts wallet_transactions row. Blocks wallet on insufficient funds. Service role only.';

-- -------------------------------------------------------------
-- credit_wallet: atomic credit (auto-reload, manual top-up, refund)
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION credit_wallet(
  p_org_id uuid,
  p_amount_cents integer,
  p_type wallet_txn_type,
  p_description text,
  p_stripe_charge_id text DEFAULT NULL,
  p_stripe_pi_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_balance_before integer;
  v_balance_after integer;
BEGIN
  IF p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'credit_wallet: p_amount_cents must be positive, got %', p_amount_cents;
  END IF;

  IF p_type NOT IN ('manual_credit', 'auto_reload', 'refund', 'adjustment') THEN
    RAISE EXCEPTION 'credit_wallet: invalid type %', p_type;
  END IF;

  -- Lock and read
  SELECT balance_cents INTO v_balance_before
  FROM org_wallets WHERE organization_id = p_org_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'org_wallets row missing for organization %', p_org_id;
  END IF;

  v_balance_after := v_balance_before + p_amount_cents;

  UPDATE org_wallets SET
    balance_cents = v_balance_after,
    is_blocked = false,
    blocked_reason = NULL,
    blocked_at = NULL
  WHERE organization_id = p_org_id;

  INSERT INTO wallet_transactions (
    organization_id, type, amount_cents, balance_before_cents, balance_after_cents,
    description, stripe_charge_id, stripe_payment_intent_id
  ) VALUES (
    p_org_id, p_type, p_amount_cents, v_balance_before, v_balance_after,
    p_description, p_stripe_charge_id, p_stripe_pi_id
  );

  RETURN jsonb_build_object(
    'balance_before_cents', v_balance_before,
    'balance_after_cents', v_balance_after
  );
END $$;

REVOKE ALL ON FUNCTION credit_wallet(uuid, integer, wallet_txn_type, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION credit_wallet(uuid, integer, wallet_txn_type, text, text, text) TO service_role;

COMMENT ON FUNCTION credit_wallet IS
  'Atomic: credits wallet, auto-unblocks, inserts ledger row. Used by manual top-up + auto-reload + Stripe webhook refunds. Service role only.';

-- -------------------------------------------------------------
-- claim_founding_spot: atomic claim of one of 100 spots
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION claim_founding_spot(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_claimed integer;
  v_total integer;
  v_assigned_number integer;
BEGIN
  -- Atomic increment with WHERE clause that fails if spots exhausted
  UPDATE founding_member_counter
  SET spots_claimed = spots_claimed + 1, updated_at = now()
  WHERE id = true AND spots_claimed < spots_total
  RETURNING spots_claimed, spots_total INTO v_claimed, v_total;

  IF v_claimed IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'sold_out');
  END IF;

  v_assigned_number := v_claimed;  -- 1..100

  UPDATE organizations SET
    is_founding_member = true,
    founding_member_number = v_assigned_number,
    tier = 'founding'
  WHERE id = p_org_id;

  IF NOT FOUND THEN
    -- Rollback the counter increment if org doesn't exist
    UPDATE founding_member_counter SET spots_claimed = spots_claimed - 1 WHERE id = true;
    RAISE EXCEPTION 'Organization % not found', p_org_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'member_number', v_assigned_number,
    'spots_remaining', v_total - v_claimed
  );
END $$;

REVOKE ALL ON FUNCTION claim_founding_spot(uuid) FROM public;
GRANT EXECUTE ON FUNCTION claim_founding_spot(uuid) TO service_role;

COMMENT ON FUNCTION claim_founding_spot(uuid) IS
  'Atomic: increments spots_claimed (capped at spots_total), assigns member number, sets tier=founding. Service role only.';
