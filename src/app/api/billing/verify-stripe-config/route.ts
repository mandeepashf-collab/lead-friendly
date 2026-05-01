import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { TIER_STARTER, TIER_PRO, TIER_AGENCY, TIER_FOUNDING, toCents } from '@/config/pricing'

/**
 * GET /api/billing/verify-stripe-config
 *
 * One-shot diagnostic: confirms every Stripe Price ID + Coupon ID env var
 * resolves to a real Stripe resource AND matches the amount/interval
 * pricing.ts expects. Surfaces typos in env vars and accidental currency
 * mismatches before they cause customer-facing checkout failures.
 *
 * Auth: x-cron-secret header must match CRON_SECRET (re-uses cron auth pattern).
 *
 * Once Phase 2 verification is complete, DELETE THIS ROUTE.
 *
 * Phase 2 add. To remove:
 *   git rm -r src/app/api/billing/verify-stripe-config
 */
export const runtime = 'nodejs'
export const maxDuration = 30

interface PriceCheck {
  envVar: string
  envValue: string | undefined
  expected: { amountCents: number; interval: 'month' | 'year' }
  actual?: { amountCents: number | null; currency: string | null; interval: string | null; recurring: boolean }
  ok: boolean
  problem?: string
}

interface CouponCheck {
  envVar: string
  envValue: string | undefined
  expected: { amountOffCents: number; duration: string; maxRedemptions: number }
  actual?: { amountOffCents: number | null; currency: string | null; duration: string | null; maxRedemptions: number | null; valid: boolean }
  ok: boolean
  problem?: string
}

export async function GET(req: NextRequest) {
  const cronSecret = req.headers.get('x-cron-secret') ?? req.headers.get('authorization')?.replace(/^Bearer /, '')
  if (!cronSecret || cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'STRIPE_SECRET_KEY missing in env' }, { status: 500 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-03-25.dahlia' as any })

  const priceChecks: PriceCheck[] = [
    { envVar: 'STRIPE_PRICE_STARTER_MONTHLY', envValue: process.env.STRIPE_PRICE_STARTER_MONTHLY,
      expected: { amountCents: toCents(TIER_STARTER.monthlyPrice), interval: 'month' }, ok: false },
    { envVar: 'STRIPE_PRICE_STARTER_ANNUAL', envValue: process.env.STRIPE_PRICE_STARTER_ANNUAL,
      expected: { amountCents: toCents(TIER_STARTER.annualPrice), interval: 'year' }, ok: false },
    { envVar: 'STRIPE_PRICE_PRO_MONTHLY', envValue: process.env.STRIPE_PRICE_PRO_MONTHLY,
      expected: { amountCents: toCents(TIER_PRO.monthlyPrice), interval: 'month' }, ok: false },
    { envVar: 'STRIPE_PRICE_PRO_ANNUAL', envValue: process.env.STRIPE_PRICE_PRO_ANNUAL,
      expected: { amountCents: toCents(TIER_PRO.annualPrice), interval: 'year' }, ok: false },
    { envVar: 'STRIPE_PRICE_AGENCY_MONTHLY', envValue: process.env.STRIPE_PRICE_AGENCY_MONTHLY,
      expected: { amountCents: toCents(TIER_AGENCY.monthlyPrice), interval: 'month' }, ok: false },
    { envVar: 'STRIPE_PRICE_AGENCY_ANNUAL', envValue: process.env.STRIPE_PRICE_AGENCY_ANNUAL,
      expected: { amountCents: toCents(TIER_AGENCY.annualPrice), interval: 'year' }, ok: false },
    { envVar: 'STRIPE_PRICE_FOUNDING_ANNUAL', envValue: process.env.STRIPE_PRICE_FOUNDING_ANNUAL,
      expected: { amountCents: toCents(TIER_FOUNDING.annualPrice), interval: 'year' }, ok: false },
  ]

  for (const check of priceChecks) {
    if (!check.envValue) {
      check.problem = 'env var missing'
      continue
    }
    try {
      const price = await stripe.prices.retrieve(check.envValue)
      check.actual = {
        amountCents: price.unit_amount ?? null,
        currency: price.currency ?? null,
        interval: price.recurring?.interval ?? null,
        recurring: price.type === 'recurring',
      }

      const issues: string[] = []
      if (price.unit_amount !== check.expected.amountCents) {
        issues.push(`amount: expected ${check.expected.amountCents}\u00a2, got ${price.unit_amount}\u00a2`)
      }
      if (price.recurring?.interval !== check.expected.interval) {
        issues.push(`interval: expected ${check.expected.interval}, got ${price.recurring?.interval ?? 'none'}`)
      }
      if (price.currency !== 'usd') {
        issues.push(`currency: expected usd, got ${price.currency}`)
      }
      if (!price.active) {
        issues.push('price is not active in Stripe')
      }

      if (issues.length === 0) {
        check.ok = true
      } else {
        check.problem = issues.join('; ')
      }
    } catch (err) {
      check.problem = `Stripe API error: ${err instanceof Error ? err.message : String(err)}`
    }
  }

  // Coupon check
  const couponCheck: CouponCheck = {
    envVar: 'STRIPE_COUPON_FOUNDING100',
    envValue: process.env.STRIPE_COUPON_FOUNDING100,
    expected: { amountOffCents: 20400, duration: 'forever', maxRedemptions: 100 },
    ok: false,
  }

  if (!couponCheck.envValue) {
    couponCheck.problem = 'env var missing'
  } else {
    try {
      const coupon = await stripe.coupons.retrieve(couponCheck.envValue)
      couponCheck.actual = {
        amountOffCents: coupon.amount_off ?? null,
        currency: coupon.currency ?? null,
        duration: coupon.duration ?? null,
        maxRedemptions: coupon.max_redemptions ?? null,
        valid: coupon.valid,
      }

      const issues: string[] = []
      if (coupon.amount_off !== couponCheck.expected.amountOffCents) {
        issues.push(`amount_off: expected ${couponCheck.expected.amountOffCents}\u00a2, got ${coupon.amount_off}\u00a2`)
      }
      if (coupon.duration !== couponCheck.expected.duration) {
        issues.push(`duration: expected ${couponCheck.expected.duration}, got ${coupon.duration}`)
      }
      if (coupon.max_redemptions !== couponCheck.expected.maxRedemptions) {
        issues.push(`max_redemptions: expected ${couponCheck.expected.maxRedemptions}, got ${coupon.max_redemptions}`)
      }
      if (coupon.currency !== 'usd') {
        issues.push(`currency: expected usd, got ${coupon.currency}`)
      }
      if (!coupon.valid) {
        issues.push('coupon is not valid (expired or fully redeemed)')
      }

      if (issues.length === 0) {
        couponCheck.ok = true
      } else {
        couponCheck.problem = issues.join('; ')
      }
    } catch (err) {
      couponCheck.problem = `Stripe API error: ${err instanceof Error ? err.message : String(err)}`
    }
  }

  const allOk = priceChecks.every((c) => c.ok) && couponCheck.ok
  const summary = {
    allOk,
    priceCheckCount: priceChecks.length,
    pricesPassed: priceChecks.filter((c) => c.ok).length,
    couponPassed: couponCheck.ok,
    stripeMode: process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_') ? 'test' : 'live',
    runAt: new Date().toISOString(),
  }

  return NextResponse.json(
    { summary, prices: priceChecks, coupon: couponCheck },
    { status: allOk ? 200 : 422 },
  )
}
