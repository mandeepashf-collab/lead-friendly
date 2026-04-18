-- ══════════════════════════════════════════════════════════════════
-- 011: Unified call statistics view + duration fallback + contact lookup
-- ══════════════════════════════════════════════════════════════════
-- Problem (from AUDIT_DAY2.md):
--   Dashboard says 28 calls, Call Logs says 103, AI Agents says 0,
--   Billing says 0. Five views of the same data disagree.
--
-- Root causes:
--   1. `calls.duration_seconds` is only computed by a trigger when both
--      answered_at and ended_at are set; WebRTC calls skip answered_at,
--      leaving duration at 0.
--   2. `ai_agents.total_calls` is never incremented, so AI Agents page
--      always shows 0.
--   3. `organizations.ai_minutes_used` is never incremented, so Billing
--      always shows 0.
--   4. Different pages filter by different call statuses.
--
-- This migration:
--   A. Expands the duration trigger to fall back to ended_at-started_at,
--      or ended_at-initiated_at, when answered_at is missing.
--   B. Creates a `call_stats_by_org` view that all dashboards point to.
--   C. Creates a `call_stats_by_agent` view for the AI Agents page.
--   D. Creates `calls_enriched` view that reverse-looks-up contact
--      by phone number when contact_id is NULL — fixes the "Unknown"
--      rows in Call Logs.
-- ══════════════════════════════════════════════════════════════════

-- ── A. Upgrade duration trigger ──────────────────────────────────
CREATE OR REPLACE FUNCTION derive_call_duration()
RETURNS TRIGGER AS $$
BEGIN
  -- Prefer answered_at..ended_at (actual talk time)
  IF NEW.answered_at IS NOT NULL AND NEW.ended_at IS NOT NULL THEN
    NEW.duration_seconds := GREATEST(
      0,
      EXTRACT(EPOCH FROM (NEW.ended_at - NEW.answered_at))::INTEGER
    );
  -- Fallback: started_at..ended_at (connection time, used for WebRTC)
  ELSIF NEW.started_at IS NOT NULL AND NEW.ended_at IS NOT NULL THEN
    NEW.duration_seconds := GREATEST(
      0,
      EXTRACT(EPOCH FROM (NEW.ended_at - NEW.started_at))::INTEGER
    );
  -- Last resort: created_at..ended_at
  ELSIF NEW.ended_at IS NOT NULL THEN
    NEW.duration_seconds := GREATEST(
      0,
      EXTRACT(EPOCH FROM (NEW.ended_at - NEW.created_at))::INTEGER
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Re-run on both INSERT and UPDATE so end-of-call inserts also derive
DROP TRIGGER IF EXISTS trg_derive_call_duration ON calls;
CREATE TRIGGER trg_derive_call_duration
  BEFORE INSERT OR UPDATE ON calls
  FOR EACH ROW
  EXECUTE FUNCTION derive_call_duration();

-- Backfill existing rows once so the dashboards light up immediately
UPDATE calls
SET duration_seconds = GREATEST(
  0,
  CASE
    WHEN answered_at IS NOT NULL AND ended_at IS NOT NULL
      THEN EXTRACT(EPOCH FROM (ended_at - answered_at))::INTEGER
    WHEN started_at IS NOT NULL AND ended_at IS NOT NULL
      THEN EXTRACT(EPOCH FROM (ended_at - started_at))::INTEGER
    WHEN ended_at IS NOT NULL
      THEN EXTRACT(EPOCH FROM (ended_at - created_at))::INTEGER
    ELSE duration_seconds
  END
)
WHERE duration_seconds IS DISTINCT FROM GREATEST(
  0,
  CASE
    WHEN answered_at IS NOT NULL AND ended_at IS NOT NULL
      THEN EXTRACT(EPOCH FROM (ended_at - answered_at))::INTEGER
    WHEN started_at IS NOT NULL AND ended_at IS NOT NULL
      THEN EXTRACT(EPOCH FROM (ended_at - started_at))::INTEGER
    WHEN ended_at IS NOT NULL
      THEN EXTRACT(EPOCH FROM (ended_at - created_at))::INTEGER
    ELSE duration_seconds
  END
);

-- ── B. Unified stats view per organization ───────────────────────
CREATE OR REPLACE VIEW call_stats_by_org AS
SELECT
  organization_id,
  COUNT(*)::INTEGER AS total_calls,
  COUNT(*) FILTER (WHERE created_at >= date_trunc('day', now()))::INTEGER AS calls_today,
  COUNT(*) FILTER (WHERE created_at >= date_trunc('month', now()))::INTEGER AS calls_this_month,
  COUNT(*) FILTER (WHERE created_at >= now() - interval '7 days')::INTEGER AS calls_last_7d,
  COUNT(*) FILTER (
    WHERE status IN ('completed', 'answered')
  )::INTEGER AS answered_calls,
  COUNT(*) FILTER (
    WHERE outcome = 'appointment_booked'
  )::INTEGER AS appointments_booked,
  COUNT(*) FILTER (
    WHERE outcome = 'appointment_booked' AND created_at >= now() - interval '30 days'
  )::INTEGER AS appointments_booked_30d,
  COALESCE(SUM(duration_seconds), 0)::BIGINT AS total_duration_seconds,
  COALESCE(ROUND(SUM(duration_seconds)::NUMERIC / 60), 0)::INTEGER AS total_minutes,
  COALESCE(
    ROUND(
      SUM(duration_seconds) FILTER (WHERE created_at >= date_trunc('month', now()))::NUMERIC / 60
    ),
    0
  )::INTEGER AS minutes_this_month,
  CASE
    WHEN COUNT(*) FILTER (WHERE status IN ('completed','answered')) = 0 THEN 0
    ELSE ROUND(
      AVG(duration_seconds) FILTER (WHERE status IN ('completed','answered'))
    )::INTEGER
  END AS avg_duration_seconds,
  CASE
    WHEN COUNT(*) = 0 THEN 0
    ELSE ROUND(
      100.0 * COUNT(*) FILTER (WHERE status IN ('completed','answered'))
      / GREATEST(COUNT(*), 1)
    )::INTEGER
  END AS answer_rate_pct
FROM calls
GROUP BY organization_id;

COMMENT ON VIEW call_stats_by_org IS
  'Single source of truth for org-level call stats. Dashboard, Call Logs, and Billing should all read from here.';

-- ── C. Per-agent stats view ──────────────────────────────────────
CREATE OR REPLACE VIEW call_stats_by_agent AS
SELECT
  organization_id,
  ai_agent_id,
  COUNT(*)::INTEGER AS total_calls,
  COUNT(*) FILTER (WHERE status IN ('completed','answered'))::INTEGER AS answered_calls,
  COUNT(*) FILTER (WHERE outcome = 'appointment_booked')::INTEGER AS appointments_booked,
  COALESCE(SUM(duration_seconds), 0)::BIGINT AS total_duration_seconds,
  COALESCE(ROUND(SUM(duration_seconds)::NUMERIC / 60), 0)::INTEGER AS total_minutes
FROM calls
WHERE ai_agent_id IS NOT NULL
GROUP BY organization_id, ai_agent_id;

COMMENT ON VIEW call_stats_by_agent IS
  'Per-agent call stats for the AI Agents index page.';

-- ── D. Calls enriched with contact reverse-lookup ────────────────
-- When contact_id is NULL, try to match on from_number / to_number.
-- This fixes the "Unknown" rows that dominate the Call Logs.
CREATE OR REPLACE VIEW calls_enriched AS
SELECT
  c.*,
  COALESCE(
    c.contact_id,
    (
      SELECT ct.id FROM contacts ct
      WHERE ct.organization_id = c.organization_id
        AND (
          ct.phone = c.from_number OR
          ct.phone = c.to_number OR
          ct.mobile_phone = c.from_number OR
          ct.mobile_phone = c.to_number
        )
      LIMIT 1
    )
  ) AS resolved_contact_id
FROM calls c;

COMMENT ON VIEW calls_enriched IS
  'Calls with contact_id backfilled from phone number lookup when missing.';

-- ── E. Grants (views inherit table RLS but need explicit grant in some envs) ──
GRANT SELECT ON call_stats_by_org TO authenticated;
GRANT SELECT ON call_stats_by_agent TO authenticated;
GRANT SELECT ON calls_enriched TO authenticated;
