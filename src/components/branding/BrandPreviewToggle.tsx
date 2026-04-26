'use client'

import { useState } from 'react'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { useBrand } from '@/contexts/BrandContext'

// ── BrandPreviewToggle ────────────────────────────────────────────────────
// Stage 3.4 — Button that flips the lf_brand_preview cookie on/off so the
// caller can see their own brand applied on platform hosts. Self-hides for
// non-agency-admins (server-side gate enforces the same in /api/brand-preview).
//
// Click → POST or DELETE /api/brand-preview → full-page reload so middleware
// + root layout re-resolve the brand cleanly. No optimistic UI; the reload
// is the simplest way to avoid stale CSS variables on the old paint.

export function BrandPreviewToggle() {
  const brand = useBrand()
  const [busy, setBusy] = useState(false)

  if (!brand.isAgencyAdmin) return null

  const isOn = brand.isBrandPreview

  async function handleClick() {
    setBusy(true)
    try {
      const method = isOn ? 'DELETE' : 'POST'
      const res = await fetch('/api/brand-preview', { method })
      if (!res.ok) {
        // Non-agency-admins shouldn't reach here (the button self-hides),
        // but if the gate trips for some other reason just stop and unfreeze.
        console.warn('Brand preview toggle failed:', res.status)
        return
      }
      window.location.reload()
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      title={
        isOn
          ? 'Stop applying your brand on platform hosts'
          : 'See your brand applied on platform hosts (only visible to you)'
      }
      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : isOn ? (
        <EyeOff className="h-4 w-4" />
      ) : (
        <Eye className="h-4 w-4" />
      )}
      {isOn ? 'Exit preview' : 'Preview on platform'}
    </button>
  )
}
