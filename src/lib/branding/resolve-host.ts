/**
 * Stage 3.2 — Hostname → org resolver
 * ============================================================================
 *
 * Given a request hostname, find the matching organizations.custom_domain row.
 * Used by middleware to inject x-lf-org-id and by root layout to load brand
 * before client hydration.
 *
 * Caching: 5-minute Next.js cache keyed by hostname. Invalidated manually
 * from the domains verify/delete endpoints via revalidateTag.
 * ============================================================================
 */

import { unstable_cache, revalidateTag } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/service'

export interface ResolvedOrg {
  orgId: string
  domainStatus: 'not_configured' | 'dns_pending' | 'verified' | 'error'
}

const HOST_CACHE_TAG = (host: string) => `host-resolve:${host}`

/**
 * Normalize a hostname — strip port, lowercase. Returns null for empty.
 */
export function normalizeHost(host: string | null | undefined): string | null {
  if (!host) return null
  return host.split(':')[0].toLowerCase().trim() || null
}

/**
 * Determine whether a hostname is one of our platform hosts
 * (leadfriendly.com, *.vercel.app, localhost). These never do a DB lookup.
 */
export function isPlatformHost(host: string): boolean {
  return (
    host === 'leadfriendly.com' ||
    host === 'www.leadfriendly.com' ||
    host.endsWith('.leadfriendly.com') ||
    host.endsWith('.vercel.app') ||
    host === 'localhost' ||
    host === '127.0.0.1'
  )
}

/**
 * Resolve a custom-domain hostname to an org. Returns null if nothing matches.
 * Safe to call on platform hosts — returns null rather than hitting the DB.
 */
export const resolveOrgByHostname = (host: string): Promise<ResolvedOrg | null> =>
  unstable_cache(
    async (): Promise<ResolvedOrg | null> => {
      if (isPlatformHost(host)) return null

      try {
        const supabase = createServiceClient()
        const { data, error } = await supabase
          .from('organizations')
          .select('id, domain_status')
          .eq('custom_domain', host)
          .maybeSingle()

        if (error || !data) return null

        const status =
          data.domain_status === 'verified' ||
          data.domain_status === 'dns_pending' ||
          data.domain_status === 'error'
            ? data.domain_status
            : 'not_configured'

        return { orgId: data.id, domainStatus: status }
      } catch (e) {
        console.error('[resolveOrgByHostname] unexpected error:', e)
        return null
      }
    },
    ['host-resolve', host],
    { revalidate: 300, tags: [HOST_CACHE_TAG(host)] },
  )()

/** Invalidate after domain verification or deletion. */
export function invalidateHostResolution(host: string) {
  revalidateTag(HOST_CACHE_TAG(host))
}
