# Stage 3.2.1 — Custom Domain Verification Lifecycle

**Status:** Open followup from Stage 3.2.
**Estimate:** ~1 day.
**Blocker severity:** Medium. Without this, the `/api/domains/*` routes 500 when hit.

## What's broken

All four routes at `src/app/api/domains/*` write to a `custom_domains` table that
**does not exist in production Supabase** (verified Apr 24, 2026). Any attempt
to call them from the existing CustomDomainManager UI would fail.

Affected routes:
- `src/app/api/domains/route.ts` (GET/POST — list/create)
- `src/app/api/domains/buy/route.ts` (Vercel registrar purchase)
- `src/app/api/domains/verify/route.ts` (DNS TXT/CNAME verification + Vercel domain add)
- `src/app/api/domains/search/route.ts` (Vercel registrar availability)

## What Stage 3.2 did instead

- Added `custom_domain` field to the Settings → Branding form — writes directly to
  `organizations.custom_domain`. No verification lifecycle.
- `organizations.domain_status` stays at `'not_configured'` until we wire verification.
- Middleware's custom-domain lookup only treats `domain_status = 'verified'` as live,
  so typing a domain without verifying it results in `/unknown-domain` redirects
  (safe default).

## What 3.2.1 needs

### 1. Create `custom_domains` table

```sql
CREATE TABLE public.custom_domains (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  domain           TEXT NOT NULL UNIQUE,
  verification_token TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','verified','active','error')),
  txt_verified     BOOLEAN NOT NULL DEFAULT FALSE,
  cname_verified   BOOLEAN NOT NULL DEFAULT FALSE,
  ssl_status       TEXT,
  verified_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: users can see/edit domains for their own org
ALTER TABLE public.custom_domains ENABLE ROW LEVEL SECURITY;

CREATE POLICY "custom_domains_own_org_select" ON public.custom_domains
  FOR SELECT USING (
    organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "custom_domains_own_org_write" ON public.custom_domains
  FOR ALL USING (
    organization_id = (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('owner','admin')
  );
```

### 2. Wire verify success → organizations

When `txt_verified && cname_verified && vercelResult.success`, also:
```sql
UPDATE organizations
SET custom_domain = :domain, domain_status = 'verified'
WHERE id = :org_id;
```
And call `invalidateHostResolution(domain)` from `src/lib/branding/resolve-host.ts`
to bust the middleware's 5-min cache so the new domain activates immediately.

### 3. Update CustomDomainManager UI

Existing component at `src/components/agency/CustomDomainManager.tsx` needs to be
either:
- Replaced by a new Branding-page-integrated flow, OR
- Kept as-is and pointed at the new `custom_domains` table

### 4. Vercel team upgrade check

From the Stage 3 handoff doc: "Mandeep's Vercel account appears to be hobby
tier (no team returned from `list_teams`). Hobby tier supports custom domains
for 1 project but has limits on SSL/API usage." Needs verification before
relying on `/api/domains/verify` in production.

## Quick workaround for manual domain activation

If you want to test the middleware branding path before 3.2.1 ships:

```sql
UPDATE organizations
SET custom_domain = 'your-test-domain.com',
    domain_status = 'verified'
WHERE id = '41b43e35-24d0-40d7-b26a-cd6bc456938a';
```

Then add the domain to the Vercel project via the dashboard (Settings → Domains →
Add). Middleware will route the hostname → your org, and `BrandProvider` will pick
up your brand. No DNS verification needed for local `/etc/hosts` testing.
