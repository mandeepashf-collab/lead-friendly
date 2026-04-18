'use client'

import { useRouter } from 'next/navigation'
import { Eye, ArrowLeft } from 'lucide-react'
import { useBrand } from '@/contexts/BrandContext'

// ── ImpersonationBanner ───────────────────────────────────────
// Shown at the top of every page when an agency is viewing
// the platform as one of their clients.
// Reads brand context to show client name dynamically.

export function ImpersonationBanner() {
  const router = useRouter()
  const brand = useBrand()

  if (!brand.isImpersonating) return null

  async function endImpersonation() {
    await fetch('/api/agency/impersonate', { method: 'DELETE' })
    // Clear cookies client-side
    document.cookie = 'impersonation_token=;path=/;max-age=0'
    document.cookie = 'impersonation_sub_account=;path=/;max-age=0'
    window.location.href = '/dashboard'
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
            — all actions affect this account
          </span>
        </div>
        <button
          onClick={endImpersonation}
          className="flex items-center gap-1.5 px-3 py-1 bg-amber-950/20 hover:bg-amber-950/30 rounded-lg text-sm font-medium transition-colors">
          <ArrowLeft size={14} />
          Back to Lead Friendly
        </button>
      </div>
    </div>
  )
}
