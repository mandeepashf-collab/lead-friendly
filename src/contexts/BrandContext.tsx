'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { DEFAULT_BRAND, type OrgBrand } from '@/lib/schemas/stage3'

// ────────────────────────────────────────────────────────────────────────────
// Stage 3.2/3.3 — Brand context
// ────────────────────────────────────────────────────────────────────────────
// Source-of-truth flow:
//   1. Middleware sees a custom domain OR an active impersonation session and
//      sets request headers (x-lf-org-id / x-lf-acting-as-org-id etc.)
//   2. Root layout (Server Component) reads those headers and injects
//        <script>
//          window.__LF_BRAND__ = { ...OrgBrand };
//          window.__LF_IMPERSONATION__ = { ...impersonationContext } | undefined;
//        </script>
//      BrandProvider hydrates from these on first render — no fetch, no FOUC.
//   3. If __LF_BRAND__ is absent (legacy page tree, shared component), the
//      provider falls back to /api/org/[id]/brand using the session's
//      organization_id from profiles.
//
// Stage 3.3 change vs. Stage 3.2:
//   - Old: BrandContext read non-httpOnly cookies and queried sub_accounts
//     directly. Both broke when Stage 3.1 dropped sub_accounts.
//   - New: cookie is httpOnly (JS can't see it). Impersonation state arrives
//     as a server-injected window.__LF_IMPERSONATION__ payload, populated by
//     middleware → root layout. The brand swap to the sub-account's identity
//     is also done server-side in the layout, so we don't need a separate
//     client-side fetch for it.
//
// The exported BrandContext shape is unchanged for backwards compat with
// ImpersonationBanner, AccountSwitcher, and dashboard/settings consumers.
// ────────────────────────────────────────────────────────────────────────────

interface BrandConfig {
  brandName: string
  brandColor: string
  brandLogo: string | null
  isWhiteLabel: boolean
  isImpersonating: boolean
  impersonatingSubAccountId: string | null
  /** Sub-account display name during impersonation (used by the banner). */
  impersonatingSubAccountName: string | null
  /** Stage 3.3.1 — top-level org owner/admin (no parent_organization_id). */
  isAgencyAdmin: boolean
  /** Stage 3.3.1 — user's home org has a parent_organization_id. */
  isSubAccount: boolean
  /** Stage 3.4 — brand was resolved via the preview cookie (not impersonation
   *  or custom domain). Drives the persistent preview banner. */
  isBrandPreview: boolean
  /** Stage 3.5.2 — user is in the platform_staff table. Drives Platform
   *  header link visibility + Alt+Shift+P shortcut. */
  isPlatformStaff: boolean

  full: OrgBrand
  /** Manually re-fetch after a settings-page save. */
  refresh: () => void
}

const defaultBrand: BrandConfig = {
  brandName: DEFAULT_BRAND.portalName,
  brandColor: DEFAULT_BRAND.primaryColor,
  brandLogo: null,
  isWhiteLabel: false,
  isImpersonating: false,
  impersonatingSubAccountId: null,
  impersonatingSubAccountName: null,
  isAgencyAdmin: false,
  isSubAccount: false,
  isBrandPreview: false,
  isPlatformStaff: false,
  full: DEFAULT_BRAND,
  refresh: () => {},
}

const BrandContext = createContext<BrandConfig>(defaultBrand)

interface ImpersonationHydration {
  subOrganizationId: string
  subOrgName: string | null
  actorUserId: string
  actorEmail: string | null
  expiresAt: string | null
}

declare global {
  interface Window {
    __LF_BRAND__?: OrgBrand
    __LF_ORG_ID__?: string
    __LF_IMPERSONATION__?: ImpersonationHydration
    __LF_USER_ORG__?: { isAgencyAdmin: boolean; isSubAccount: boolean }
    __LF_BRAND_PREVIEW__?: { active: boolean }
    __LF_PLATFORM_STAFF__?: { isStaff: boolean }
  }
}

function orgBrandToLegacy(
  brand: OrgBrand,
  impersonation?: ImpersonationHydration | null,
): Omit<BrandConfig, 'refresh'> {
  // Read role flags + preview state from the hydration payload window the
  // layout injects. Falls back to false on the server (typeof window check)
  // and for legacy entry points without the payload.
  const userOrg =
    typeof window !== 'undefined' ? window.__LF_USER_ORG__ : undefined
  const preview =
    typeof window !== 'undefined' ? window.__LF_BRAND_PREVIEW__ : undefined
  const platformStaff =
    typeof window !== 'undefined' ? window.__LF_PLATFORM_STAFF__ : undefined

  return {
    brandName: brand.portalName,
    brandColor: brand.primaryColor,
    brandLogo: brand.primaryLogoUrl,
    isWhiteLabel: brand.isWhiteLabeled,
    isImpersonating: Boolean(impersonation),
    impersonatingSubAccountId: impersonation?.subOrganizationId ?? null,
    impersonatingSubAccountName: impersonation?.subOrgName ?? null,
    isAgencyAdmin: userOrg?.isAgencyAdmin ?? false,
    isSubAccount: userOrg?.isSubAccount ?? false,
    isBrandPreview: preview?.active === true,
    isPlatformStaff: platformStaff?.isStaff === true,
    full: brand,
  }
}

export function BrandProvider({ children }: { children: React.ReactNode }) {
  // Hydration-safe initial state. Read both __LF_BRAND__ and __LF_IMPERSONATION__
  // synchronously so the first paint already shows the right identity.
  const [brand, setBrand] = useState<BrandConfig>(() => {
    if (typeof window !== 'undefined' && window.__LF_BRAND__) {
      return {
        ...orgBrandToLegacy(window.__LF_BRAND__, window.__LF_IMPERSONATION__),
        refresh: () => {},
      }
    }
    return defaultBrand
  })

  const [reloadTick, setReloadTick] = useState(0)
  const refresh = () => setReloadTick((n) => n + 1)

  useEffect(() => {
    let cancelled = false

    async function loadBrand() {
      // ── Server-hydrated path (the common case) ──────────────────────────
      // Root layout already resolved the brand (own org, custom-domain org,
      // or impersonated sub-org) and injected window.__LF_BRAND__. Use it.
      if (window.__LF_BRAND__) {
        setBrand({
          ...orgBrandToLegacy(window.__LF_BRAND__, window.__LF_IMPERSONATION__),
          refresh,
        })
        return
      }

      // ── Fallback: no hydration payload ──────────────────────────────────
      // Look up the session's org and fetch /api/org/[id]/brand directly.
      // This path is only hit on legacy entry points or if hydration was
      // disabled for some reason.
      const supabase = createClient()
      const { data: sessionData } = await supabase.auth.getUser()
      const userId = sessionData.user?.id
      if (!userId) {
        setBrand({ ...defaultBrand, refresh })
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', userId)
        .maybeSingle()

      if (!profile?.organization_id) {
        setBrand({ ...defaultBrand, refresh })
        return
      }

      try {
        const res = await fetch(`/api/org/${profile.organization_id}/brand`, {
          credentials: 'include',
        })
        if (!res.ok) throw new Error(`status ${res.status}`)
        const json = (await res.json()) as OrgBrand
        if (!cancelled) {
          setBrand({ ...orgBrandToLegacy(json), refresh })
        }
      } catch (e) {
        console.warn('[BrandProvider] fetch failed, using default brand:', e)
        if (!cancelled) setBrand({ ...defaultBrand, refresh })
      }
    }

    loadBrand()
    return () => {
      cancelled = true
    }
  }, [reloadTick])

  return <BrandContext.Provider value={brand}>{children}</BrandContext.Provider>
}

export const useBrand = () => useContext(BrandContext)
