-- migration 034: contact_events table for unified activity timeline (Phase 3a)
-- ──────────────────────────────────────────────────────────────────
-- Forward-only event log. Written from auto-status hooks (server routes,
-- service-role), bulk RPCs (3b), and single-tag/manual-status mutations
-- (3b client). Read by ActivityTimeline (3c) on /people/[id].
--
-- RLS:
--   SELECT — is_org_in_scope (matches contacts.contacts_read; handles
--            brand-preview + platform-staff impersonation).
--   INSERT — strict get_user_org_id() (matches contacts.contacts_upd /
--            contacts.contacts_del). Service-role webhooks bypass RLS,
--            so server-side emission paths are unaffected.
--
-- No UPDATE / DELETE policies — events are append-only. Service role can
-- still cleanup directly if ever needed.
-- ──────────────────────────────────────────────────────────────────

CREATE TABLE public.contact_events (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id          uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  event_type          text NOT NULL CHECK (event_type IN (
                        'status_changed', 'tag_added', 'tag_removed',
                        'note_added', 'system'
                      )),
  payload_json        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by_kind     text NOT NULL CHECK (created_by_kind IN (
                        'user', 'ai_agent', 'system', 'webhook'
                      )),
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_contact_events_contact_chrono
  ON public.contact_events (contact_id, created_at DESC);

CREATE INDEX idx_contact_events_org_chrono
  ON public.contact_events (organization_id, created_at DESC);

ALTER TABLE public.contact_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY contact_events_read ON public.contact_events
  FOR SELECT
  USING (is_org_in_scope(organization_id));

CREATE POLICY contact_events_insert ON public.contact_events
  FOR INSERT
  WITH CHECK (organization_id = get_user_org_id());

GRANT SELECT, INSERT ON public.contact_events TO authenticated;
GRANT SELECT, INSERT ON public.contact_events TO service_role;
