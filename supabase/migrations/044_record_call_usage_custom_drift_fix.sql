-- 044_record_call_usage_custom_drift_fix.sql
-- D3 of custom-pricing-architecture.md (May 2, 2026).
--
-- DRIFT FIX, NOT BEHAVIOR CHANGE.
--
-- Background:
--   The deployed prod version of record_call_usage was hot-patched after
--   mig 039 to (a) read custom_included_minutes / custom_overage_rate_x10000
--   from the org row when tier='custom', and (b) resolve the BILLING org
--   for sub-account calls via get_billing_org_id (rolling sub-account usage
--   up to the parent agency). That patch never landed in a tracked migration
--   file, so the repo's view of record_call_usage (mig 039) is stale and
--   would regress the prod behavior if anyone ever recreated the DB from
--   migrations.
--
--   D3 needs the deployed behavior to be authoritative because the
--   custom-contract billing flow depends on it. This migration captures
--   the deployed function body so repo + prod match.
--
-- Verification (May 2, 2026): pg_get_functiondef on prod returned the body
-- below verbatim. After applying this migration the function definition is
-- byte-identical to what's already deployed — the migration is effectively
-- a no-op against prod, but is required for any DB recreated from
-- migrations to behave correctly.
--
-- Behavior summary (unchanged from deployed):
--   1. Resolves the call to its billing org (sub-accounts roll up to parent
--      agency via get_billing_org_id).
--   2. Increments billing org's current_period_minutes_used by the seconds
--      delta vs last_billed_seconds (idempotent against multi-trigger
--      webhooks).
--   3. Reads tier + custom_included_minutes + custom_overage_rate_x10000
--      from the billing org. Custom values, if non-null, override the tier
--      defaults below.
--   4. Tier defaults (mirrors src/config/pricing.ts):
--        solo:     30 min, 0¢ overage    (no overage on free tier)
--        starter:  350 min, $0.16/min
--        pro:      750 min, $0.14/min
--        agency:   1250 min, $0.12/min
--        founding: 750 min, $0.14/min    (mirrors Pro)
--        custom:   placeholders (overridden by org row values when set)
--   5. Computes incremental overage (only minutes that JUST crossed the
--      bundle line in this delta) and debits billing org's wallet.
--   6. Returns a jsonb result with billing details, including
--      custom_pricing_applied flag for downstream observability.
--
-- No new behavior. No DDL. Function body only.

begin;

CREATE OR REPLACE FUNCTION public.record_call_usage(
  p_call_id uuid,
  p_total_duration_seconds integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE
  v_call_row record;
  v_billing_org_id uuid;
  v_seconds_delta integer;
  v_minutes_added integer;
  v_prev_total_minutes integer;
  v_new_total_minutes integer;
  v_billing_tier pricing_tier;
  v_custom_included integer;
  v_custom_rate integer;
  v_included_minutes integer;
  v_overage_rate_x10000 integer;
  v_incremental_overage_minutes integer;
  v_debit_cents integer;
  v_debit_result jsonb;
  v_overage_skipped_reason text;
BEGIN
  -- Lock the call row
  SELECT id, organization_id, last_billed_seconds, status
    INTO v_call_row
  FROM calls WHERE id = p_call_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Call % not found', p_call_id;
  END IF;

  -- Phase 8: resolve to the billing org. For sub-accounts, this is the parent
  -- agency. For top-level orgs, this is the org itself.
  v_billing_org_id := get_billing_org_id(v_call_row.organization_id);

  -- Compute delta vs last billed amount
  v_seconds_delta := p_total_duration_seconds - v_call_row.last_billed_seconds;
  IF v_seconds_delta <= 0 THEN
    RETURN jsonb_build_object(
      'billed', false,
      'reason', 'no_new_seconds',
      'seconds_delta', v_seconds_delta,
      'last_billed_seconds', v_call_row.last_billed_seconds,
      'billing_org_id', v_billing_org_id,
      'call_org_id', v_call_row.organization_id
    );
  END IF;

  v_minutes_added := CEIL(v_seconds_delta::numeric / 60)::integer;

  -- Mark the call as billed up to this point (idempotency anchor)
  UPDATE calls SET last_billed_seconds = p_total_duration_seconds WHERE id = p_call_id;

  -- Phase 8: increment minutes on the BILLING org, not the call's org.
  -- Sub-accounts have their own current_period_minutes_used = 0 always
  -- (tracked separately for reporting if we add per-sub-account analytics later).
  -- Read tier + custom pricing from billing org.
  UPDATE organizations
    SET current_period_minutes_used = current_period_minutes_used + v_minutes_added
  WHERE id = v_billing_org_id
  RETURNING
    current_period_minutes_used - v_minutes_added,
    current_period_minutes_used,
    tier,
    custom_included_minutes,
    custom_overage_rate_x10000
  INTO
    v_prev_total_minutes,
    v_new_total_minutes,
    v_billing_tier,
    v_custom_included,
    v_custom_rate;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Billing org % not found for call %', v_billing_org_id, p_call_id;
  END IF;

  -- Tier defaults (same as before)
  CASE v_billing_tier
    WHEN 'solo' THEN
      v_included_minutes := 30;
      v_overage_rate_x10000 := 0;
    WHEN 'starter' THEN
      v_included_minutes := 350;
      v_overage_rate_x10000 := 1600;
    WHEN 'pro' THEN
      v_included_minutes := 750;
      v_overage_rate_x10000 := 1400;
    WHEN 'agency' THEN
      v_included_minutes := 1250;
      v_overage_rate_x10000 := 1200;
    WHEN 'founding' THEN
      v_included_minutes := 750;
      v_overage_rate_x10000 := 1400;
    WHEN 'custom' THEN
      v_included_minutes := 0;
      v_overage_rate_x10000 := 0;
    ELSE
      v_included_minutes := 0;
      v_overage_rate_x10000 := 0;
  END CASE;

  -- Phase 8: custom pricing overrides tier defaults
  IF v_custom_included IS NOT NULL THEN
    v_included_minutes := v_custom_included;
  END IF;
  IF v_custom_rate IS NOT NULL THEN
    v_overage_rate_x10000 := v_custom_rate;
  END IF;

  -- Compute incremental overage (only the portion of THIS call that pushed past bundle)
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
      'tier', v_billing_tier::text,
      'overage_skipped_reason', v_overage_skipped_reason,
      'wallet_debited_cents', 0,
      'billing_org_id', v_billing_org_id,
      'call_org_id', v_call_row.organization_id,
      'custom_pricing_applied', (v_custom_included IS NOT NULL OR v_custom_rate IS NOT NULL)
    );
  END IF;

  -- Compute the dollar amount and debit billing org's wallet
  v_debit_cents := CEIL(v_incremental_overage_minutes * v_overage_rate_x10000 / 100.0)::integer;

  v_debit_result := debit_wallet(
    v_billing_org_id,  -- Phase 8: debit billing org's wallet, not call org's
    v_debit_cents,
    format('Call overage: %s min @ tier=%s%s',
      v_incremental_overage_minutes,
      v_billing_tier,
      CASE WHEN v_billing_org_id <> v_call_row.organization_id
        THEN format(' (sub-account %s)', v_call_row.organization_id)
        ELSE '' END
    ),
    p_call_id
  );

  RETURN jsonb_build_object(
    'billed', true,
    'minutes_added', v_minutes_added,
    'new_total_minutes', v_new_total_minutes,
    'incremental_overage_minutes', v_incremental_overage_minutes,
    'tier', v_billing_tier::text,
    'wallet_debited_cents', CASE WHEN (v_debit_result->>'success')::boolean THEN v_debit_cents ELSE 0 END,
    'wallet_result', v_debit_result,
    'billing_org_id', v_billing_org_id,
    'call_org_id', v_call_row.organization_id,
    'custom_pricing_applied', (v_custom_included IS NOT NULL OR v_custom_rate IS NOT NULL)
  );
END;
$function$;

commit;
