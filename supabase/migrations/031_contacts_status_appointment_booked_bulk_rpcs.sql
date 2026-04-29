-- migration 031: contacts status appointment_booked + bulk status/tag RPCs
-- Phase 1 of Contacts V2.
-- ───────────────────────────────────────────────────────────────────────
-- Adds 'appointment_booked' to contacts_status_check, plus two new RPCs
-- that follow the same SECURITY DEFINER pattern as bulk_delete_contacts
-- (mig 021): caller's org is resolved from profiles WHERE id=auth.uid(),
-- and any contact_ids belonging to other orgs cause the function to raise
-- before any write happens.
--
-- bulk_update_contact_status — applies one status to many contacts.
-- bulk_add_contact_tag (singular) — applies one tag to many contacts.
--   This is distinct from existing bulk_add_contact_tags (plural, mig 018)
--   which takes a JSONB pairs array for CSV imports.
-- ───────────────────────────────────────────────────────────────────────

-- 1. Expand contacts_status_check to include 'appointment_booked'
ALTER TABLE public.contacts DROP CONSTRAINT contacts_status_check;
ALTER TABLE public.contacts ADD CONSTRAINT contacts_status_check
  CHECK (status = ANY (ARRAY[
    'new'::text, 'contacted'::text, 'qualified'::text,
    'proposal'::text, 'negotiation'::text, 'won'::text,
    'lost'::text, 'do_not_contact'::text,
    'appointment_booked'::text
  ]));

-- 2. bulk_update_contact_status RPC
CREATE OR REPLACE FUNCTION bulk_update_contact_status(
  p_contact_ids uuid[],
  p_status text
)
RETURNS TABLE(updated_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_org uuid;
  v_valid_statuses text[] := ARRAY[
    'new','contacted','qualified','proposal','negotiation',
    'won','lost','do_not_contact','appointment_booked'
  ];
BEGIN
  IF p_contact_ids IS NULL OR array_length(p_contact_ids, 1) IS NULL THEN
    RETURN QUERY SELECT 0::bigint;
    RETURN;
  END IF;
  IF NOT (p_status = ANY(v_valid_statuses)) THEN
    RAISE EXCEPTION 'Invalid status: %', p_status;
  END IF;

  SELECT organization_id INTO v_caller_org
  FROM profiles WHERE id = auth.uid();
  IF v_caller_org IS NULL THEN
    RAISE EXCEPTION 'Access denied: caller has no organization';
  END IF;

  IF EXISTS (
    SELECT 1 FROM contacts
    WHERE id = ANY(p_contact_ids) AND organization_id <> v_caller_org
  ) THEN
    RAISE EXCEPTION 'Access denied: contact set contains rows from other orgs';
  END IF;

  RETURN QUERY
  WITH updated AS (
    UPDATE contacts
    SET status = p_status
    WHERE id = ANY(p_contact_ids)
      AND organization_id = v_caller_org
    RETURNING id
  )
  SELECT count(*)::bigint FROM updated;
END $$;

GRANT EXECUTE ON FUNCTION bulk_update_contact_status(uuid[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION bulk_update_contact_status(uuid[], text) TO service_role;

-- 3. bulk_add_contact_tag RPC (singular — distinct from bulk_add_contact_tags
-- in mig 018, which takes a JSONB pairs array). This applies ONE tag to
-- MANY contacts in a single round-trip.
CREATE OR REPLACE FUNCTION bulk_add_contact_tag(
  p_contact_ids uuid[],
  p_tag_name text
)
RETURNS TABLE(tagged_count bigint, tag_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_org uuid;
  v_tag_id uuid;
BEGIN
  IF p_contact_ids IS NULL OR array_length(p_contact_ids, 1) IS NULL THEN
    RETURN QUERY SELECT 0::bigint, NULL::uuid;
    RETURN;
  END IF;
  IF p_tag_name IS NULL OR length(trim(p_tag_name)) = 0 THEN
    RAISE EXCEPTION 'Tag name required';
  END IF;

  SELECT organization_id INTO v_caller_org
  FROM profiles WHERE id = auth.uid();
  IF v_caller_org IS NULL THEN
    RAISE EXCEPTION 'Access denied: caller has no organization';
  END IF;

  IF EXISTS (
    SELECT 1 FROM contacts
    WHERE id = ANY(p_contact_ids) AND organization_id <> v_caller_org
  ) THEN
    RAISE EXCEPTION 'Access denied: contact set contains rows from other orgs';
  END IF;

  -- Upsert tag (case-insensitive on tags_org_lower_name_uniq).
  -- DO UPDATE no-op trick so RETURNING fires on conflict too.
  INSERT INTO tags (organization_id, name)
  VALUES (v_caller_org, trim(p_tag_name))
  ON CONFLICT (organization_id, lower(name))
  DO UPDATE SET name = tags.name
  RETURNING id INTO v_tag_id;

  RETURN QUERY
  WITH inserted AS (
    INSERT INTO contact_tags (organization_id, contact_id, tag_id, source, added_by)
    SELECT v_caller_org, c.id, v_tag_id, 'manual', auth.uid()
    FROM contacts c
    WHERE c.id = ANY(p_contact_ids) AND c.organization_id = v_caller_org
    ON CONFLICT (contact_id, tag_id) DO NOTHING
    RETURNING id
  )
  SELECT count(*)::bigint, v_tag_id FROM inserted;
END $$;

GRANT EXECUTE ON FUNCTION bulk_add_contact_tag(uuid[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION bulk_add_contact_tag(uuid[], text) TO service_role;
