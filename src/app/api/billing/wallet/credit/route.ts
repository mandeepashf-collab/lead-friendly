import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient as createUserClient } from '@/lib/supabase/server'
import { WALLET_DEFAULTS } from '@/config/pricing'

/**
 * POST /api/billing/wallet/credit
 *
 * Manual top-up endpoint. Used by:
 *   - Future Manual Top-Up button on /settings/billing (Phase 5)
 *   - Stripe Checkout success webhook for one-off top-ups (Phase 4)
 *
 * Body: { amountCents: number }
 *
 * Auth: requires the user to be a member of the organization. Future
 * versions may restrict to admins only.
 *
 * NOTE: This endpoint does NOT charge a card. It assumes the credit was
 * already collected (e.g., via a Stripe Payment Intent in a separate step).
 * For Phase 1.5 we just expose the wallet credit operation; the Stripe
 * integration that funds it will land in Phase 4.5.
 */

const supabaseService = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

export async function POST(req: NextRequest) {
  try {
    // ── Auth ─────────────────────────────────────────────────
    const supabaseUser = await createUserClient()
    const {
      data: { user },
      error: userErr,
    } = await supabaseUser.auth.getUser()
    if (userErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Resolve user's organization
    const { data: profile } = await supabaseService
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single()

    if (!profile?.organization_id) {
      return NextResponse.json({ error: 'No organization' }, { status: 403 })
    }

    // ── Body ─────────────────────────────────────────────────
    const body = (await req.json()) as { amountCents?: number; description?: string }
    const amountCents = Number(body.amountCents)

    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      return NextResponse.json(
        { error: 'amountCents must be a positive integer' },
        { status: 400 },
      )
    }
    if (amountCents < WALLET_DEFAULTS.minTopUpCents) {
      return NextResponse.json(
        {
          error: `Minimum top-up is ${WALLET_DEFAULTS.minTopUpCents} cents ($${(WALLET_DEFAULTS.minTopUpCents / 100).toFixed(2)})`,
        },
        { status: 400 },
      )
    }
    if (amountCents > WALLET_DEFAULTS.maxTopUpCents) {
      return NextResponse.json(
        {
          error: `Maximum single top-up is ${WALLET_DEFAULTS.maxTopUpCents} cents ($${(WALLET_DEFAULTS.maxTopUpCents / 100).toFixed(2)})`,
        },
        { status: 400 },
      )
    }

    // ── Credit the wallet ────────────────────────────────────
    const { data, error } = await supabaseService.rpc('credit_wallet', {
      p_org_id: profile.organization_id,
      p_amount_cents: amountCents,
      p_type: 'manual_credit',
      p_description: body.description ?? `Manual top-up: $${(amountCents / 100).toFixed(2)}`,
      p_stripe_charge_id: null,
      p_stripe_pi_id: null,
    })

    if (error) {
      console.error('[wallet/credit] credit_wallet error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const result = (data ?? {}) as { balance_before_cents?: number; balance_after_cents?: number }

    return NextResponse.json({
      success: true,
      balanceBeforeCents: result.balance_before_cents ?? null,
      balanceAfterCents: result.balance_after_cents ?? null,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[wallet/credit] unhandled error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
