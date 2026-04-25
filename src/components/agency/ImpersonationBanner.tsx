'use client'

import { Eye, ArrowLeft } from 'lucide-react'
import { useBrand } from '@/contexts/BrandContext'

// ── ImpersonationBanner ───────────────────────────────────────────────────
// Stage 3.3 — Shown at the top of every page when an agency admin is viewing
// the platform as one of their sub-accounts.
//
// Reads brand context (which now reads window.__LF_IMPERSONATION__ injected
// by the root layout, which itself reads middleware-set headers backed by
// the lf_impersonation_token httpOnly cookie).
//
// "Exit" calls DELETE /api/agency/impersonate, which:
//   - calls end_impersonation RPC (writes audit log)
//   - clears lf_impersonation_token cookie (and the legacy ones, defensively)
// Then a full-page reload picks up the agency's own brand again.

export function ImpersonationBanner() {
  const brand = useBrand()

  if (!brand.isImpersonating) return null

  async function endImpersonation() {
    try {
      await fetch('/api/agency/impersonate', { method: 'DELETE' })
    } catch (e) {
      // The RPC is idempotent; even if the request failed, the cookie clear
      // happens server-side via Set-Cookie. We log and continue with reload.
      console.warn('Failed to end impersonation gracefully:', e)
    }
    // Full reload so the server layout re-renders with the agency's brand.
    window.location.href = '/agency/dashboard'
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-[60] bg-amber-500 text-amber-950">
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Eye size={16} />
          <span className="text-sm font-semibold">
            Viewing as {brand.brandName}
          </span>
          <span className="text-xs opacity-70">
            — read-only session, expires soon
          </span>
        </div>
        <button
          onClick={endImpersonation}
          className="flex items-center gap-1.5 px-3 py-1 bg-amber-950/20 hover:bg-amber-950/30 rounded-lg text-sm font-medium transition-colors">
          <ArrowLeft size={14} />
          Back to your agency
        </button>
      </div>
    </div>
  )
}
