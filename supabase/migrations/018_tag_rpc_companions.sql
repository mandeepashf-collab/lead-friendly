-- ============================================================
-- Migration 018: Automation V1 — tag RPC companions
-- Adds remove_contact_tag + bulk_add_contact_tags to pair with
-- the rewritten add_contact_tag shipped in migration 017.
-- ============================================================

-- 1. remove_contact_tag(contact_id, tag_name)
-- Removes the join row. Trigger from 017 updates contacts.tags[].
-- Idempotent: no-op if tag or join row doesn't exist.
CREATE OR REPLACE FUNCTION remove_contact_tag(p_contact_id uuid, p_tag text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  SELECT organization_id INTO v_org_id FROM contacts WHERE id = p_contact_id;
  IF v_org_id IS NULL THEN RETURN; END IF;

  DELETE FROM contact_tags ct
  USING tags t
  WHERE ct.tag_id = t.id
    AND ct.contact_id = p_contact_id
    AND t.organization_id = v_org_id
    AND lower(t.name) = lower(p_tag);
END;
$$;

ALTER FUNCTION public.remove_contact_tag(uuid, text) SET search_path = public, pg_temp;

-- 2. bulk_add_contact_tags(p_pairs jsonb)
-- Takes a JSON array: [{"contact_id": "uuid", "tag": "hot-lead", "source": "csv_import"}, ...]
-- Single round-trip for CSV import. source defaults to 'manual' if omitted.
-- Returns count of rows inserted (excludes no-ops from ON CONFLICT).
CREATE OR REPLACE FUNCTION bulk_add_contact_tags(p_pairs jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_inserted integer := 0;
  v_pair jsonb;
  v_contact_id uuid;
  v_tag_name text;
  v_source text;
  v_org_id uuid;
  v_tag_id uuid;
BEGIN
  IF p_pairs IS NULL OR jsonb_typeof(p_pairs) <> 'array' THEN
    RAISE EXCEPTION 'bulk_add_contact_tags: p_pairs must be a JSON array';
  END IF;

  FOR v_pair IN SELECT * FROM jsonb_array_elements(p_pairs) LOOP
    v_contact_id := (v_pair->>'contact_id')::uuid;
    v_tag_name   := v_pair->>'tag';
    v_source     := COALESCE(v_pair->>'source', 'manual');

    IF v_contact_id IS NULL OR v_tag_name IS NULL OR length(trim(v_tag_name)) = 0 THEN
      CONTINUE;
    END IF;

    -- Validate source against the CHECK constraint
    IF v_source NOT IN ('manual','csv_import','api','automation','eval_failure') THEN
      v_source := 'manual';
    END IF;

    SELECT organization_id INTO v_org_id FROM contacts WHERE id = v_contact_id;
    IF v_org_id IS NULL THEN CONTINUE; END IF;

    INSERT INTO tags (organization_id, name)
    VALUES (v_org_id, v_tag_name)
    ON CONFLICT (organization_id, lower(name))
      DO UPDATE SET name = tags.name
    RETURNING id INTO v_tag_id;

    INSERT INTO contact_tags (organization_id, contact_id, tag_id, source)
    VALUES (v_org_id, v_contact_id, v_tag_id, v_source)
    ON CONFLICT (contact_id, tag_id) DO NOTHING;

    IF FOUND THEN v_inserted := v_inserted + 1; END IF;
  END LOOP;

  RETURN v_inserted;
END;
$$;

ALTER FUNCTION public.bulk_add_contact_tags(jsonb) SET search_path = public, pg_temp;
