// Single source of truth for "is this request on the Lead Friendly master
// domain, or on a white-label tenant's custom domain?"
//
// Master = the canonical leadfriendly.com surface. Anything else (a tenant's
// custom_domain via Stage 3.2) is a tenant. SEO scaffolding (sitemap, robots
// index rules, OrganizationSchema, "%s | Lead Friendly" title template,
// canonical URLs pointing at leadfriendly.com) must only apply on master.
//
// localhost and *.vercel.app are treated as master so local dev and Vercel
// previews mirror production SEO behavior. Tenant testing uses real DNS
// (host header from a verified custom_domain), so this is unambiguous.

import { headers } from 'next/headers'

export const SITE_URL = 'https://www.leadfriendly.com'

const MASTER_BRAND_HOSTS = new Set<string>([
  'www.leadfriendly.com',
  'leadfriendly.com',
])

export function isMasterBrandHost(host: string | null | undefined): boolean {
  if (!host) return false
  const bare = host.split(':')[0].toLowerCase()
  if (MASTER_BRAND_HOSTS.has(bare)) return true
  if (bare === 'localhost' || bare === '127.0.0.1') return true
  if (bare.endsWith('.vercel.app')) return true
  return false
}

export async function isMasterBrandRequest(): Promise<boolean> {
  const hdrs = await headers()
  return isMasterBrandHost(hdrs.get('host'))
}
