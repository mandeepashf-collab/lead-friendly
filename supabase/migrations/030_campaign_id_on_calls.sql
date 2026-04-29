-- Migration 030: campaign_id on calls + nullable scheduled_actions.scheduled_for
--
-- Why
--   Three latent bugs in the campaign system that together meant campaigns
--   could never function correctly:
--
--   1. /api/automations/process dedups already-called contacts by querying
--      `calls.campaign_id`, but that column did not exist. The query failed
--      with PostgREST 42703, returned null, and the dedup logic fell open —
--      so on every campaign launch the same contacts would be re-dialed.
--
--   2. The appointment counter in /api/appointments/book reads
--      `calls.campaign_id` to bump campaigns.total_appointments. Same column
--      mismatch — never worked.
--
--   3. scheduled_actions.scheduled_for was NOT NULL, but the campaign
--      processor writes TCPA-blocked rows with scheduled_for =
--      nextValidTcpaWindow(), which can return null. The insert failed
--      silently and the entire audit trail for TCPA-blocked campaign
--      attempts was lost. (We checked scheduled_actions during a campaign
--      launch debug and found zero rows even though TCPA almost certainly
--      blocked at least one call — that's how this came to light.)
--
-- Effect
--   Adds calls.campaign_id (nullable, FK to campaigns, partial index for
--   queries that filter by campaign). Drops the NOT NULL on
--   scheduled_actions.scheduled_for so blocked-row audit writes succeed.
--
-- Safety
--   Both DDLs are additive / loosening. No data migration needed.

ALTER TABLE calls
  ADD COLUMN IF NOT EXISTS campaign_id uuid
  REFERENCES campaigns(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_calls_campaign_id
  ON calls(campaign_id)
  WHERE campaign_id IS NOT NULL;

ALTER TABLE scheduled_actions
  ALTER COLUMN scheduled_for DROP NOT NULL;
