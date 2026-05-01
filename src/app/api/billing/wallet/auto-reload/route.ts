import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient as createUserClient } from '@/lib/supabase/server'

/**
 * POST /api/billing/wallet/auto-reload
 *
 * Phase 4.5 + 5: Charges the customer's default payment method on file via
 * Stripe Payment Intent and credits their wallet on success.
 *
 * Trigger sources:
 *   - 'auto_reload': fired by usage.ts when debit_wallet returns
 *     needs_reload=true after a call completion
 *   - 'manual_topup': from /settings/billing Top Up button (Phase 5)
 *   - 'cron_sweep': daily safety net for orgs that fell through cracks
 *
 * Auth (TWO supported paths):
 *   A) Internal: x-internal-secret (or x-cron-secret) header matching
 *      CRON_SECRET. Caller must pass organizationId in body. Used by
 *      usage.ts fire-and-forget trigger and future cron jobs.
 *   B) Session: logged-in user (Supabase session via cookies). Org is
 *      derived from the user's profile.organization_id; the body's
 *      organizationId is ignored if present (defense against confused-
 *      deputy attacks where a session user tries to top up someone
 *      else's wallet). Used by /settings/billing Top Up button.
 *
 * Body: { organizationId?: string; triggerSource?: 'auto_reload' | 'manual_topup' | 'cron_sweep' }
 *
 * Response shapes:
 *   200 { skipped: true, reason: '...' }
 *   200 { success: true, paymentIntentId, balanceAfterCents }
 *   200 { success: false, error: '...', errorMessage, balanceCents }
 *   401 { error: 'Unauthorized' }
 *   500 { error: '...' }
 *
 * Idempotency: if a reload attempt for this org already exists in last 60s
 * (pending or succeeded), returns skipped=true without firing Stripe call.
 */

const supabase = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

type TriggerSource = 'auto_reload' | 'manual_topup' | 'cron_sweep'

interface OrgWalletRow {
  balance_cents: number
  auto_reload_enabled: boolean
  auto_reload_threshold_cents: number
  auto_reload_amount_cents: number
  is_blocked: boolean
  stripe_payment_method_id: string | null
}

interface OrgRow {
  id: string
  tier: string
  stripe_customer_id: string | null
}

export async function POST(req: NextRequest) {
  // ── Dual auth: internal secret OR logged-in session ────────
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json(
      { error: 'CRON_SECRET not configured' },
      { status: 500 },
    )
  }

  const provided = req.headers.get('x-internal-secret') || req.headers.get('x-cron-secret')
  const isInternal = provided === cronSecret

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { error: 'STRIPE_SECRET_KEY not configured' },
      { status: 500 },
    )
  }

  let body: { organizationId?: string; triggerSource?: TriggerSource } = {}
  try {
    body = await req.json()
  } catch {
    // Empty body is fine for session-auth manual_topup; we'll resolve org from session
  }

  const triggerSource: TriggerSource = body.triggerSource ?? 'auto_reload'

  // Resolve organizationId based on auth path:
  // - Internal: trust body.organizationId
  // - Session: derive from user's profile, IGNORING any body.organizationId
  //   (defense against confused-deputy: a logged-in user shouldn't be able
  //   to top up an arbitrary org by passing its UUID in the body)
  let organizationId: string | undefined

  if (isInternal) {
    organizationId = body.organizationId
    if (!organizationId) {
      return NextResponse.json(
        { error: 'organizationId required when calling with internal secret' },
        { status: 400 },
      )
    }
  } else {
    // Session path
    const supabaseUser = await createUserClient()
    const {
      data: { user },
      error: userErr,
    } = await supabaseUser.auth.getUser()

    if (userErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single()

    if (!profile?.organization_id) {
      return NextResponse.json(
        { error: 'No organization linked to this user' },
        { status: 403 },
      )
    }

    organizationId = profile.organization_id
  }

  // ── Read wallet + org state ────────────────────────────────
  const { data: wallet, error: walletErr } = await supabase
    .from('org_wallets')
    .select('balance_cents, auto_reload_enabled, auto_reload_threshold_cents, auto_reload_amount_cents, is_blocked, stripe_payment_method_id')
    .eq('organization_id', organizationId)
    .single<OrgWalletRow>()

  if (walletErr || !wallet) {
    return NextResponse.json(
      { error: `Wallet not found for org ${organizationId}` },
      { status: 404 },
    )
  }

  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select('id, tier, stripe_customer_id')
    .eq('id', organizationId)
    .single<OrgRow>()

  if (orgErr || !org) {
    return NextResponse.json(
      { error: `Organization ${organizationId} not found` },
      { status: 404 },
    )
  }

  // ── Skip-reload sanity checks (in priority order) ──────────

  // Solo / unpaid tier — no auto-reload
  if (org.tier === 'solo' || org.tier === 'custom') {
    return NextResponse.json({ skipped: true, reason: 'not_paid_tier', tier: org.tier })
  }

  // No Stripe customer — they never completed checkout
  if (!org.stripe_customer_id) {
    return NextResponse.json({ skipped: true, reason: 'no_stripe_customer' })
  }

  // Auto-reload toggled off (auto_reload trigger only — manual_topup overrides)
  if (triggerSource === 'auto_reload' && !wallet.auto_reload_enabled) {
    return NextResponse.json({ skipped: true, reason: 'auto_reload_disabled' })
  }

  // Balance is above threshold — someone already topped up, or this fired stale
  if (
    triggerSource === 'auto_reload' &&
    wallet.balance_cents >= wallet.auto_reload_threshold_cents
  ) {
    return NextResponse.json({
      skipped: true,
      reason: 'balance_above_threshold',
      balanceCents: wallet.balance_cents,
      thresholdCents: wallet.auto_reload_threshold_cents,
    })
  }

  // ── Idempotency lock ────────────────────────────────────────
  const { data: lockResult, error: lockErr } = await supabase.rpc(
    'try_acquire_reload_lock',
    { p_org_id: organizationId, p_cooldown_seconds: 60 },
  )
  if (lockErr) {
    console.error('[auto-reload] lock RPC error:', lockErr.message)
    return NextResponse.json({ error: lockErr.message }, { status: 500 })
  }
  if (!lockResult) {
    return NextResponse.json({ skipped: true, reason: 'cooldown' })
  }

  // ── Stripe ──────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-03-25.dahlia' as any })

  // Determine which payment method to charge. Prefer the wallet's stored
  // PM (set explicitly via /settings/billing in Phase 5); fall back to
  // the customer's invoice_settings default; fall back to first attached PM.
  let paymentMethodId: string | null = wallet.stripe_payment_method_id
  if (!paymentMethodId) {
    try {
      const customer = await stripe.customers.retrieve(org.stripe_customer_id)
      if (customer && !customer.deleted) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const invoiceSettings = (customer as any).invoice_settings
        paymentMethodId = invoiceSettings?.default_payment_method ?? null
      }
    } catch (err) {
      console.error('[auto-reload] customer retrieve failed:', err)
    }
  }
  if (!paymentMethodId) {
    try {
      const pms = await stripe.paymentMethods.list({
        customer: org.stripe_customer_id,
        type: 'card',
        limit: 1,
      })
      paymentMethodId = pms.data[0]?.id ?? null
    } catch (err) {
      console.error('[auto-reload] list PMs failed:', err)
    }
  }

  if (!paymentMethodId) {
    // No card on file — can't charge. Block wallet.
    await supabase
      .from('org_wallets')
      .update({
        is_blocked: true,
        blocked_reason: 'auto_reload_failed',
        blocked_at: new Date().toISOString(),
        last_auto_reload_attempt_at: new Date().toISOString(),
        last_auto_reload_failure_message: 'No payment method on file',
        updated_at: new Date().toISOString(),
      })
      .eq('organization_id', organizationId)
    return NextResponse.json({ skipped: true, reason: 'no_payment_method' })
  }

  // ── Record pending attempt ────────────────────────────────
  const { data: attemptId, error: attemptErr } = await supabase.rpc(
    'record_reload_attempt',
    {
      p_org_id: organizationId,
      p_trigger_source: triggerSource,
      p_amount_cents: wallet.auto_reload_amount_cents,
    },
  )

  if (attemptErr || !attemptId) {
    console.error('[auto-reload] record_reload_attempt failed:', attemptErr)
    return NextResponse.json(
      { error: attemptErr?.message ?? 'Failed to record attempt' },
      { status: 500 },
    )
  }

  // ── Charge the card via Payment Intent ────────────────────
  // Off-session means "the customer isn't actively in checkout right now,
  // charge their saved card." confirm:true makes the call synchronous.
  // The attempt id is the idempotency key — Stripe dedupes if we somehow
  // re-fire the same intent.
  let paymentIntent: Stripe.PaymentIntent | null = null
  let stripeError: { code?: string; message?: string } | null = null

  try {
    paymentIntent = await stripe.paymentIntents.create(
      {
        amount: wallet.auto_reload_amount_cents,
        currency: 'usd',
        customer: org.stripe_customer_id,
        payment_method: paymentMethodId,
        off_session: true,
        confirm: true,
        description: `Lead Friendly wallet auto-reload`,
        statement_descriptor_suffix: 'WALLET',
        metadata: {
          purpose: 'wallet_reload',
          organization_id: organizationId!,
          attempt_id: attemptId,
          trigger_source: triggerSource,
        },
      },
      { idempotencyKey: `wallet-reload-${attemptId}` },
    )
  } catch (err) {
    if (err instanceof Stripe.errors.StripeCardError) {
      stripeError = { code: err.code, message: err.message }
    } else if (err instanceof Stripe.errors.StripeError) {
      stripeError = { code: err.code, message: err.message }
    } else {
      stripeError = { message: err instanceof Error ? err.message : String(err) }
    }
    console.error('[auto-reload] payment intent error:', stripeError)
  }

  // ── Resolve outcome via complete_reload_attempt ─────────
  // Whether sync charge succeeded, requires_action, or threw, the DB write
  // path is the same RPC. Keeps the audit log canonical.
  const succeeded =
    paymentIntent !== null &&
    paymentIntent.status === 'succeeded'

  // requires_action / requires_payment_method / processing → treat as failure.
  // Customer needs to handle 3DS in browser; wallet stays blocked until they
  // retry via /settings/billing.
  let errorCode = stripeError?.code ?? null
  let errorMessage = stripeError?.message ?? null
  if (paymentIntent && !succeeded) {
    errorCode = errorCode ?? `pi_${paymentIntent.status}`
    errorMessage = errorMessage ?? `Payment Intent status: ${paymentIntent.status}`
  }

  const { data: completeResult, error: completeErr } = await supabase.rpc(
    'complete_reload_attempt',
    {
      p_attempt_id: attemptId,
      p_succeeded: succeeded,
      p_stripe_payment_intent_id: paymentIntent?.id ?? null,
      p_stripe_payment_method_id: paymentMethodId,
      p_stripe_error_code: errorCode,
      p_stripe_error_message: errorMessage,
    },
  )

  if (completeErr) {
    console.error('[auto-reload] complete_reload_attempt failed:', completeErr)
    return NextResponse.json(
      { error: completeErr.message },
      { status: 500 },
    )
  }

  if (succeeded) {
    return NextResponse.json({
      success: true,
      attemptId,
      paymentIntentId: paymentIntent!.id,
      balanceAfterCents: completeResult?.balance_after_cents ?? null,
    })
  }

  return NextResponse.json({
    success: false,
    attemptId,
    error: errorCode,
    errorMessage,
    balanceCents: wallet.balance_cents,
  })
}
