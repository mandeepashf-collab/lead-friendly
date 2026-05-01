-- =============================================================
-- 039: Drop per-call debit unique constraint, finalize record_call_usage
-- =============================================================
-- Originally added in 038 as multi-trigger protection. Wrong design:
-- - SAME-event retries are blocked by record_call_usage() reading
--   last_billed_seconds at top and short-circuiting if delta <= 0.
-- - DIFFERENT events on the same call (call grew from 90s to 150s) are
--   LEGITIMATE additional billings and should produce additional debits.
--
-- Idempotency for billing comes from last_billed_seconds delta math,
-- not from a unique constraint on the ledger.
--
-- Applied via Supabase MCP: 2026-04-30
-- =============================================================

DROP INDEX IF EXISTS uq_wallet_txns_call_debit;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_wallet_txns_call'
  ) THEN
    CREATE INDEX idx_wallet_txns_call ON wallet_transactions(call_id) WHERE call_id IS NOT NULL;
  END IF;
END $$;

-- =============================================================
-- record_call_usage: canonical version
-- =============================================================
-- Atomic billing: locks call, computes seconds delta vs last_billed_seconds,
-- increments period minutes, computes incremental overage, debits wallet.
-- Idempotent against webhook retries via last_billed_seconds short-circuit.
-- Service role only.
--
-- Hardcoded tier bundle/rate values mirror src/config/pricing.ts.
-- If pricing changes, BOTH must be updated together.
-- =============================================================

CREATE OR REPLACE FUNCTION record_call_usage(
  p_call_id uuid,
  p_total_duration_seconds integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_call_row record;
  v_seconds_delta integer;
  v_minutes_added integer;
  v_prev_total_minutes integer;
  v_new_total_minutes integer;
  v_tier pricing_tier;
  v_included_minutes integer;
  v_overage_rate_x10000 integer;
  v_incremental_overage_minutes integer;
  v_debit_cents integer;
  v_debit_result jsonb;
  v_overage_skipped_reason text;
BEGIN
  SELECT id, organization_id, last_billed_seconds, status
    INTO v_call_row
  FROM calls WHERE id = p_call_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Call % not found', p_call_id;
  END IF;

  v_seconds_delta := p_total_duration_seconds - v_call_row.last_billed_seconds;

  IF v_seconds_delta <= 0 THEN
    RETURN jsonb_build_object(
      'billed', false,
      'reason', 'no_new_seconds',
      'seconds_delta', v_seconds_delta,
      'last_billed_seconds', v_call_row.last_billed_seconds
    );
  END IF;

  v_minutes_added := CEIL(v_seconds_delta::numeric / 60)::integer;

  UPDATE calls SET last_billed_seconds = p_total_duration_seconds WHERE id = p_call_id;

  UPDATE organizations
  SET current_period_minutes_used = current_period_minutes_used + v_minutes_added
  WHERE id = v_call_row.organization_id
  RETURNING current_period_minutes_used - v_minutes_added, current_period_minutes_used, tier
    INTO v_prev_total_minutes, v_new_total_minutes, v_tier;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organization % not found for call %', v_call_row.organization_id, p_call_id;
  END IF;

  -- Mirror of src/config/pricing.ts tier definitions
  CASE v_tier
    WHEN 'solo' THEN
      v_included_minutes := 30;
      v_overage_rate_x10000 := 0;
    WHEN 'starter' THEN
      v_included_minutes := 350;
      v_overage_rate_x10000 := 1600;  -- $0.16
    WHEN 'pro' THEN
      v_included_minutes := 750;
      v_overage_rate_x10000 := 1400;  -- $0.14
    WHEN 'agency' THEN
      v_included_minutes := 1250;
      v_overage_rate_x10000 := 1200;  -- $0.12
    WHEN 'founding' THEN
      v_included_minutes := 750;
      v_overage_rate_x10000 := 1400;  -- $0.14 (mirrors Pro)
    WHEN 'custom' THEN
      v_included_minutes := 0;
      v_overage_rate_x10000 := 0;
    ELSE
      v_included_minutes := 0;
      v_overage_rate_x10000 := 0;
  END CASE;

  -- Incremental overage: minutes that NEWLY crossed the bundle line in this delta
  v_incremental_overage_minutes :=
    GREATEST(0, v_new_total_minutes - v_included_minutes)
    - GREATEST(0, v_prev_total_minutes - v_included_minutes);

  IF v_overage_rate_x10000 = 0 OR v_incremental_overage_minutes <= 0 THEN
    v_overage_skipped_reason := CASE
      WHEN v_overage_rate_x10000 = 0 THEN 'tier_no_overage'
      WHEN v_incremental_overage_minutes <= 0 THEN 'within_bundle'
      ELSE NULL
    END;
    RETURN jsonb_build_object(
      'billed', true,
      'minutes_added', v_minutes_added,
      'new_total_minutes', v_new_total_minutes,
      'incremental_overage_minutes', v_incremental_overage_minutes,
      'tier', v_tier::text,
      'overage_skipped_reason', v_overage_skipped_reason,
      'wallet_debited_cents', 0
    );
  END IF;

  v_debit_cents := CEIL(v_incremental_overage_minutes * v_overage_rate_x10000 / 100.0)::integer;

  v_debit_result := debit_wallet(
    v_call_row.organization_id,
    v_debit_cents,
    format('Call overage: %s min @ tier=%s', v_incremental_overage_minutes, v_tier),
    p_call_id
  );

  RETURN jsonb_build_object(
    'billed', true,
    'minutes_added', v_minutes_added,
    'new_total_minutes', v_new_total_minutes,
    'incremental_overage_minutes', v_incremental_overage_minutes,
    'tier', v_tier::text,
    'wallet_debited_cents', CASE WHEN (v_debit_result->>'success')::boolean THEN v_debit_cents ELSE 0 END,
    'wallet_result', v_debit_result
  );
END $$;

REVOKE ALL ON FUNCTION record_call_usage(uuid, integer) FROM public;
GRANT EXECUTE ON FUNCTION record_call_usage(uuid, integer) TO service_role;

COMMENT ON FUNCTION record_call_usage(uuid, integer) IS
  'Atomic billing: locks call, computes seconds delta vs last_billed_seconds, increments period minutes, computes incremental overage, debits wallet. Idempotent. Service role only.';
