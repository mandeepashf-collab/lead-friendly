-- =============================================================
-- 038: Call billing idempotency
-- =============================================================
-- Multi-trigger protection: room_finished, call-complete, and Telnyx voice
-- webhooks can all fire for the same call. We need:
--   1. Minute counter increments by DELTA only (last_billed_seconds tracks how much we've already billed)
--   2. Single record_call_usage RPC handles everything atomically
--
-- Note: An initial unique index on wallet_transactions(call_id, type='debit')
-- was added here, then dropped in 039 (wrong design - blocked legitimate
-- continuations). See 039 for the corrected behavior.
--
-- Applied via Supabase MCP: 2026-04-30
-- =============================================================

-- 1. last_billed_seconds on calls - tracks cumulative seconds already accounted for
ALTER TABLE calls
  ADD COLUMN last_billed_seconds integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN calls.last_billed_seconds IS
  'Cumulative seconds already counted toward minutes_used. Updated atomically in record_call_usage RPC. Prevents double-counting on webhook retries or multi-trigger events.';

-- 2. (REMOVED IN 039) The unique index uq_wallet_txns_call_debit was created
-- here originally, then dropped because it blocked legitimate same-call
-- continuations. See migration 039 for the correction.

-- 3. record_call_usage RPC - single atomic operation for usage + wallet debit.
-- See migration 039 for the current canonical version. The version originally
-- created here had a unique_violation EXCEPTION handler which is now obsolete.
