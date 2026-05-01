import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient as createUserClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

/**
 * GET /api/billing/invoices?limit=12
 *
 * Phase 5: Returns the customer's Stripe subscription invoices for display
 * in /settings/billing. Lives separately from /api/payments/* which handles
 * the customer's OWN customers' invoices — different domain.
 *
 * Auth: requires user session. Resolves stripe_customer_id from org.
 * Returns empty list if the org has no Stripe customer (e.g. Solo tier
 * never completed checkout).
 *
 * Response:
 *   {
 *     invoices: [{
 *       id, number, amountPaidCents, status, hostedInvoiceUrl,
 *       invoicePdf, createdAt, periodStart, periodEnd
 *     }, ...]
 *   }
 *
 * We deliberately fetch live from Stripe rather than cache locally —
 * Stripe is the source of truth, customers expect current data, and
 * the volume is low (tens of invoices/year per customer max).
 */

const supabaseService = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

const DEFAULT_LIMIT = 12
const MAX_LIMIT = 100

export async function GET(req: NextRequest) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { error: 'STRIPE_SECRET_KEY not configured' },
      { status: 500 },
    )
  }

  const supabaseUser = await createUserClient()
  const {
    data: { user },
    error: userErr,
  } = await supabaseUser.auth.getUser()
  if (userErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabaseService
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()

  if (!profile?.organization_id) {
    return NextResponse.json({ error: 'No organization' }, { status: 403 })
  }

  const { data: org } = await supabaseService
    .from('organizations')
    .select('stripe_customer_id')
    .eq('id', profile.organization_id)
    .single()

  // No Stripe customer yet — never completed checkout. Empty list, not an error.
  if (!org?.stripe_customer_id) {
    return NextResponse.json({ invoices: [] })
  }

  const limitParam = req.nextUrl.searchParams.get('limit')
  let limit = DEFAULT_LIMIT
  if (limitParam) {
    const parsed = parseInt(limitParam, 10)
    if (Number.isFinite(parsed) && parsed > 0) {
      limit = Math.min(parsed, MAX_LIMIT)
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-03-25.dahlia' as any })

  try {
    const list = await stripe.invoices.list({
      customer: org.stripe_customer_id,
      limit,
    })

    const invoices = list.data.map((inv) => ({
      id: inv.id,
      number: inv.number ?? null,
      amountPaidCents: inv.amount_paid ?? 0,
      amountDueCents: inv.amount_due ?? 0,
      currency: inv.currency,
      status: inv.status, // 'draft' | 'open' | 'paid' | 'uncollectible' | 'void'
      hostedInvoiceUrl: inv.hosted_invoice_url ?? null,
      invoicePdf: inv.invoice_pdf ?? null,
      createdAt: inv.created ? new Date(inv.created * 1000).toISOString() : null,
      periodStart: inv.period_start ? new Date(inv.period_start * 1000).toISOString() : null,
      periodEnd: inv.period_end ? new Date(inv.period_end * 1000).toISOString() : null,
    }))

    return NextResponse.json({ invoices })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[billing/invoices] Stripe error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
