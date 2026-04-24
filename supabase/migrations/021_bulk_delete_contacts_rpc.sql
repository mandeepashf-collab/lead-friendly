-- migration 021: bulk_delete_contacts RPC for multi-select delete on contacts page
-- Part of Stage 1.6.1: bulk actions.

CREATE OR REPLACE FUNCTION bulk_delete_contacts(p_contact_ids uuid[])
RETURNS TABLE (deleted_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_org uuid;
BEGIN
  IF p_contact_ids IS NULL OR array_length(p_contact_ids, 1) IS NULL THEN
    RETURN QUERY SELECT 0::bigint;
    RETURN;
  END IF;

  -- Caller must belong to an org
  SELECT organization_id INTO v_caller_org
  FROM profiles
  WHERE id = auth.uid();

  IF v_caller_org IS NULL THEN
    RAISE EXCEPTION 'Access denied: caller has no organization';
  END IF;

  -- Safety: every contact must belong to caller's org.
  -- Loop-free guard — if any contact is foreign, abort before deleting anything.
  IF EXISTS (
    SELECT 1 FROM contacts
    WHERE id = ANY(p_contact_ids)
      AND organization_id <> v_caller_org
  ) THEN
    RAISE EXCEPTION 'Access denied: contact set contains rows from other orgs';
  END IF;

  RETURN QUERY
  WITH deleted AS (
    DELETE FROM contacts
    WHERE id = ANY(p_contact_ids)
      AND organization_id = v_caller_org
    RETURNING id
  )
  SELECT count(*)::bigint FROM deleted;
END $$;

GRANT EXECUTE ON FUNCTION bulk_delete_contacts(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION bulk_delete_contacts(uuid[]) TO service_role;
