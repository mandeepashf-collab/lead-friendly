// src/lib/dashboard/format.ts
//
// Small formatting helpers shared by the dashboard. Intentionally lightweight
// — no Intl-heavy locale work; the app is en-US only for v1.

export function formatStatusDate(d: Date = new Date()): string {
  const weekday = d.toLocaleDateString("en-US", { weekday: "long" })
  const month = d.toLocaleDateString("en-US", { month: "long" })
  const day = d.getDate()
  return `${weekday}, ${month} ${day}`
}

/**
 * Returns YYYY-MM-DD for the given Date in the user's local timezone.
 * Avoids the UTC-by-default behavior of toISOString().slice(0, 10), which
 * causes evening Pacific users to see "tomorrow" on date-bucketed charts and
 * default-date inputs.
 */
export function localDateKey(d: Date | string | number = new Date()): string {
  const date = typeof d === "string" || typeof d === "number" ? new Date(d) : d
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

/**
 * Compact integer/currency formatter.
 *  formatCompact(0)        => "0"
 *  formatCompact(847)      => "847"
 *  formatCompact(2300)     => "2.3K"
 *  formatCompact(1500000)  => "1.5M"
 */
export function formatCompact(n: number): string {
  if (!Number.isFinite(n)) return "0"
  if (Math.abs(n) < 1000) return String(Math.round(n))
  if (Math.abs(n) < 1_000_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K`
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`
}

/**
 * USD currency formatter.
 *  formatCurrency(0)       => "$0"
 *  formatCurrency(2350)    => "$2,350"
 *  formatCurrency(125000)  => "$125,000"
 */
export function formatCurrency(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`
}

export function formatCurrencyCompact(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "$0"
  if (Math.abs(n) < 1_000_000) return `$${Math.round(n).toLocaleString("en-US")}`
  return `$${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`
}
