-- migration 020: multi-phone cleanup + custom field keys RPC
-- Part of Stage 1.6: scope items #2 (multi-phone split) and #5 (autocomplete)
-- Applied to prod zdxdcgiwimbhgaqfgbzl on Apr 23, 2026.
-- Drops and recreates calls_enriched view due to cell_phone type change.

-- 1. Drop dependent view (will be recreated at end of migration)
DROP VIEW IF EXISTS public.calls_enriched;

-- 2. Normalize cell_phone type from VARCHAR to TEXT (eliminates drift with contacts.phone)
ALTER TABLE contacts ALTER COLUMN cell_phone TYPE TEXT;

-- 3. Pre-flight invariant guard
DO $$
DECLARE
  conflict_count int;
BEGIN
  SELECT count(*) INTO conflict_count
  FROM contacts
  WHERE cell_phone IS NOT NULL AND custom_fields ? 'cell_phone';
  IF conflict_count > 0 THEN
    RAISE EXCEPTION 'Backfill conflict: % rows have both contacts.cell_phone and custom_fields.cell_phone. Manual review required.', conflict_count;
  END IF;
END $$;

-- 4. Backfill cell_phone column from custom_fields where legacy data lives
UPDATE contacts
SET cell_phone = custom_fields->>'cell_phone'
WHERE cell_phone IS NULL
  AND custom_fields ? 'cell_phone'
  AND trim(custom_fields->>'cell_phone') <> '';

-- 5. Strip cell_phone key from custom_fields (now lives in its own column)
UPDATE contacts
SET custom_fields = custom_fields - 'cell_phone'
WHERE custom_fields ? 'cell_phone';

-- 6. Index for softphone callback-bridge lookups
CREATE INDEX IF NOT EXISTS idx_contacts_cell_phone
  ON contacts (cell_phone)
  WHERE cell_phone IS NOT NULL;

-- 7. Recreate calls_enriched view (definition preserved byte-for-byte, ::text cast retained as harmless no-op)
CREATE VIEW public.calls_enriched AS
SELECT id,
    organization_id,
    contact_id,
    phone_number_id,
    agent_id,
    ai_agent_id,
    external_call_id,
    direction,
    from_number,
    to_number,
    status,
    disconnection_reason,
    started_at,
    answered_at,
    ended_at,
    duration_seconds,
    call_summary,
    transcript,
    recording_url,
    sentiment,
    cost,
    notes,
    metadata,
    created_at,
    retell_call_id,
    retell_agent_id,
    call_analysis,
    provider,
    telnyx_call_id,
    disposition,
    user_id,
    appointment_id,
    outcome,
    hangup_cause,
    hangup_source,
    initiated_by,
    call_mode,
    bridge_call_control_id,
    rep_phone,
    call_type,
    livekit_room_id,
    COALESCE(contact_id, (SELECT ct.id
        FROM contacts ct
        WHERE ct.organization_id = c.organization_id
          AND (ct.phone = c.from_number OR ct.phone = c.to_number OR ct.cell_phone::text = c.from_number OR ct.cell_phone::text = c.to_number)
        LIMIT 1)) AS resolved_contact_id
FROM calls c;

-- 8. Custom field keys RPC for autocomplete (Stage 1.6 scope #5)
CREATE OR REPLACE FUNCTION get_org_custom_field_keys(p_organization_id uuid)
RETURNS TABLE (key text, usage_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Guard: caller must belong to the requested org
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT k::text AS key, count(*) AS usage_count
  FROM contacts c, jsonb_object_keys(c.custom_fields) k
  WHERE c.organization_id = p_organization_id
    AND c.custom_fields IS NOT NULL
    AND c.custom_fields <> '{}'::jsonb
  GROUP BY k
  ORDER BY count(*) DESC, k ASC
  LIMIT 100;
END $$;

GRANT EXECUTE ON FUNCTION get_org_custom_field_keys(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_org_custom_field_keys(uuid) TO service_role;
