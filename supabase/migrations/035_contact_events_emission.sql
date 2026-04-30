-- migration 035: contact_events emission from RPCs (Phase 3b)
-- ──────────────────────────────────────────────────────────────────
-- Rewrites four existing RPCs to atomically emit contact_events rows
-- alongside the underlying mutation, plus adds one new RPC for the
-- manual single-status path on /people/[id].
--
-- Atomicity: each RPC is a single PL/pgSQL function — implicitly
-- transactional. If the events INSERT fails (CHECK violation, RLS
-- block, etc.), the underlying UPDATE/INSERT rolls back too.
--
-- No-op suppression: every emit path checks "did anything actually
-- change?" before emitting, so re-applying the same status / re-adding
-- an existing tag does NOT produce an event.
--
-- Untouched by design:
--   - add_contact_tag(uuid, text)        — 2-arg overload, used by
--     automation/webhook paths with no auth.uid() context
--   - bulk_add_contact_tags(jsonb)       — CSV-import RPC, intentionally
--     silent per the original Phase 3 spec
-- ──────────────────────────────────────────────────────────────────


-- ── A. bulk_update_contact_status ─────────────────────────────────
-- Captures pre-state via CTE, UPDATE skips no-ops via IS DISTINCT FROM,
-- emits one event per actually-changed row.

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
  v_caller_id  uuid := auth.uid();
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

  SELECT organization_id INTO v_caller_org FROM profiles WHERE id = v_caller_id;
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
  WITH before_state AS (
    SELECT id, status AS old_status
    FROM contacts
    WHERE id = ANY(p_contact_ids) AND organization_id = v_caller_org
  ),
  updated AS (
    UPDATE contacts c
    SET status = p_status
    FROM before_state b
    WHERE c.id = b.id
      AND c.organization_id = v_caller_org
      AND c.status IS DISTINCT FROM p_status
    RETURNING c.id, b.old_status
  ),
  emitted AS (
    INSERT INTO contact_events (
      organization_id, contact_id, event_type, payload_json,
      created_by_user_id, created_by_kind
    )
    SELECT
      v_caller_org, u.id, 'status_changed',
      jsonb_build_object('from', u.old_status, 'to', p_status, 'reason', 'manual_bulk'),
      v_caller_id, 'user'
    FROM updated u
    RETURNING id
  )
  SELECT count(*)::bigint FROM updated;
END $$;

GRANT EXECUTE ON FUNCTION bulk_update_contact_status(uuid[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION bulk_update_contact_status(uuid[], text) TO service_role;


-- ── B. bulk_add_contact_tag ───────────────────────────────────────
-- Existing CTE returns inserted contact_ids; chain a second INSERT
-- into contact_events for those rows. ON CONFLICT contacts (already
-- tagged) produce no inserted row → no event.

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
  v_caller_id  uuid := auth.uid();
  v_tag_id uuid;
  v_tag_name_clean text := trim(p_tag_name);
BEGIN
  IF p_contact_ids IS NULL OR array_length(p_contact_ids, 1) IS NULL THEN
    RETURN QUERY SELECT 0::bigint, NULL::uuid;
    RETURN;
  END IF;
  IF v_tag_name_clean IS NULL OR length(v_tag_name_clean) = 0 THEN
    RAISE EXCEPTION 'Tag name required';
  END IF;

  SELECT organization_id INTO v_caller_org FROM profiles WHERE id = v_caller_id;
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
  VALUES (v_caller_org, v_tag_name_clean)
  ON CONFLICT (organization_id, lower(name))
  DO UPDATE SET name = tags.name
  RETURNING id INTO v_tag_id;

  RETURN QUERY
  WITH inserted AS (
    INSERT INTO contact_tags (organization_id, contact_id, tag_id, source, added_by)
    SELECT v_caller_org, c.id, v_tag_id, 'manual', v_caller_id
    FROM contacts c
    WHERE c.id = ANY(p_contact_ids) AND c.organization_id = v_caller_org
    ON CONFLICT (contact_id, tag_id) DO NOTHING
    RETURNING contact_id
  ),
  emitted AS (
    INSERT INTO contact_events (
      organization_id, contact_id, event_type, payload_json,
      created_by_user_id, created_by_kind
    )
    SELECT
      v_caller_org, i.contact_id, 'tag_added',
      jsonb_build_object('tag_id', v_tag_id, 'tag_name', v_tag_name_clean),
      v_caller_id, 'user'
    FROM inserted i
    RETURNING id
  )
  SELECT count(*)::bigint, v_tag_id FROM inserted;
END $$;

GRANT EXECUTE ON FUNCTION bulk_add_contact_tag(uuid[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION bulk_add_contact_tag(uuid[], text) TO service_role;


-- ── C. add_contact_tag(uuid, text, text) — 3-arg overload ─────────
-- Resolves caller via auth.uid(); emits event only when the contact_tags
-- INSERT actually inserts (not on conflict). 2-arg overload untouched.

CREATE OR REPLACE FUNCTION add_contact_tag(
  p_contact_id uuid,
  p_tag text,
  p_source text DEFAULT 'manual'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_id uuid;
  v_tag_id uuid;
  v_source text;
  v_caller_id uuid := auth.uid();
  v_inserted boolean := false;
BEGIN
  SELECT organization_id INTO v_org_id FROM contacts WHERE id = p_contact_id;
  IF v_org_id IS NULL THEN RETURN; END IF;

  v_source := CASE
    WHEN p_source IN ('manual','csv_import','api','automation','eval_failure') THEN p_source
    ELSE 'manual'
  END;

  INSERT INTO tags (organization_id, name)
  VALUES (v_org_id, p_tag)
  ON CONFLICT (organization_id, lower(name))
    DO UPDATE SET name = tags.name
  RETURNING id INTO v_tag_id;

  WITH ins AS (
    INSERT INTO contact_tags (organization_id, contact_id, tag_id, source, added_by)
    VALUES (v_org_id, p_contact_id, v_tag_id, v_source, v_caller_id)
    ON CONFLICT (contact_id, tag_id) DO NOTHING
    RETURNING id
  )
  SELECT EXISTS(SELECT 1 FROM ins) INTO v_inserted;

  IF v_inserted THEN
    INSERT INTO contact_events (
      organization_id, contact_id, event_type, payload_json,
      created_by_user_id, created_by_kind
    ) VALUES (
      v_org_id, p_contact_id, 'tag_added',
      jsonb_build_object('tag_id', v_tag_id, 'tag_name', trim(p_tag), 'source', v_source),
      v_caller_id, 'user'
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION add_contact_tag(uuid, text, text) TO authenticated, service_role;


-- ── D. remove_contact_tag(uuid, text) ─────────────────────────────
-- DELETE returns affected rows; emit event only when something deleted.

CREATE OR REPLACE FUNCTION remove_contact_tag(
  p_contact_id uuid,
  p_tag text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_id uuid;
  v_caller_id uuid := auth.uid();
  v_deleted_tag_id uuid;
  v_deleted_tag_name text;
BEGIN
  SELECT organization_id INTO v_org_id FROM contacts WHERE id = p_contact_id;
  IF v_org_id IS NULL THEN RETURN; END IF;

  WITH del AS (
    DELETE FROM contact_tags ct
    USING tags t
    WHERE ct.tag_id = t.id
      AND ct.contact_id = p_contact_id
      AND t.organization_id = v_org_id
      AND lower(t.name) = lower(p_tag)
    RETURNING t.id AS tag_id, t.name AS tag_name
  )
  SELECT tag_id, tag_name INTO v_deleted_tag_id, v_deleted_tag_name FROM del LIMIT 1;

  IF v_deleted_tag_id IS NOT NULL THEN
    INSERT INTO contact_events (
      organization_id, contact_id, event_type, payload_json,
      created_by_user_id, created_by_kind
    ) VALUES (
      v_org_id, p_contact_id, 'tag_removed',
      jsonb_build_object('tag_id', v_deleted_tag_id, 'tag_name', v_deleted_tag_name),
      v_caller_id, 'user'
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION remove_contact_tag(uuid, text) TO authenticated, service_role;


-- ── E. set_contact_status(uuid, text) — NEW ───────────────────────
-- Powers the manual single-status dropdown on /people/[id]. Returns
-- (changed, old_status, new_status) so the client can update local
-- state and tell whether anything actually happened.

CREATE OR REPLACE FUNCTION set_contact_status(
  p_contact_id uuid,
  p_status text
)
RETURNS TABLE(changed boolean, old_status text, new_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_org uuid;
  v_caller_id  uuid := auth.uid();
  v_old_status text;
  v_target_org uuid;
  v_valid_statuses text[] := ARRAY[
    'new','contacted','qualified','proposal','negotiation',
    'won','lost','do_not_contact','appointment_booked'
  ];
BEGIN
  IF NOT (p_status = ANY(v_valid_statuses)) THEN
    RAISE EXCEPTION 'Invalid status: %', p_status;
  END IF;

  SELECT organization_id INTO v_caller_org FROM profiles WHERE id = v_caller_id;
  IF v_caller_org IS NULL THEN
    RAISE EXCEPTION 'Access denied: caller has no organization';
  END IF;

  SELECT organization_id, status INTO v_target_org, v_old_status
  FROM contacts WHERE id = p_contact_id;

  IF v_target_org IS NULL THEN
    RAISE EXCEPTION 'Contact not found';
  END IF;
  IF v_target_org <> v_caller_org THEN
    RAISE EXCEPTION 'Access denied: contact belongs to another organization';
  END IF;

  IF v_old_status IS NOT DISTINCT FROM p_status THEN
    RETURN QUERY SELECT false, v_old_status, p_status;
    RETURN;
  END IF;

  UPDATE contacts SET status = p_status WHERE id = p_contact_id;

  INSERT INTO contact_events (
    organization_id, contact_id, event_type, payload_json,
    created_by_user_id, created_by_kind
  ) VALUES (
    v_caller_org, p_contact_id, 'status_changed',
    jsonb_build_object('from', v_old_status, 'to', p_status, 'reason', 'manual_single'),
    v_caller_id, 'user'
  );

  RETURN QUERY SELECT true, v_old_status, p_status;
END $$;

GRANT EXECUTE ON FUNCTION set_contact_status(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION set_contact_status(uuid, text) TO service_role;
