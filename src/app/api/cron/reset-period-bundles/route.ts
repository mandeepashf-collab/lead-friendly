import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

/**
 * GET /api/cron/reset-period-bundles
 *
 * Daily safety-net cron. The PRIMARY path for period rollover is
 * /api/stripe/webhook calling reset_minute_period() on every
 * customer.subscription.updated event. This cron exists in case Stripe
 * webhooks were missed (delivery failure, signature reject, server downtime).
 *
 * Logic:
 *   1. Find paid orgs whose current_period_ends_at < now()
 *   2. For each, fetch the active Stripe subscription
 *   3. If sub is active/trialing AND period has rotated, call reset_minute_period
 *   4. If sub is canceled/incomplete, skip (don't reset orgs that lost billing)
 *
 * Returns: { rolled, skipped, errors }
 *
 * Auth: x-cron-secret header must match CRON_SECRET env var. This is the
 * Vercel cron convention. Vercel auto-injects the header on scheduled runs.
 *
 * Configured in vercel.json with schedule "0 6 * * *" (06:00 UTC daily).
 *
 * Runtime: nodejs (we use the Stripe SDK).
 */
export const runtime = 'nodejs'
export const maxDuration = 60  // Vercel default is 10s, bump for Stripe API calls

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

const PAID_TIERS = ['starter', 'pro', 'agency', 'founding'] as const
const ROLLABLE_STATUSES = new Set(['active', 'trialing', 'past_due'])  // past_due still has access during grace
const MAX_ORGS_PER_RUN = 200  // hard cap; if you have more, you've already won

interface SubscriptionLike {
  id: string
  status: string
  items: { data: Array<{ current_period_start?: number; current_period_end?: number }> }
}

function subPeriodStart(sub: SubscriptionLike): string | null {
  const items = sub?.items?.data ?? []
  const starts = items
    .map((it) => it.current_period_start)
    .filter((v): v is number => typeof v === 'number')
  if (starts.length === 0) return null
  return new Date(Math.min(...starts) * 1000).toISOString()
}

function subPeriodEnd(sub: SubscriptionLike): string | null {
  const items = sub?.items?.data ?? []
  const ends = items
    .map((it) => it.current_period_end)
    .filter((v): v is number => typeof v === 'number')
  if (ends.length === 0) return null
  return new Date(Math.min(...ends) * 1000).toISOString()
}

export async function GET(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────
  const cronSecret = req.headers.get('x-cron-secret') ?? req.headers.get('authorization')
  const expectedAuth = `Bearer ${process.env.CRON_SECRET ?? ''}`
  const expectedHeader = process.env.CRON_SECRET ?? ''
  if (!cronSecret || (cronSecret !== expectedAuth && cronSecret !== expectedHeader)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-03-25.dahlia' as any })

  // ── Find candidate orgs ───────────────────────────────────
  const { data: orgs, error: lookupErr } = await supabaseAdmin
    .from('organizations')
    .select('id, name, stripe_subscription_id, current_period_ends_at, tier, subscription_status')
    .in('tier', [...PAID_TIERS])
    .lt('current_period_ends_at', new Date().toISOString())
    .not('stripe_subscription_id', 'is', null)
    .limit(MAX_ORGS_PER_RUN)

  if (lookupErr) {
    console.error('[cron/reset-period-bundles] org lookup failed:', lookupErr.message)
    return NextResponse.json({ error: lookupErr.message }, { status: 500 })
  }

  const candidates = orgs ?? []
  let rolled = 0
  let skipped = 0
  let errors = 0
  const skippedReasons: Record<string, number> = {}

  for (const org of candidates) {
    try {
      // Fetch the subscription from Stripe
      const sub = (await stripe.subscriptions.retrieve(
        org.stripe_subscription_id as string,
      )) as unknown as SubscriptionLike

      if (!ROLLABLE_STATUSES.has(sub.status)) {
        skipped++
        skippedReasons[`status_${sub.status}`] = (skippedReasons[`status_${sub.status}`] ?? 0) + 1
        continue
      }

      const periodStart = subPeriodStart(sub)
      const periodEnd = subPeriodEnd(sub)
      if (!periodStart || !periodEnd) {
        skipped++
        skippedReasons.no_period_data = (skippedReasons.no_period_data ?? 0) + 1
        continue
      }

      // Call the RPC. It's idempotent: if period_end <= what we have, no-op.
      const { data, error } = await supabaseAdmin.rpc('reset_minute_period', {
        p_org_id: org.id,
        p_new_period_starts_at: periodStart,
        p_new_period_ends_at: periodEnd,
        p_source: 'cron_safety',
        p_stripe_subscription_id: sub.id,
      })

      if (error) {
        console.error(`[cron/reset-period-bundles] RPC error org=${org.id}:`, error.message)
        errors++
        continue
      }

      const result = (data ?? {}) as { reset?: boolean; reason?: string }
      if (result.reset) {
        rolled++
        console.log(
          `[cron/reset-period-bundles] rolled org=${org.id} sub=${sub.id} period_end=${periodEnd}`,
        )
      } else {
        skipped++
        skippedReasons[result.reason ?? 'rpc_no_op'] =
          (skippedReasons[result.reason ?? 'rpc_no_op'] ?? 0) + 1
      }
    } catch (err) {
      console.error(`[cron/reset-period-bundles] error org=${org.id}:`, err)
      errors++
    }
  }

  console.log(
    `[cron/reset-period-bundles] complete: candidates=${candidates.length} rolled=${rolled} skipped=${skipped} errors=${errors}`,
  )

  return NextResponse.json({
    candidates: candidates.length,
    rolled,
    skipped,
    errors,
    skippedReasons,
    runAt: new Date().toISOString(),
  })
}
