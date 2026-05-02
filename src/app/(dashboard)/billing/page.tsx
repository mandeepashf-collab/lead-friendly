import { redirect } from 'next/navigation'

/**
 * P9.1 5.4: /billing is deprecated in favor of /settings/billing.
 *
 * Historically /billing had two responsibilities glued together:
 *   1. Subscription / wallet management (your Lead Friendly plan)
 *   2. Customer invoicing (your customers' invoices)
 *
 * Those are now split:
 *   - /settings/billing → subscription + wallet (canonical billing dashboard)
 *   - /payments         → customer invoicing (already existed in parallel)
 *
 * Server-side redirect preserves SEO if anything was indexed and avoids
 * a flash of stale UI for users who hit the old URL from a bookmark.
 */
export default function BillingRedirect() {
  redirect('/settings/billing')
}
