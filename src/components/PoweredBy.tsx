'use client'

import { useBrand } from '@/contexts/BrandContext'

// ────────────────────────────────────────────────────────────────────────────
// <PoweredBy /> — platform attribution footer
// ────────────────────────────────────────────────────────────────────────────
// Renders "Powered by Lead Friendly" unless the org has
// hide_platform_branding=true. Always drops the link on the platform itself.
// ────────────────────────────────────────────────────────────────────────────

interface PoweredByProps {
  className?: string
  inline?: boolean
}

export function PoweredBy({ className, inline = false }: PoweredByProps) {
  const brand = useBrand()

  // Stage 3.3.1: sub-account users never see the platform attribution,
  // regardless of the parent agency's hide_platform_branding toggle. This
  // protects the agency's white-label experience for their clients.
  if (brand.isSubAccount) return null
  if (brand.full.hidePlatformBranding) return null
  if (brand.full.portalName === 'Lead Friendly') return null

  const text = 'Powered by Lead Friendly'
  const base = inline
    ? 'inline text-xs opacity-60'
    : 'block text-xs text-zinc-500'

  return (
    <a
      href="https://leadfriendly.com"
      target="_blank"
      rel="noreferrer"
      className={[base, 'hover:opacity-100', className].filter(Boolean).join(' ')}
    >
      {text}
    </a>
  )
}
