-- Stage 2.1 — TCPA HYBRID policy table
-- ALREADY APPLIED to Supabase via MCP in planning session. This file exists
-- for git history. If you need to re-apply (e.g. fresh local dev DB),
-- the SQL below is idempotent and safe to re-run.

CREATE TABLE IF NOT EXISTS public.org_tcpa_policies (
  organization_id UUID PRIMARY KEY
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  quiet_hours_start TIME NOT NULL DEFAULT '08:00'::time,
  quiet_hours_end   TIME NOT NULL DEFAULT '21:00'::time,
  dnc_check_enabled BOOLEAN NOT NULL DEFAULT false,
  max_attempts_ever INTEGER NOT NULL DEFAULT 10 CHECK (max_attempts_ever > 0),
  daily_cap_per_contact INTEGER NOT NULL DEFAULT 3 CHECK (daily_cap_per_contact > 0),
  allow_sunday BOOLEAN NOT NULL DEFAULT false,
  cooldown_minutes INTEGER NOT NULL DEFAULT 240 CHECK (cooldown_minutes >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT quiet_hours_valid CHECK (quiet_hours_start < quiet_hours_end)
);

COMMENT ON TABLE public.org_tcpa_policies IS
  'TCPA compliance policy per organization. See src/lib/tcpa/evaluator.ts. Federal fields are hard-enforced. Soft fields generate warnings that users can override for manual calls with audit logging; automated paths skip soft-blocked contacts.';

INSERT INTO public.org_tcpa_policies (organization_id)
SELECT id FROM public.organizations
ON CONFLICT (organization_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.tg_org_tcpa_policies_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tg_org_tcpa_policies_updated_at ON public.org_tcpa_policies;
CREATE TRIGGER tg_org_tcpa_policies_updated_at
  BEFORE UPDATE ON public.org_tcpa_policies
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_org_tcpa_policies_updated_at();

ALTER TABLE public.org_tcpa_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_isolation" ON public.org_tcpa_policies;
CREATE POLICY "org_isolation"
  ON public.org_tcpa_policies
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  );

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS dnc_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dnc_listed BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.contacts.dnc_checked_at IS
  'Last time federal DNC Registry was checked for this contact. Stale after 30 days per policy.';
COMMENT ON COLUMN public.contacts.dnc_listed IS
  'Cached result of federal DNC Registry lookup. Refreshed at most every 30 days.';
