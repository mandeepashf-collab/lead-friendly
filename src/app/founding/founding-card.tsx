'use client'

import { Check, Lock } from 'lucide-react'
import type { PricingTier } from '@/config/pricing'
import { SubscribeButton } from '../pricing/subscribe-button'

interface Props {
  tier: PricingTier
  /** Compact mode for use in the bottom CTA section */
  compact?: boolean
}

/**
 * Founding pricing card. Reuses the same SubscribeButton as /pricing
 * so checkout flow is identical (priceId-validated, OAuth-aware,
 * graceful fallback to /register if signed-out).
 *
 * Annual-only — there's no monthly option for Founding tier.
 *
 * Compact mode: smaller layout for the bottom CTA section, no feature
 * list, just price + button.
 */
export function FoundingCard({ tier, compact = false }: Props) {
  const priceId = tier.stripePriceIdAnnual ?? null

  if (compact) {
    return (
      <div className="max-w-sm mx-auto">
        <div className="text-center mb-4">
          <p className="text-4xl font-bold text-white">${tier.annualPrice}</p>
          <p className="text-sm text-amber-300 mt-1">/year · locked for life</p>
        </div>
        <SubscribeButton
          tierId={tier.id}
          priceId={priceId}
          interval="annual"
          isFeatured={true}
          buttonLabel="Claim founding spot"
        />
      </div>
    )
  }

  return (
    <div className="rounded-2xl border-2 border-amber-500 bg-gradient-to-br from-amber-500/10 via-zinc-900/80 to-zinc-900/80 p-8 relative">
      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
        <span className="rounded-full bg-amber-500 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-950 inline-flex items-center gap-1.5">
          <Lock className="h-3 w-3" />
          Founding 100
        </span>
      </div>

      <div className="text-center mb-6 mt-2">
        <h2 className="text-2xl font-bold text-white">{tier.name}</h2>
        <p className="text-sm text-zinc-400 mt-1">{tier.tagline}</p>
      </div>

      {/* Price */}
      <div className="text-center mb-6">
        <div className="flex items-baseline justify-center gap-2">
          <span className="text-5xl font-bold text-white">${tier.annualPrice}</span>
          <span className="text-lg text-zinc-400">/year</span>
        </div>
        <p className="text-sm text-amber-300 mt-2">
          ${tier.monthlyEquivalent}/mo equivalent · ${tier.effectiveRatePerMinute.toFixed(3)}/min effective
        </p>
        <p className="text-xs text-zinc-500 mt-1.5">
          One annual payment. Locked at this price forever.
        </p>
      </div>

      {/* CTA */}
      <div className="max-w-sm mx-auto mb-6">
        <SubscribeButton
          tierId={tier.id}
          priceId={priceId}
          interval="annual"
          isFeatured={true}
          buttonLabel="Claim founding spot"
        />
      </div>

      {/* Features */}
      <ul className="space-y-2.5 border-t border-zinc-800/60 pt-5 max-w-md mx-auto">
        {[
          `${tier.includedMinutes.toLocaleString()} AI call minutes/month`,
          `$${tier.overageRate.toFixed(2)}/min overage from prepaid wallet`,
          'Full CRM included free (contacts, pipeline, calendar)',
          'Always-on call recordings + transcripts + AI summaries',
          'Priority support + direct line to the founder',
          'Numbered Founding membership badge',
          'Lifetime price lock (never increases)',
        ].map((feat) => (
          <li key={feat} className="flex items-start gap-2 text-sm text-zinc-300">
            <Check className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <span>{feat}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
