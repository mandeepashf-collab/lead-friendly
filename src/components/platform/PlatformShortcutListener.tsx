'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useBrand } from '@/contexts/BrandContext'

// ────────────────────────────────────────────────────────────────────────────
// Stage 3.5.2 — Platform shortcut listener
// ────────────────────────────────────────────────────────────────────────────
// Global keyboard shortcut for staff: Alt+Shift+P navigates to /platform/orgs.
// Mounted once near the top of the app tree (dashboard layout). Self-disables
// for non-staff users — the effect's dependency on isPlatformStaff means the
// listener simply isn't attached when the flag is false.
// ────────────────────────────────────────────────────────────────────────────

export function PlatformShortcutListener() {
  const router = useRouter()
  const brand = useBrand()

  useEffect(() => {
    if (!brand.isPlatformStaff) return
    const handler = (e: KeyboardEvent) => {
      if (e.altKey && e.shiftKey && e.code === 'KeyP') {
        e.preventDefault()
        router.push('/platform/orgs')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [brand.isPlatformStaff, router])

  return null
}
