-- 008: Contact tags + auto-tagging helper RPC
--
-- Part A — adds the `tags text[]` column on contacts (idempotent) plus a GIN
-- index for fast tag filtering.
--
-- Part B — installs `add_contact_tag(uuid, text)` so the Telnyx voice webhook
-- (and anyone else) can append a tag in a single round-trip without needing
-- to first SELECT the contact and handle duplicates in app code.
--
-- Run this in the Supabase SQL editor for project zdxdcgiwimbhgaqfgbzl.

-- ── Column + index ─────────────────────────────────────────────────────────
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_contacts_tags ON contacts USING GIN (tags);

-- ── Idempotent tag-append RPC ──────────────────────────────────────────────
-- Appends `p_tag` to contacts.tags only if it's not already present. Uses
-- SECURITY DEFINER so it can be called with the service-role key from the
-- voice webhook (which bypasses RLS anyway) and by callers that might only
-- have row-level access to their org's contacts.
CREATE OR REPLACE FUNCTION add_contact_tag(p_contact_id uuid, p_tag text)
RETURNS void AS $$
  UPDATE contacts
     SET tags = array_append(COALESCE(tags, '{}'), p_tag)
   WHERE id = p_contact_id
     AND NOT (COALESCE(tags, '{}') @> ARRAY[p_tag]);
$$ LANGUAGE sql SECURITY DEFINER;

-- Allow authenticated users and the service role to invoke it.
GRANT EXECUTE ON FUNCTION add_contact_tag(uuid, text) TO authenticated, service_role;
