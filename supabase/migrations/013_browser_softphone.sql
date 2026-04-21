-- Migration 013: Browser Softphone
-- Date: Apr 21, 2026
-- Author: Mandeep + Claude
-- Depends on: 012 (must be applied first)
--
-- Purpose:
--   Add schema support for the browser softphone feature.
--   Reuses existing columns where possible (user_id, recording_url, transcript).
--   Preserves all 160 existing call rows (110 'telnyx' + 50 'webrtc').
--
-- What this migration does:
--   1. Adds a CHECK constraint on call_type (currently free-text, defaults to 'telnyx')
--      — preserves existing values, expands with softphone-specific ones.
--   2. Adds transcript_status (drives async Deepgram worker).
--   3. Adds recording_duration_seconds.
--   4. Adds recording_disclosed (WA two-party consent tracking).
--   5. Adds callback_routing_expires_at + composite index for smart callback routing.
--   6. Adds rep-cell fallback fields on profiles.
--   7. Adds softphone presence on profiles (schema-ready, UI deferred).
--
-- What this migration does NOT do (intentionally):
--   - Does NOT add recording_url (already exists).
--   - Does NOT add transcript_url/transcript_json (reuse existing 'transcript' text column).
--   - Does NOT add initiated_by_user_id (reuse existing 'user_id uuid' column).
--   - Does NOT touch the agent_id vs ai_agent_id duplication (cleanup deferred to v2).
--
-- Rollback: all changes are additive; reverse migration would drop the new columns
-- and the new CHECK constraint. Safe to roll back.

BEGIN;

-- =========================================================================
-- 1. CHECK constraint on call_type
-- =========================================================================
-- Currently call_type is free-text with default 'telnyx'. Existing values:
--   'telnyx' (110 rows) — legacy TeXML/Telnyx-direct calls
--   'webrtc' (50 rows)  — existing rep-browser ↔ AI test calls
--
-- New values added for the softphone:
--   'webrtc_outbound_pstn' — rep browser → LiveKit SIP → PSTN (outbound softphone)
--   'webrtc_inbound_pstn'  — PSTN → LiveKit SIP → rep browser (inbound softphone)
--
-- Also allowing (for forward-compat with existing notes/docs):
--   'sip_outbound', 'sip_inbound' — if/when we explicitly tag LiveKit SIP calls
--   'callback_bridge' — legacy callback-bridge flow (may still exist in code paths)

ALTER TABLE calls DROP CONSTRAINT IF EXISTS calls_call_type_check;

ALTER TABLE calls ADD CONSTRAINT calls_call_type_check
  CHECK (call_type IN (
    'telnyx',                 -- EXISTING: legacy TeXML/Telnyx-direct
    'webrtc',                 -- EXISTING: rep browser ↔ AI test calls
    'webrtc_outbound_pstn',   -- NEW: rep browser → PSTN via LiveKit SIP (softphone)
    'webrtc_inbound_pstn',    -- NEW: PSTN → rep browser via LiveKit SIP (softphone)
    'sip_outbound',           -- NEW: AI agent → PSTN via LiveKit SIP (future explicit)
    'sip_inbound',            -- NEW: PSTN → AI agent via LiveKit SIP (future explicit)
    'callback_bridge'         -- LEGACY: callback-bridge flow (may still be in code)
  ));

-- =========================================================================
-- 2. Transcript status (drives async Deepgram worker)
-- =========================================================================
-- The existing 'transcript' text column stores the final transcript.
-- We need a status field so the background worker knows which calls to process.

ALTER TABLE calls ADD COLUMN IF NOT EXISTS transcript_status text
  CHECK (transcript_status IN ('pending', 'processing', 'completed', 'failed'))
  DEFAULT NULL;

-- Index for the worker's "find next batch" query:
--   SELECT id, recording_url FROM calls
--   WHERE transcript_status = 'pending' AND recording_url IS NOT NULL
--   ORDER BY ended_at ASC LIMIT 50;
CREATE INDEX IF NOT EXISTS idx_calls_transcript_pending
  ON calls(transcript_status, ended_at)
  WHERE transcript_status IN ('pending', 'processing');

-- =========================================================================
-- 3. Recording duration
-- =========================================================================
-- recording_url already exists. Duration is useful for billing/analytics and
-- for verifying egress completed without inspecting the file.

ALTER TABLE calls ADD COLUMN IF NOT EXISTS recording_duration_seconds integer;

-- =========================================================================
-- 4. Recording disclosure (WA two-party consent compliance)
-- =========================================================================
-- Track whether the customer on a given call has been informed of recording.
-- Dock UI sets this true when the standard "this call is recorded" disclosure
-- is played/read. For outbound softphone calls, the rep is expected to state
-- it verbally; for AI outbound, the agent script includes it.

ALTER TABLE calls ADD COLUMN IF NOT EXISTS recording_disclosed boolean
  NOT NULL DEFAULT false;

-- =========================================================================
-- 5. Smart callback routing
-- =========================================================================
-- When a customer calls back a number that recently called them, we want to:
--   - Flow A: if the original caller was a human rep, ring their browser,
--             fallback to cell if browser offline.
--   - Flow B: if the original caller was an AI agent, route to that agent's
--             inbound configuration (following the inbound script).
--
-- Implementation: the outbound call row carries a callback_routing_expires_at
-- timestamp (typically 24–72h after the call). The inbound webhook queries
-- for a recent matching outbound call by (to_number, from_number).
-- The existing user_id and ai_agent_id columns tell us which flow to use:
--   - user_id IS NOT NULL → Flow A (rep)
--   - ai_agent_id IS NOT NULL → Flow B (AI agent)

ALTER TABLE calls ADD COLUMN IF NOT EXISTS callback_routing_expires_at timestamptz;

-- Composite index for the inbound callback-lookup query:
--   SELECT user_id, ai_agent_id FROM calls
--   WHERE to_number = $inbound_ani          -- customer's number
--     AND from_number = $inbound_dnis       -- our DID they're calling back
--     AND callback_routing_expires_at > now()
--   ORDER BY started_at DESC NULLS LAST, created_at DESC
--   LIMIT 1;
CREATE INDEX IF NOT EXISTS idx_calls_callback_lookup
  ON calls(to_number, from_number, callback_routing_expires_at DESC)
  WHERE callback_routing_expires_at IS NOT NULL;

-- =========================================================================
-- 6. Rep attribution — NOTE: reusing existing user_id column
-- =========================================================================
-- No new column needed. The existing 'user_id uuid' column on calls is
-- what we'll populate for softphone calls (= rep who initiated the call).
-- However: add an index if one doesn't exist, to support "my calls" queries.

CREATE INDEX IF NOT EXISTS idx_calls_user_id
  ON calls(user_id)
  WHERE user_id IS NOT NULL;

-- =========================================================================
-- 7. Rep cell fallback (offline softphone → ring cell)
-- =========================================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cell_phone_e164 text;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cell_phone_fallback_enabled boolean
  NOT NULL DEFAULT false;

-- =========================================================================
-- 8. Softphone presence (schema-ready, UI deferred)
-- =========================================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS softphone_status text
  CHECK (softphone_status IN ('available', 'busy', 'away', 'offline'))
  DEFAULT 'offline';

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS softphone_status_updated_at timestamptz;

COMMIT;

-- =========================================================================
-- Post-migration verification queries (run manually after COMMIT)
-- =========================================================================
--
-- 1. CHECK constraint accepts all existing + new values:
--    SELECT call_type, COUNT(*) FROM calls GROUP BY call_type;
--    -- Should match pre-migration counts (110 telnyx, 50 webrtc).
--
-- 2. Try inserting a softphone-typed row (then rollback):
--    BEGIN;
--    INSERT INTO calls (organization_id, direction, call_type)
--    VALUES ('41b43e35-24d0-40d7-b26a-cd6bc456938a', 'outbound', 'webrtc_outbound_pstn')
--    RETURNING id, call_type;
--    ROLLBACK;
--
-- 3. Confirm all new columns exist on calls:
--    SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'calls'
--      AND column_name IN (
--        'transcript_status', 'recording_duration_seconds',
--        'recording_disclosed', 'callback_routing_expires_at'
--      )
--    ORDER BY column_name;
--    -- Should return 4 rows.
--
-- 4. Confirm profiles columns:
--    SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'profiles'
--      AND column_name IN (
--        'cell_phone_e164', 'cell_phone_fallback_enabled',
--        'softphone_status', 'softphone_status_updated_at'
--      )
--    ORDER BY column_name;
--    -- Should return 4 rows.
--
-- 5. Confirm indexes:
--    SELECT indexname FROM pg_indexes
--    WHERE schemaname = 'public' AND tablename IN ('calls', 'profiles')
--      AND indexname IN (
--        'idx_calls_transcript_pending',
--        'idx_calls_callback_lookup',
--        'idx_calls_user_id'
--      )
--    ORDER BY indexname;
--    -- Should return 3 rows.
