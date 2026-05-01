/**
 * Lead Friendly Pricing Configuration
 *
 * Single source of truth for all pricing logic across the app.
 * Update prices here, and they propagate to: pricing page, checkout,
 * billing dashboard, usage tracking, overage calculation.
 *
 * STORAGE CONVENTION:
 *   - Money in this CONFIG file is expressed in dollars (human-readable).
 *   - Money in the DATABASE and Stripe API is in INTEGER CENTS.
 *   - Use `toCents()` / `fromCents()` helpers below at every boundary.
 *
 * Last updated: 2026-04-30
 * Locked pricing decisions captured in: docs/pricing-decisions.md
 */

export type TierId = 'solo' | 'starter' | 'pro' | 'agency' | 'custom' | 'founding'
export type BillingInterval = 'monthly' | 'annual'

export interface PricingTier {
  id: TierId
  name: string
  tagline: string

  // Pricing (DOLLARS — convert to cents at Stripe/DB boundary)
  monthlyPrice: number
  annualPrice: number
  monthlyEquivalent: number
  annualSavings: number

  // Bundle
  includedMinutes: number
  overageRate: number              // $/min, e.g. 0.14

  // Capacity
  seatsIncluded: number
  phoneNumbersIncluded: number     // -1 = unlimited
  activeAgentsIncluded: number     // -1 = unlimited
  subAccountsIncluded: number      // 0 = not available, -1 = unlimited

  // Differentiators
  whiteLabel: boolean
  prioritySupport: boolean
  dedicatedCSM: boolean

  // Stripe
  stripePriceIdMonthly?: string
  stripePriceIdAnnual?: string

  // Display
  isFeatured: boolean
  isVisible: boolean
  ctaLabel: string
  ctaAction: 'trial' | 'checkout' | 'contact'
}

// =============================================================
// TIERS
// =============================================================

export const TIER_SOLO: PricingTier = {
  id: 'solo',
  name: 'Solo',
  tagline: '7-day free trial · 30 free minutes',
  monthlyPrice: 0,
  annualPrice: 0,
  monthlyEquivalent: 0,
  annualSavings: 0,
  includedMinutes: 30,
  overageRate: 0,
  seatsIncluded: 1,
  phoneNumbersIncluded: 1,
  activeAgentsIncluded: 1,
  subAccountsIncluded: 0,
  whiteLabel: false,
  prioritySupport: false,
  dedicatedCSM: false,
  isFeatured: false,
  isVisible: true,
  ctaLabel: 'Start free trial',
  ctaAction: 'trial',
}

export const TIER_STARTER: PricingTier = {
  id: 'starter',
  name: 'Starter',
  tagline: 'For solo founders and one-person businesses',
  monthlyPrice: 49,
  annualPrice: 444,
  monthlyEquivalent: 37,
  annualSavings: 12,
  includedMinutes: 350,
  overageRate: 0.16,
  seatsIncluded: 1,
  phoneNumbersIncluded: 2,
  activeAgentsIncluded: 3,
  subAccountsIncluded: 0,
  whiteLabel: false,
  prioritySupport: false,
  dedicatedCSM: false,
  stripePriceIdMonthly: process.env.STRIPE_PRICE_STARTER_MONTHLY,
  stripePriceIdAnnual: process.env.STRIPE_PRICE_STARTER_ANNUAL,
  isFeatured: false,
  isVisible: true,
  ctaLabel: 'Start free trial',
  ctaAction: 'trial',
}

export const TIER_PRO: PricingTier = {
  id: 'pro',
  name: 'Pro',
  tagline: 'For small sales teams who need real volume',
  monthlyPrice: 99,
  annualPrice: 888,
  monthlyEquivalent: 74,
  annualSavings: 25,
  includedMinutes: 750,
  overageRate: 0.14,
  seatsIncluded: 5,
  phoneNumbersIncluded: 10,
  activeAgentsIncluded: -1,
  subAccountsIncluded: 0,
  whiteLabel: false,
  prioritySupport: true,
  dedicatedCSM: false,
  stripePriceIdMonthly: process.env.STRIPE_PRICE_PRO_MONTHLY,
  stripePriceIdAnnual: process.env.STRIPE_PRICE_PRO_ANNUAL,
  isFeatured: true,
  isVisible: true,
  ctaLabel: 'Start free trial',
  ctaAction: 'trial',
}

export const TIER_AGENCY: PricingTier = {
  id: 'agency',
  name: 'Agency',
  tagline: 'White-label for agencies and resellers',
  monthlyPrice: 159,
  annualPrice: 1440,
  monthlyEquivalent: 120,
  annualSavings: 39,
  includedMinutes: 1250,
  overageRate: 0.12,
  seatsIncluded: 25,
  phoneNumbersIncluded: -1,
  activeAgentsIncluded: -1,
  subAccountsIncluded: 25,
  whiteLabel: true,
  prioritySupport: true,
  dedicatedCSM: false,
  stripePriceIdMonthly: process.env.STRIPE_PRICE_AGENCY_MONTHLY,
  stripePriceIdAnnual: process.env.STRIPE_PRICE_AGENCY_ANNUAL,
  isFeatured: false,
  isVisible: true,
  ctaLabel: 'Start free trial',
  ctaAction: 'trial',
}

export const TIER_FOUNDING: PricingTier = {
  id: 'founding',
  name: 'Founding 100',
  tagline: 'Limited to first 100 customers — locked at this price for life',
  monthlyPrice: 69,
  annualPrice: 684,
  monthlyEquivalent: 57,
  annualSavings: 17,
  includedMinutes: 750,
  overageRate: 0.14,
  seatsIncluded: 5,
  phoneNumbersIncluded: 10,
  activeAgentsIncluded: -1,
  subAccountsIncluded: 0,
  whiteLabel: false,
  prioritySupport: true,
  dedicatedCSM: false,
  stripePriceIdAnnual: process.env.STRIPE_PRICE_FOUNDING_ANNUAL,
  isFeatured: false,
  isVisible: false,
  ctaLabel: 'Claim Founding spot',
  ctaAction: 'checkout',
}

export const TIER_CUSTOM: PricingTier = {
  id: 'custom',
  name: 'Custom',
  tagline: 'Volume pricing from $0.07/min for high-volume teams',
  monthlyPrice: 0,
  annualPrice: 0,
  monthlyEquivalent: 0,
  annualSavings: 0,
  includedMinutes: 0,
  overageRate: 0,
  seatsIncluded: -1,
  phoneNumbersIncluded: -1,
  activeAgentsIncluded: -1,
  subAccountsIncluded: -1,
  whiteLabel: true,
  prioritySupport: true,
  dedicatedCSM: true,
  isFeatured: false,
  isVisible: true,
  ctaLabel: 'Book a call \u2192',
  ctaAction: 'contact',
}

// =============================================================
// CUSTOM TIER NEGOTIATION FLOOR (internal use only)
// =============================================================

export const CUSTOM_PRICING_RULES = {
  perMinuteFloor: 0.07,
  contractValueFloor: 5000,
  volumeRateLadder: [
    { minMinutesPerYear: 30000, maxMinutesPerYear: 60000, rate: 0.10 },
    { minMinutesPerYear: 60000, maxMinutesPerYear: 150000, rate: 0.09 },
    { minMinutesPerYear: 150000, maxMinutesPerYear: 300000, rate: 0.08 },
    { minMinutesPerYear: 300000, maxMinutesPerYear: 600000, rate: 0.075 },
    { minMinutesPerYear: 600000, maxMinutesPerYear: Infinity, rate: 0.07 },
  ],
  addOns: {
    basePlatformFee: 4800,
    extraSubAccounts25: 2400,
    mobileWhiteLabel: 6000,
    hipaaCompliance: 3600,
    multiRegion: 6000,
    dedicatedCSM: 2400,
  },
  setupFees: {
    customDomain: 500,
    brandingKit: 1000,
    migration: { min: 1500, max: 5000 },
    promptEngineering: 2500,
    customIntegration: { min: 5000, max: 15000 },
    mobileWLSetup: 5000,
  },
  multiYearDiscount: {
    twoYear: 0.10,
    threeYear: 0.15,
  },
}

// =============================================================
// WALLET DEFAULTS (mirror of org_wallets defaults in DB)
// =============================================================

export const WALLET_DEFAULTS = {
  autoReloadEnabled: true,
  autoReloadThresholdCents: 1000,    // $10
  autoReloadAmountCents: 5000,       // $50
  minTopUpCents: 500,                // $5 minimum manual top-up
  maxTopUpCents: 50000,              // $500 maximum single top-up
  thresholdRangeCents: { min: 500, max: 5000 },        // $5-$50
  reloadRangeCents: { min: 1000, max: 20000 },         // $10-$200
}

// =============================================================
// EXPORTED COLLECTIONS
// =============================================================

export const ALL_TIERS: PricingTier[] = [
  TIER_SOLO,
  TIER_STARTER,
  TIER_PRO,
  TIER_AGENCY,
  TIER_CUSTOM,
]

export const PUBLIC_TIERS: PricingTier[] = ALL_TIERS.filter(t => t.isVisible)

export const PAID_TIERS: PricingTier[] = [
  TIER_STARTER,
  TIER_PRO,
  TIER_AGENCY,
  TIER_FOUNDING,
]

export const SELF_SERVE_TIERS: PricingTier[] = [
  TIER_STARTER,
  TIER_PRO,
  TIER_AGENCY,
]

// =============================================================
// MONEY HELPERS - use these at every Stripe/DB boundary
// =============================================================

/** Convert dollars (any precision) to integer cents. Rounds half-up. */
export function toCents(dollars: number): number {
  return Math.round(dollars * 100)
}

/** Convert integer cents to dollars (number). For DISPLAY only - no math. */
export function fromCents(cents: number): number {
  return cents / 100
}

/** Format integer cents as "$X.XX" string. */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  const dollars = Math.floor(abs / 100)
  const remainder = abs % 100
  return `${sign}$${dollars.toLocaleString()}.${remainder.toString().padStart(2, '0')}`
}

/** Compute overage cost in cents from minutes x per-minute rate (in dollars). */
export function overageCostCents(overageMinutes: number, ratePerMinute: number): number {
  if (overageMinutes <= 0) return 0
  return Math.ceil(overageMinutes * ratePerMinute * 100)  // round UP - favor the house on fractional cents
}

// =============================================================
// HELPER FUNCTIONS
// =============================================================

export function getTierById(id: TierId): PricingTier | undefined {
  if (id === 'founding') return TIER_FOUNDING
  return ALL_TIERS.find(t => t.id === id)
}

export function getTierByStripePriceId(
  stripePriceId: string,
): { tier: PricingTier; interval: BillingInterval } | undefined {
  for (const tier of [...ALL_TIERS, TIER_FOUNDING]) {
    if (tier.stripePriceIdMonthly === stripePriceId) {
      return { tier, interval: 'monthly' }
    }
    if (tier.stripePriceIdAnnual === stripePriceId) {
      return { tier, interval: 'annual' }
    }
  }
  return undefined
}

/**
 * Calculates the customer's bill given tier and minutes used in current period.
 * Returns all values in CENTS.
 */
export function calculateMonthlyBillCents(
  tier: PricingTier,
  minutesUsed: number,
  interval: BillingInterval = 'monthly',
): {
  baseCostCents: number
  overageMinutes: number
  overageCostCents: number
  totalCostCents: number
} {
  const baseCostCents =
    interval === 'annual' ? toCents(tier.monthlyEquivalent) : toCents(tier.monthlyPrice)
  const overageMinutes = Math.max(0, minutesUsed - tier.includedMinutes)
  const ovCostCents = overageCostCents(overageMinutes, tier.overageRate)
  return {
    baseCostCents,
    overageMinutes,
    overageCostCents: ovCostCents,
    totalCostCents: baseCostCents + ovCostCents,
  }
}

/**
 * Determines if customer should be prompted to upgrade based on usage.
 * Returns the recommended tier if upgrade would save money on average usage.
 */
export function recommendUpgrade(
  currentTier: PricingTier,
  averageMinutesPerMonth: number,
): PricingTier | null {
  const tierOrder: TierId[] = ['starter', 'pro', 'agency']
  const currentIndex = tierOrder.indexOf(currentTier.id)
  if (currentIndex === -1 || currentIndex === tierOrder.length - 1) return null

  const currentCost = calculateMonthlyBillCents(currentTier, averageMinutesPerMonth).totalCostCents
  const nextTier = getTierById(tierOrder[currentIndex + 1])
  if (!nextTier) return null
  const nextCost = calculateMonthlyBillCents(nextTier, averageMinutesPerMonth).totalCostCents

  return nextCost < currentCost ? nextTier : null
}

/**
 * Determines if a Custom prospect should be redirected to Agency self-serve.
 */
export function shouldRedirectCustomToAgency(answers: {
  monthlyMinutes: '5000-25000' | '25000-100000' | '100000+' | 'not-sure'
  subAccounts: '1-10' | '10-50' | '50+' | 'single-business'
  importance: string[]
}): boolean {
  if (answers.subAccounts === 'single-business' && answers.monthlyMinutes === 'not-sure') {
    return true
  }
  if (
    answers.subAccounts === 'single-business' &&
    answers.monthlyMinutes === '5000-25000' &&
    !answers.importance.includes('hipaa-compliance') &&
    !answers.importance.includes('custom-integrations')
  ) {
    return true
  }
  return false
}

// =============================================================
// FEATURE LIST (everyone gets every feature - no gating)
// =============================================================

export const ALL_FEATURES_INCLUDED = [
  'AI agents (unlimited templates)',
  'Browser softphone',
  'Pipeline (Kanban, Table, Timeline)',
  'AI deal drawer with summaries',
  'Workflows (appointment_set, deal_won, custom)',
  'TCPA compliance with audit log',
  'Cal.com calendar integration',
  'Always-on call recording',
  'Automatic transcription',
  'Per-call AI summaries',
  'Tag-targeted outbound campaigns',
  'Knowledge base per agent',
  'Custom voice settings',
  'CSV import',
  'Smart callback routing',
  'Eval system (per-agent)',
] as const

// =============================================================
// PRICING PAGE COPY
// =============================================================

export const PRICING_PAGE_COPY = {
  hero: {
    title: 'Pay for what fits.',
    subtitle: 'Real prices. No platform fees. Cancel anytime.',
  },
  toggleLabels: {
    monthly: 'Monthly',
    annual: 'Annual \u2014 Save 25% \u2713',
  },
  walletExplainer:
    'Your plan includes a monthly minute bundle. Once you exceed it, calls draw from your prepaid wallet at the overage rate. Wallet auto-tops-up from your card on file when balance hits $10 (default $50 top-up). You can disable auto-reload anytime.',
  transparencyLine:
    'Real cost to deliver: ~$0.06/min. We charge $0.13\u2013$0.16/min effective \u2014 that 50\u201360% margin keeps us profitable without taking VC money. Minutes reset on the 1st each month. No rollover. Cancel anytime.',
  faq: [
    {
      q: 'Do unused minutes roll over?',
      a: 'No \u2014 your minute bundle resets on the 1st of each month. This keeps pricing predictable for both of us.',
    },
    {
      q: 'What happens if I exceed my bundle?',
      a: 'Overage minutes draw from your prepaid wallet at your tier\u2019s per-minute rate ($0.16 Starter, $0.14 Pro, $0.12 Agency). Wallet auto-tops-up from your card when balance gets low \u2014 default $10 trigger, $50 reload. You can adjust both in settings.',
    },
    {
      q: 'What if my wallet runs out?',
      a: 'If your wallet hits $0 and auto-reload fails (or is disabled), all outbound calls are blocked until you top up manually or auto-reload succeeds. We never charge you more than what\u2019s in your wallet.',
    },
    {
      q: 'Can I cancel anytime?',
      a: 'Yes. Monthly subscriptions cancel at the end of the current period. Annual subscriptions are non-refundable after 30 days but won\u2019t auto-renew if cancelled.',
    },
    {
      q: 'Do you offer a free trial?',
      a: 'Yes. Every new account gets 30 free minutes to test all features before paying. No credit card required.',
    },
    {
      q: 'Do all plans get all features?',
      a: 'Yes. Starter, Pro, and Agency all get the full product. Tiers differ only on minute volume, user seats, and white-label availability.',
    },
    {
      q: 'What\u2019s in the Custom tier?',
      a: 'Custom tier is for high-volume agencies (5,000+ min/mo), HIPAA / SOC 2 compliance needs, mobile app white-label, or custom integrations. Pricing starts at $0.07/min with custom platform fees.',
    },
  ],
}
