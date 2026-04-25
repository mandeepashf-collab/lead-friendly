'use client'

import { useBrand } from '@/contexts/BrandContext'

// ────────────────────────────────────────────────────────────────────────────
// <OrgLogo /> — renders the org's primary logo.
// ────────────────────────────────────────────────────────────────────────────
// Falls back to a colored square with the first letter of portalName.
// ────────────────────────────────────────────────────────────────────────────

interface OrgLogoProps {
  size?: number
  className?: string
  alt?: string
}

export function OrgLogo({ size = 24, className, alt }: OrgLogoProps) {
  const brand = useBrand()
  const logo = brand.full.primaryLogoUrl
  const name = brand.full.portalName

  if (logo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logo}
        alt={alt ?? name}
        style={{ width: size, height: size }}
        className={['object-contain rounded', className].filter(Boolean).join(' ')}
      />
    )
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        background: brand.full.primaryColor,
        fontSize: Math.max(10, size * 0.5),
      }}
      className={[
        'flex items-center justify-center rounded font-bold text-white uppercase',
        className,
      ].filter(Boolean).join(' ')}
      aria-label={alt ?? name}
    >
      {name.charAt(0)}
    </div>
  )
}
