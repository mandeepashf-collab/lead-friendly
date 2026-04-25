/**
 * Stage 3.2 — Server-side brand loader
 * ============================================================================
 *
 * Used by root layout (Server Component) to fetch an org's brand once per
 * request and inject it as CSS variables in the initial HTML payload.
 * Eliminates FOUC (flash of unbranded content) for custom-domain visitors.
 *
 * Caching: `unstable_cache` with a 60s TTL, keyed by orgId. The cache is
 * invalidated by PATCH /api/org/[id]/brand via revalidateTag().
 * ============================================================================
 */

import { unstable_cache, revalidateTag } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/service'
import { DEFAULT_BRAND, rowToOrgBrand, type OrgBrand, type OrganizationBrandingRow } from '@/lib/schemas/stage3'

const BRANDING_COLUMNS =
  'portal_name, primary_logo_url, favicon_url, primary_color, secondary_color, accent_color, background_color, text_color, sidebar_color, heading_font, body_font, support_email, support_phone, footer_text, custom_css, hide_platform_branding, custom_domain, domain_status'

const BRAND_CACHE_TAG = (orgId: string) => `org-brand:${orgId}`

/**
 * Load an org's brand, cached for 60s. Returns DEFAULT_BRAND if the org
 * doesn't exist or the query fails — never throws at the call site, since
 * the root layout can't afford to crash.
 */
export const loadOrgBrand = (orgId: string): Promise<OrgBrand> =>
  unstable_cache(
    async (): Promise<OrgBrand> => {
      try {
        const supabase = createServiceClient()
        const { data, error } = await supabase
          .from('organizations')
          .select(BRANDING_COLUMNS)
          .eq('id', orgId)
          .maybeSingle<OrganizationBrandingRow>()

        if (error || !data) return DEFAULT_BRAND
        return rowToOrgBrand(data)
      } catch (e) {
        console.error('[loadOrgBrand] unexpected error:', e)
        return DEFAULT_BRAND
      }
    },
    ['org-brand', orgId],
    { revalidate: 60, tags: [BRAND_CACHE_TAG(orgId)] },
  )()

/** Call this from PATCH handlers to force an immediate cache refresh. */
export function invalidateOrgBrand(orgId: string) {
  revalidateTag(BRAND_CACHE_TAG(orgId), 'max')
}
