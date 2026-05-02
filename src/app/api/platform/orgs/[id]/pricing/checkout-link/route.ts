import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { requirePlatformStaff } from '@/lib/platform-staff/auth'

/**
 * D2: Generate a Stripe Checkout link for an org's saved custom contract.
 *
 * POST /api/platform/orgs/[id]/pricing/checkout-link
 *   Body: {} (no inputs — everything sourced from the org row)
 *
 *   Reads the org's custom_stripe_price_id (and optionally wl_stripe_price_id),
 *   creates a Checkout Session in subscription mode, returns the session URL.
 *   Founder copies the URL and sends it to the customer manually (D5 will add
 *   a "send email" button).
 *
 * Mirrors src/app/api/stripe/checkout/route.ts patterns:
 *   - Pinned API version
 *   - Reuse-or-create stripe customer for the org
 *   - automatic_tax: true (matches existing tier checkout flow — Stripe Tax
 *     verified working on May 1)
 *   - Annual subscriptions get consent_collection.terms_of_service='required'
 *
 * Returns: { url, sessionId }
 */

interface RouteContext {
  params: Promise<{ id: string }>
}

const STRIPE_API_VERSION = '2026-03-25.dahlia' as const

export async function POST(req: NextRequest, ctx: RouteContext) {
  const auth = await requirePlatformStaff()
  if (auth.error) return auth.error
  const supabase = auth.ctx.admin

  const { id: orgId } = await ctx.params

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { error: 'Stripe is not configured — set STRIPE_SECRET_KEY in env vars' },
      { status: 500 },
    )
  }

  // Read the contract + the customer's primary contact email (used as fallback
  // when we have no Stripe customer yet).
  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select(
      'id, name, stripe_customer_id, custom_monthly_fee_cents, custom_included_minutes, custom_framing_rate_x10000, custom_overage_rate_x10000, custom_wl_fee_cents, custom_billing_interval, custom_stripe_product_id, custom_stripe_price_id, custom_wl_stripe_price_id, custom_contract_archived_at',
    )
    .eq('id', orgId)
    .maybeSingle()

  if (orgErr || !org) {
    return NextResponse.json({ error: 'Org not found' }, { status: 404 })
  }

  if (org.custom_contract_archived_at) {
    return NextResponse.json(
      { error: 'Contract is archived. Re-save the contract to generate a new checkout link.' },
      { status: 400 },
    )
  }

  if (!org.custom_stripe_price_id) {
    return NextResponse.json(
      {
        error:
          'No Stripe Price for this contract yet. Save the contract first '
          + '(the save flow creates the platform-fee Stripe Price).',
      },
      { status: 400 },
    )
  }

  if (!org.custom_billing_interval) {
    return NextResponse.json(
      { error: 'Contract is missing billing_interval. Re-save the contract.' },
      { status: 400 },
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: STRIPE_API_VERSION as any })

  // Reuse or create the Stripe customer for this org. Same pattern as
  // /api/stripe/checkout, except we don't have a logged-in user here —
  // this is a platform-staff action. We don't pass an email when creating
  // the customer; the customer email gets captured during Checkout itself
  // (Checkout always collects email when no customer is supplied).
  let customerId = org.stripe_customer_id as string | null
  if (!customerId) {
    try {
      const customer = await stripe.customers.create({
        name: org.name || undefined,
        metadata: { organization_id: org.id, lf_kind: 'custom_contract' },
      })
      customerId = customer.id
      await supabase
        .from('organizations')
        .update({ stripe_customer_id: customerId })
        .eq('id', org.id)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return NextResponse.json(
        { error: `Stripe customer creation failed: ${msg}` },
        { status: 500 },
      )
    }
  }

  const origin =
    req.headers.get('origin')
    || process.env.NEXT_PUBLIC_APP_URL
    || 'https://www.leadfriendly.com'

  const lineItems: Array<{ price: string; quantity: number }> = [
    { price: org.custom_stripe_price_id, quantity: 1 },
  ]
  let wlAttached = false
  if (org.custom_wl_stripe_price_id) {
    lineItems.push({ price: org.custom_wl_stripe_price_id, quantity: 1 })
    wlAttached = true
  }

  // Webhook-side metadata. tier_id='custom' is the signal that the webhook
  // handler should look up the contract on the org row instead of resolving
  // via getTierByStripePriceId. (Webhook D3 will implement that lookup; for
  // now the metadata is set so D3 has what it needs without a re-checkout.)
  const sharedMetadata = {
    organization_id: org.id,
    tier_id: 'custom',
    billing_interval: org.custom_billing_interval,
    lf_kind: 'custom_contract',
  }

  const isAnnual = org.custom_billing_interval === 'annual'
  const platformDollars = ((org.custom_monthly_fee_cents ?? 0) / 100).toLocaleString(
    'en-US',
    { minimumFractionDigits: 2, maximumFractionDigits: 2 },
  )
  const wlDollars =
    org.custom_wl_fee_cents !== null
      ? (org.custom_wl_fee_cents / 100).toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      : null
  const consentMessage = isAnnual
    ? `I understand my Custom contract will charge $${platformDollars} `
      + `today${wlDollars ? ` plus $${wlDollars} for the white-label add-on` : ''}, `
      + `and renew at the same amount every 12 months unless I cancel before then.`
    : null

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode: 'subscription',
    customer: customerId,
    client_reference_id: org.id,
    line_items: lineItems,
    allow_promotion_codes: true,
    payment_method_collection: 'always',
    billing_address_collection: 'required',
    customer_update: { address: 'auto', name: 'auto' },
    automatic_tax: { enabled: true },
    success_url: `${origin}/dashboard?subscription=success&tier=custom&interval=${org.custom_billing_interval}${wlAttached ? '&wl=1' : ''}`,
    cancel_url: `${origin}/pricing?subscription=cancel`,
    subscription_data: {
      metadata: { ...sharedMetadata, wl_addon: wlAttached ? '1' : '0' },
    },
    metadata: { ...sharedMetadata, wl_addon: wlAttached ? '1' : '0' },
  }

  if (isAnnual && consentMessage) {
    sessionParams.consent_collection = { terms_of_service: 'required' }
    sessionParams.custom_text = {
      terms_of_service_acceptance: { message: consentMessage },
    }
  }

  let session: Stripe.Checkout.Session
  try {
    session = await stripe.checkout.sessions.create(sessionParams)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (isAnnual && /terms_of_service|terms of service/i.test(message)) {
      console.error('[custom-pricing/checkout-link] annual ToS error:', message)
      return NextResponse.json(
        {
          error:
            'Annual checkout requires a Terms of Service URL on your Stripe account. '
            + 'Set it in Public details and retry.',
        },
        { status: 500 },
      )
    }
    console.error('[custom-pricing/checkout-link] session.create failed:', message)
    return NextResponse.json(
      { error: `Stripe error: ${message}` },
      { status: 500 },
    )
  }

  return NextResponse.json({
    url: session.url,
    sessionId: session.id,
    wlAttached,
  })
}
