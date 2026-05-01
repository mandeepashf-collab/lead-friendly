import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getTierById } from '@/config/pricing'

/**
 * GET /api/ai-minutes
 *
 * Returns the current org's billing snapshot for dashboard/header widgets.
 * Source of truth: organizations.current_period_minutes_used (counter
 * incremented atomically by record_call_usage on every call-end webhook),
 * and src/config/pricing.ts for the bundle limit per tier.
 *
 * Response:
 *   {
 *     used: number,                    // minutes used in current period
 *     limit: number,                   // bundle limit for the tier
 *     overageMinutes: number,          // how many minutes over bundle (0 if within)
 *     tier: string,                    // 'starter' | 'pro' | ...
 *     billingInterval: string | null,  // 'monthly' | 'annual' | null (free/trial)
 *     periodEndsAt: string | null,     // ISO date when bundle resets
 *     wallet: {
 *       balanceCents: number,
 *       isBlocked: boolean,
 *       blockedReason: string | null,
 *       autoReloadEnabled: boolean,
 *       autoReloadThresholdCents: number,
 *       autoReloadAmountCents: number,
 *     } | null
 *   }
 */
export async function GET() {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
    )

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single()

    if (!profile?.organization_id) {
      return NextResponse.json({ error: 'No organization' }, { status: 404 })
    }

    const [orgRes, walletRes] = await Promise.all([
      supabase
        .from('organizations')
        .select(
          'tier, billing_interval, current_period_minutes_used, current_period_ends_at',
        )
        .eq('id', profile.organization_id)
        .maybeSingle(),
      supabase
        .from('org_wallets')
        .select(
          'balance_cents, is_blocked, blocked_reason, auto_reload_enabled, auto_reload_threshold_cents, auto_reload_amount_cents',
        )
        .eq('organization_id', profile.organization_id)
        .maybeSingle(),
    ])

    if (orgRes.error || !orgRes.data) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    const org = orgRes.data
    const tier = getTierById(org.tier as 'solo' | 'starter' | 'pro' | 'agency' | 'custom' | 'founding')
    const limit = tier?.includedMinutes ?? 0
    const used = org.current_period_minutes_used ?? 0
    const overageMinutes = Math.max(0, used - limit)

    const wallet = walletRes.data
      ? {
          balanceCents: walletRes.data.balance_cents ?? 0,
          isBlocked: Boolean(walletRes.data.is_blocked),
          blockedReason: walletRes.data.blocked_reason ?? null,
          autoReloadEnabled: Boolean(walletRes.data.auto_reload_enabled),
          autoReloadThresholdCents: walletRes.data.auto_reload_threshold_cents ?? 0,
          autoReloadAmountCents: walletRes.data.auto_reload_amount_cents ?? 0,
        }
      : null

    return NextResponse.json({
      used,
      limit,
      overageMinutes,
      tier: org.tier,
      billingInterval: org.billing_interval,
      periodEndsAt: org.current_period_ends_at,
      wallet,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[ai-minutes] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
