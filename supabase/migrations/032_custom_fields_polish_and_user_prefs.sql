-- migration 032: Phase 2 — custom fields polish + user table preferences
-- Phase 2 of Contacts V2 (memo signed off 2026-04-29).
--
-- Architectural decision: HYBRID model (definitions table + JSONB values).
-- - custom_fields (existing table, was unused) becomes the source of truth
--   for what fields exist, their type, options, ordering, etc.
-- - contacts.custom_fields (existing JSONB column, has 36 rows of real data)
--   stays as the value store. Keys in JSONB match field_key in definitions.
-- - user_table_preferences (new) stores per-user column visibility/order.
--
-- Why hybrid over pure EAV: zero migration of 36 production rows, the
-- existing CustomFieldsBlock + smart formatter keep working, CSV import
-- doesn't change. EAV's main win (typed value storage) is offset by a join
-- on every list view; not worth it at our current scale.

-- 1. Slug uniqueness per org on custom_fields definitions
ALTER TABLE public.custom_fields
  ADD CONSTRAINT custom_fields_org_field_key_uniq UNIQUE (organization_id, field_key);

-- 2. JSONB GIN index on contacts.custom_fields for fast key-existence lookups
CREATE INDEX IF NOT EXISTS idx_contacts_custom_fields_gin
  ON public.contacts USING GIN (custom_fields);

-- 3. user_table_preferences — per-user column visibility/order per table
CREATE TABLE public.user_table_preferences (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  table_name text NOT NULL,
  columns_json jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, table_name)
);

ALTER TABLE public.user_table_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_table_prefs_read_self" ON public.user_table_preferences
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "user_table_prefs_insert_self" ON public.user_table_preferences
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_table_prefs_update_self" ON public.user_table_preferences
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_table_prefs_delete_self" ON public.user_table_preferences
  FOR DELETE USING (auth.uid() = user_id);

-- 4. Backfill custom_fields definitions from existing JSONB keys.
-- Idempotent — ON CONFLICT skips definitions already present per org.
-- Type heuristics (key ILIKE):
--   *amount*, *price*  → currency
--   *age*, *count*     → number
--   *date*             → date
--   else               → text
-- NOTE: the *count* heuristic matches 'account' and 'county' as false
-- positives. Post-migration, manually flip those to 'text' if needed:
--   UPDATE custom_fields SET field_type='text' WHERE field_key IN ('account','county');
INSERT INTO public.custom_fields (
  organization_id, name, field_key, field_type, sort_order, is_active, applies_to
)
SELECT
  org_id,
  initcap(replace(key, '_', ' ')) AS name,
  key AS field_key,
  CASE
    WHEN key ILIKE '%amount%' OR key ILIKE '%price%' THEN 'currency'
    WHEN key ILIKE '%age%' OR key ILIKE '%count%' THEN 'number'
    WHEN key ILIKE '%date%' THEN 'date'
    ELSE 'text'
  END AS field_type,
  row_number() OVER (PARTITION BY org_id ORDER BY key) * 10 AS sort_order,
  true AS is_active,
  ARRAY['contacts']::text[] AS applies_to
FROM (
  SELECT DISTINCT c.organization_id AS org_id, k.key
  FROM public.contacts c, jsonb_object_keys(c.custom_fields) k(key)
  WHERE c.custom_fields IS NOT NULL AND c.custom_fields::text <> '{}'
) seed
ON CONFLICT (organization_id, field_key) DO NOTHING;
