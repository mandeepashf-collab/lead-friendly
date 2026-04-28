-- Migration 029: Switch calendar_integrations unique constraint to be org-scoped
--
-- Context
--   The Cal.com integration code (src/app/api/calendar/calcom/route.ts and
--   src/lib/calcom/client.ts) treats calendar_integrations as org-scoped:
--   one Cal.com row per organization regardless of which user connected it.
--   The original migration shipped with UNIQUE (user_id, provider), which
--   caused the upsert in route.ts (onConflict: 'organization_id,provider')
--   to fail with Postgres error 42P10 "no unique or exclusion constraint
--   matching the ON CONFLICT specification". The UI surfaced this as
--   "Failed to save Cal.com integration".
--
--   It also created a latent multi-row bug: two teammates in the same org
--   could each save their own integration, then getCalcomIntegration()'s
--   .maybeSingle() filtered only by organization_id would crash with
--   "multiple rows returned".
--
-- Effect
--   Drops the user-scoped unique constraint, adds an org-scoped one. Safe
--   to run on existing data because at the time of writing there are zero
--   rows in calendar_integrations.

ALTER TABLE calendar_integrations
  DROP CONSTRAINT IF EXISTS calendar_integrations_user_id_provider_key;

ALTER TABLE calendar_integrations
  ADD CONSTRAINT calendar_integrations_organization_id_provider_key
  UNIQUE (organization_id, provider);
