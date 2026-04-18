-- 007: Enrich calls table for proper lifecycle tracking
-- Adds fields needed for Path A (callback bridge) and accurate call status

-- New columns for call lifecycle
ALTER TABLE calls ADD COLUMN IF NOT EXISTS answered_at TIMESTAMPTZ;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS hangup_cause TEXT;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS hangup_source TEXT;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS initiated_by TEXT DEFAULT 'system';  -- 'human', 'ai_agent', 'campaign', 'system'
ALTER TABLE calls ADD COLUMN IF NOT EXISTS call_mode TEXT DEFAULT 'ai_agent';   -- 'manual', 'ai_agent', 'callback_bridge'
ALTER TABLE calls ADD COLUMN IF NOT EXISTS disposition TEXT;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS bridge_call_control_id TEXT;          -- For Path A: the second leg's call_control_id
ALTER TABLE calls ADD COLUMN IF NOT EXISTS rep_phone TEXT;                       -- For Path A: the rep's phone number that was called first

-- Derive duration_seconds automatically from timestamps
-- This replaces client-side timer which is unreliable
CREATE OR REPLACE FUNCTION derive_call_duration()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.answered_at IS NOT NULL AND NEW.ended_at IS NOT NULL THEN
    NEW.duration_seconds := EXTRACT(EPOCH FROM (NEW.ended_at - NEW.answered_at))::INTEGER;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_derive_call_duration ON calls;
CREATE TRIGGER trg_derive_call_duration
  BEFORE UPDATE ON calls
  FOR EACH ROW
  EXECUTE FUNCTION derive_call_duration();

-- Index for contact activity lookups (was likely already fast but explicit is better)
CREATE INDEX IF NOT EXISTS idx_calls_contact_id ON calls(contact_id);
CREATE INDEX IF NOT EXISTS idx_calls_org_created ON calls(organization_id, created_at DESC);
