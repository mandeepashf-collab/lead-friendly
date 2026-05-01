-- =============================================================
-- 040: Backfill last_billed_seconds for legacy calls
-- =============================================================
-- Calls completed BEFORE migration 038 introduced last_billed_seconds
-- have it defaulted to 0. If a webhook ever re-fires on those rows
-- (Telnyx replay, manual re-trigger), record_call_usage would compute
-- a positive delta and bill the full duration as if it were new.
--
-- This backfill sets last_billed_seconds = duration_seconds on every
-- terminal call so the delta is 0 and a re-trigger is a no-op.
--
-- Affected: 33 rows (all pre-Phase-1.5 calls). Idempotent: re-running is safe.
--
-- Applied via Supabase MCP: 2026-04-30
-- =============================================================

UPDATE calls
SET last_billed_seconds = duration_seconds
WHERE status IN ('completed', 'failed')
  AND duration_seconds > 0
  AND last_billed_seconds = 0;
