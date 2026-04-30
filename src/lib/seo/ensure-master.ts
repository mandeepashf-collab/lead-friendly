// Page-level guard: 404 the route on tenant hosts.
//
// Use on master-only pages (/, /pricing, /terms, /privacy) — the proxy
// passes /pricing etc. through on tenant hosts so the layout's tenant
// metadata branch can still render the correct headers; this guard then
// short-circuits the page body and returns a 404 from notFound(). Keeps
// tenant SEO surfaces minimal (no Lead Friendly marketing copy bleeding
// into tenants' indexed-on-their-own-domain pages, even though tenants
// are noindex via layout robots).

import { notFound } from 'next/navigation'
import { isMasterBrandRequest } from './master-brand'

export async function ensureMasterBrandOr404(): Promise<void> {
  if (!(await isMasterBrandRequest())) {
    notFound()
  }
}
