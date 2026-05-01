import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getTierById } from '@/config/pricing'

/**
 * GET /api/ai-minutes
 *
 * Returns the current org's billing snapshot for dashboard/header widgets.
 *
 * Phase 8 update: Resolves to the billing org (parent agency for sub-accounts)
 * before reading the snapshot. So a sub-account user sees the agency's bundle
 * + wallet, not their own (always-zero) counter. Custom pricing on the billing
 * org overrides tier defaults.
 *
 * Source of truth: organizations.current_period_minutes_used on the billing org
 * (counter incremented atomically by record_call_usage on every call-end
 * webhook, which routes to billing org), and src/config/pricing.ts for the
 * bundle limit per tier.
 *
 * Response:
 *   {
 *     used: number,                    // minutes used in current period (billing org)
 *     limit: number,                   // bundle limit (custom override OR tier default)
 *     overageMinutes: number,          // how many minutes over bundle (0 if within)
 *     overageRatePerMinute: number,    // dollars per minute for overage
 *     tier: string,                    // 'starter' | 'pro' | ...
 *     billingInterval: string | null,  // 'monthly' | 'annual' | null (free/trial)
 *     periodEndsAt: string | null,     // ISO date when bundle resets
 *     isSubAccount: boolean,           // Phase 8: true if viewing org is a sub-account
 *     billingOrgName: string | null,   // parent agency's name when sub-account
 *     customPricingApplied: boolean,   // Phase 8: true if custom override is active
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

    // Phase 8: resolve to billing org. Sub-accounts inherit the agency's snapshot.
    const { data: ownOrg } = await supabase
      .from('organizations')
      .select('parent_organization_id')
      .eq('id', profile.organization_id)
      .maybeSingle()

    const billingOrgId =
      (ownOrg?.parent_organization_id as string | null) ?? profile.organization_id
    const isSubAccount = billingOrgId !== profile.organization_id

    const [orgRes, walletRes, parentOrgRes] = await Promise.all([
      supabase
        .from('organizations')
        .select(
          'tier, billing_interval, current_period_minutes_used, current_period_ends_at, custom_included_minutes, custom_overage_rate_x10000',
        )
        .eq('id', billingOrgId)
        .maybeSingle(),
      supabase
        .from('org_wallets')
        .select(
          'balance_cents, is_blocked, blocked_reason, auto_reload_enabled, auto_reload_threshold_cents, auto_reload_amount_cents',
        )
        .eq('organization_id', billingOrgId)
        .maybeSingle(),
      // Only fetch parent name when we're a sub-account, for UI messaging
      isSubAccount
        ? supabase
            .from('organizations')
            .select('name')
            .eq('id', billingOrgId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ])

    if (orgRes.error || !orgRes.data) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    const org = orgRes.data
    const tier = getTierById(
      org.tier as 'solo' | 'starter' | 'pro' | 'agency' | 'custom' | 'founding',
    )

    // Phase 8: apply custom pricing overrides if set
    const customIncluded = org.custom_included_minutes as number | null
    const customRateX10000 = org.custom_overage_rate_x10000 as number | null
    const limit = customIncluded ?? tier?.includedMinutes ?? 0
    const overageRatePerMinute =
      customRateX10000 != null ? customRateX10000 / 10000 : tier?.overageRate ?? 0
    const customPricingApplied = customIncluded != null || customRateX10000 != null

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
      overageRatePerMinute,
      tier: org.tier,
      billingInterval: org.billing_interval,
      periodEndsAt: org.current_period_ends_at,
      isSubAccount,
      billingOrgName:
        (parentOrgRes && 'data' in parentOrgRes && parentOrgRes.data
          ? (parentOrgRes.data as { name: string | null }).name
          : null) ?? null,
      customPricingApplied,
      wallet,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[ai-minutes] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
