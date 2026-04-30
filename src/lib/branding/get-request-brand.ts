// Per-request brand resolution. Wraps the header reads + effective-org-id
// derivation + loadOrgBrand call in React's `cache()` so callers within the
// same request (e.g. generateMetadata + RootLayout body) share one result.
//
// Source priority — same as src/app/layout.tsx originally inlined:
//   1. Active impersonation session (Stage 3.3) — middleware injects
//      x-lf-impersonation-active + x-lf-acting-as-org-id.
//   2. Custom-domain middleware header `x-lf-org-id` — set when a verified
//      custom domain resolves to an org (Stage 3.2).
//   3. Brand preview (Stage 3.4) — agency admin opt-in via cookie; middleware
//      injects x-lf-brand-preview-org-id.
//   4. None — DEFAULT_BRAND.

import { cache } from 'react'
import { headers } from 'next/headers'
import { loadOrgBrand } from './load'
import { DEFAULT_BRAND, type OrgBrand } from '@/lib/schemas/stage3'

export type RequestBrand = {
  brand: OrgBrand
  effectiveOrgId: string | null
  /** True when the brand was resolved via the preview cookie path. */
  isBrandPreview: boolean
}

export const getRequestBrand = cache(async (): Promise<RequestBrand> => {
  const hdrs = await headers()

  const impersonationActive = hdrs.get('x-lf-impersonation-active') === '1'
  const actingAsOrgId = hdrs.get('x-lf-acting-as-org-id')
  const orgIdFromHost = hdrs.get('x-lf-org-id')
  const previewOrgId = hdrs.get('x-lf-brand-preview-org-id')

  const effectiveOrgId =
    impersonationActive && actingAsOrgId
      ? actingAsOrgId
      : (orgIdFromHost ?? previewOrgId ?? null)

  const isBrandPreview =
    !(impersonationActive && actingAsOrgId) &&
    !orgIdFromHost &&
    !!previewOrgId

  const brand = effectiveOrgId
    ? await loadOrgBrand(effectiveOrgId)
    : DEFAULT_BRAND

  return { brand, effectiveOrgId, isBrandPreview }
})
