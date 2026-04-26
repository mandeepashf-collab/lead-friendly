'use client'

import { Eye, X } from 'lucide-react'
import { useBrand } from '@/contexts/BrandContext'

// ── BrandPreviewBanner ────────────────────────────────────────────────────
// Stage 3.4 — Persistent top banner shown to agency admins who have opted
// into seeing their own brand on platform hosts via the lf_brand_preview
// cookie. Mirrors ImpersonationBanner's structure (fixed top, exit button)
// but uses indigo to distinguish it from impersonation's amber.
//
// "Exit" calls DELETE /api/brand-preview, which clears the cookie. Then a
// full-page reload re-runs middleware → root layout with no preview header,
// and the platform brand reappears.

export function BrandPreviewBanner() {
  const brand = useBrand()

  if (!brand.isBrandPreview) return null

  async function exitPreview() {
    try {
      await fetch('/api/brand-preview', { method: 'DELETE' })
    } catch (e) {
      console.warn('Failed to clear brand preview cookie gracefully:', e)
    }
    window.location.reload()
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-[60] bg-indigo-600 text-white">
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Eye size={16} />
          <span className="text-sm font-semibold">
            Previewing your brand
          </span>
          <span className="text-xs opacity-80">
            — only visible to you on platform hosts
          </span>
        </div>
        <button
          onClick={exitPreview}
          className="flex items-center gap-1.5 px-3 py-1 bg-white/15 hover:bg-white/25 rounded-lg text-sm font-medium transition-colors">
          <X size={14} />
          Exit preview
        </button>
      </div>
    </div>
  )
}
