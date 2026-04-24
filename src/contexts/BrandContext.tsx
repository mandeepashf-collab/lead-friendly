'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { DEFAULT_BRAND, type OrgBrand } from '@/lib/schemas/stage3'

// ────────────────────────────────────────────────────────────────────────────
// Stage 3.2 — Brand context
// ────────────────────────────────────────────────────────────────────────────
// Source-of-truth flow:
//   1. Server layout loads brand from `organizations` and injects
//        <script>window.__LF_BRAND__ = { ... }</script>
//      BrandProvider hydrates from this on first render — no fetch, no FOUC.
//   2. If window.__LF_BRAND__ is absent (legacy page, shared component tree),
//      BrandProvider falls back to /api/org/[id]/brand using the session's
//      organization_id from profiles.
//   3. Impersonation path (agency viewing a sub-account) is preserved as a
//      top-priority override — if the impersonation cookies are present,
//      we read sub_accounts and use that brand instead.
//
// The exported shape is a SUPERSET of the old interface:
//   - Legacy fields (brandName/brandColor/brandLogo/isWhiteLabel/
//     isImpersonating/impersonatingSubAccountId) preserved for existing
//     consumers in ImpersonationBanner, AccountSwitcher, dashboard/settings.
//   - `full` exposes the Stage 3.2 OrgBrand for new consumers.
// ────────────────────────────────────────────────────────────────────────────

interface BrandConfig {
  brandName: string
  brandColor: string
  brandLogo: string | null
  isWhiteLabel: boolean
  isImpersonating: boolean
  impersonatingSubAccountId: string | null

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
  full: DEFAULT_BRAND,
  refresh: () => {},
}

const BrandContext = createContext<BrandConfig>(defaultBrand)

declare global {
  interface Window {
    __LF_BRAND__?: OrgBrand
    __LF_ORG_ID__?: string
  }
}

function orgBrandToLegacy(
  brand: OrgBrand,
  impersonation?: { subId: string },
): Omit<BrandConfig, 'refresh'> {
  return {
    brandName: brand.portalName,
    brandColor: brand.primaryColor,
    brandLogo: brand.primaryLogoUrl,
    isWhiteLabel: brand.isWhiteLabeled,
    isImpersonating: Boolean(impersonation),
    impersonatingSubAccountId: impersonation?.subId ?? null,
    full: brand,
  }
}

export function BrandProvider({ children }: { children: React.ReactNode }) {
  // Hydration-safe initial state.
  const [brand, setBrand] = useState<BrandConfig>(() => {
    if (typeof window !== 'undefined' && window.__LF_BRAND__) {
      return { ...orgBrandToLegacy(window.__LF_BRAND__), refresh: () => {} }
    }
    return defaultBrand
  })

  const [reloadTick, setReloadTick] = useState(0)
  const refresh = () => setReloadTick((n) => n + 1)

  useEffect(() => {
    let cancelled = false

    async function loadBrand() {
      const supabase = createClient()

      // ── Impersonation override (highest priority) ─────────────────────
      const token = document.cookie.match(/impersonation_token=([^;]+)/)?.[1]
      const subId = document.cookie.match(/impersonation_sub_account=([^;]+)/)?.[1]

      if (token && subId) {
        const { data: sub } = await supabase
          .from('sub_accounts')
          .select('company_name, primary_color, logo_url')
          .eq('id', subId)
          .single()

        if (!cancelled && sub) {
          const impersonationBrand: OrgBrand = {
            ...DEFAULT_BRAND,
            portalName: sub.company_name || 'Client Portal',
            primaryColor: sub.primary_color || DEFAULT_BRAND.primaryColor,
            primaryLogoUrl: sub.logo_url || null,
            isWhiteLabeled: true,
          }
          setBrand({
            ...orgBrandToLegacy(impersonationBrand, { subId }),
            refresh,
          })
          return
        }
      }

      // ── Normal path: server-hydrated or fetched ───────────────────────
      if (window.__LF_BRAND__) {
        setBrand({ ...orgBrandToLegacy(window.__LF_BRAND__), refresh })
        return
      }

      // Fallback: no hydration payload. Look up the session's org and fetch.
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
