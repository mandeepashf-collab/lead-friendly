/**
 * Stage 3.2 — Brand → CSS variables helper
 * ============================================================================
 *
 * Single source of truth for how an OrgBrand maps onto --lf-* CSS custom
 * properties. Imported by both the server (root layout <style> injection)
 * and the client (BrandProvider live updates on settings page).
 * ============================================================================
 */

import type { OrgBrand } from '@/lib/schemas/stage3'

/** Convert #rrggbb to "r g b" for use in `rgb(var(--lf-foo) / alpha)`. */
export function hexToRgbTriple(hex: string): string {
  const cleaned = hex.startsWith('#') ? hex.slice(1) : hex
  if (cleaned.length !== 6) return '99 102 241' // DEFAULT_BRAND primary
  const r = parseInt(cleaned.slice(0, 2), 16)
  const g = parseInt(cleaned.slice(2, 4), 16)
  const b = parseInt(cleaned.slice(4, 6), 16)
  return `${r} ${g} ${b}`
}

/**
 * Generate CSS text suitable for injection into a `<style>` tag.
 * Does NOT include `<style>` wrapper — the caller wraps.
 */
export function brandToCssText(brand: OrgBrand): string {
  const rgb = {
    primary: hexToRgbTriple(brand.primaryColor),
    secondary: hexToRgbTriple(brand.secondaryColor),
    accent: hexToRgbTriple(brand.accentColor),
  }

  return `
:root {
  --lf-primary: ${brand.primaryColor};
  --lf-primary-rgb: ${rgb.primary};
  --lf-secondary: ${brand.secondaryColor};
  --lf-secondary-rgb: ${rgb.secondary};
  --lf-accent: ${brand.accentColor};
  --lf-accent-rgb: ${rgb.accent};
  --lf-bg: ${brand.backgroundColor};
  --lf-text: ${brand.textColor};
  --lf-sidebar: ${brand.sidebarColor};
  --lf-heading-font: '${brand.headingFont}', system-ui, sans-serif;
  --lf-body-font: '${brand.bodyFont}', system-ui, sans-serif;
}

/* Backcompat: override hard-coded Tailwind indigo-* with the active brand
   primary so existing components pick up white-label colors without a
   per-file rewrite. Remove these once the codebase migrates to
   bg-[color:var(--lf-primary)] / text-[color:var(--lf-primary)]. */
.bg-indigo-600  { background-color: ${brand.primaryColor} !important; }
.bg-indigo-500  { background-color: ${brand.primaryColor}dd !important; }
.text-indigo-400 { color: ${brand.primaryColor} !important; }
.text-indigo-300 { color: ${brand.primaryColor}cc !important; }
.border-indigo-500 { border-color: ${brand.primaryColor} !important; }
.ring-indigo-500 { --tw-ring-color: ${brand.primaryColor} !important; }
.hover\\:bg-indigo-500:hover { background-color: ${brand.primaryColor}dd !important; }
.focus\\:ring-indigo-500:focus { --tw-ring-color: ${brand.primaryColor} !important; }
`.trim()
}

/**
 * Hydration payload shape — what we JSON-stringify onto the window so the
 * client BrandProvider can skip its initial fetch.
 */
export function brandToHydrationPayload(brand: OrgBrand) {
  return brand
}
