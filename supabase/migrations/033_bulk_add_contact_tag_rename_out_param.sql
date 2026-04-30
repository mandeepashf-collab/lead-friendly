-- migration 033: fix ambiguous "tag_id" in bulk_add_contact_tag RPC
-- ───────────────────────────────────────────────────────────────────
-- Migration 031 declared RETURNS TABLE(tagged_count bigint, tag_id uuid).
-- The OUT name `tag_id` is in scope inside the function body, including
-- the `ON CONFLICT (contact_id, tag_id) DO NOTHING` clause where it
-- collides with contact_tags.tag_id and raises 42702 ambiguous.
--
-- Rename the OUT parameter to `created_tag_id`. No behavior change.
-- DROP first because CREATE OR REPLACE cannot change OUT param names.
-- ───────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS bulk_add_contact_tag(uuid[], text);

CREATE FUNCTION bulk_add_contact_tag(
  p_contact_ids uuid[],
  p_tag_name text
)
RETURNS TABLE(tagged_count bigint, created_tag_id uuid)
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
