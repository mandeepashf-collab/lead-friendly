-- Stage 2.1 — org default timezone for TCPA evaluator fallback chain
--
-- resolveContactTimezone(contactTz, phone, orgDefault) only uses orgDefault
-- when both contact.timezone is blank AND phone is toll-free/unknown. This
-- column supplies that fallback without hardcoding 'America/New_York' in code.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS default_timezone TEXT NOT NULL DEFAULT 'America/New_York';

COMMENT ON COLUMN public.organizations.default_timezone IS
  'Organization default timezone (IANA). Used as last-resort fallback by '
  'resolveContactTimezone() when contact has no TZ set AND phone yields no '
  'NANPA match (toll-free, 555 fictional, malformed). Real contacts almost '
  'always resolve via NANPA; this covers the edge case.';

-- Backfill: all 8 existing orgs get America/New_York as default. Owners can
-- change per-org later in Settings UI (not shipped yet).
UPDATE public.organizations
SET default_timezone = 'America/New_York'
WHERE default_timezone IS NULL;
