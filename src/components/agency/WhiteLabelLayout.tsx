import { headers } from 'next/headers'

// ── WhiteLabelLayout ──────────────────────────────────────────
// Wraps the entire app layout.
// Reads white-label branding headers set by middleware (for custom domain access)
// and injects CSS variables so the whole app uses the client's colors.
//
// The ImpersonationBanner is now a client component that reads from BrandContext,
// so it's rendered in the dashboard layout instead.

interface WhiteLabelLayoutProps {
  children: React.ReactNode
}

export async function WhiteLabelLayout({ children }: WhiteLabelLayoutProps) {
  const headersList = await headers()

  // Read white-label branding from middleware headers
  const isWhiteLabel = headersList.get('x-is-white-label') === 'true'
  const brandName = headersList.get('x-brand-name') || 'Lead Friendly'
  const brandColor = headersList.get('x-brand-color') || '#6366f1'

  // Convert brand color to RGB for CSS variable
  function hexToRgb(hex: string): string {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return `${r} ${g} ${b}`
  }

  const brandColorRgb = brandColor.startsWith('#') ? hexToRgb(brandColor) : '99 102 241'

  return (
    <>
      {/* Inject white-label CSS variables */}
      {isWhiteLabel && (
        <style dangerouslySetInnerHTML={{ __html: `
          :root {
            --brand-color: ${brandColor};
            --brand-color-rgb: ${brandColorRgb};
            --brand-name: "${brandName}";
          }
          /* Override indigo with brand color */
          .bg-indigo-600 { background-color: ${brandColor} !important; }
          .bg-indigo-500 { background-color: ${brandColor}dd !important; }
          .text-indigo-400 { color: ${brandColor} !important; }
          .text-indigo-300 { color: ${brandColor}cc !important; }
          .border-indigo-500 { border-color: ${brandColor} !important; }
          .bg-indigo-500\\/10 { background-color: ${brandColor}1a !important; }
          .bg-indigo-600\\/20 { background-color: ${brandColor}33 !important; }
          .ring-indigo-500 { --tw-ring-color: ${brandColor} !important; }
          .focus\\:ring-indigo-500:focus { --tw-ring-color: ${brandColor} !important; }
          .hover\\:bg-indigo-500:hover { background-color: ${brandColor}dd !important; }
        `}} />
      )}

      {children}
    </>
  )
}
