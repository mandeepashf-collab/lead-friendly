'use client'

import { Check } from 'lucide-react'
import type { PricingTier } from '@/config/pricing'
import { SubscribeButton } from './subscribe-button'

interface Props {
  tier: PricingTier
}

/**
 * Single pricing card. Shows monthly + annual prices side-by-side
 * (no toggle), with two CTAs per paid card mapping directly to a
 * Stripe Price ID. Solo card has a single "Start free trial" CTA.
 *
 * Reads everything from pricing.ts — single source of truth.
 */
export function PricingCard({ tier }: Props) {
  const isSolo = tier.id === 'solo'
  const isFeatured = tier.isFeatured

  const cardClass = isFeatured
    ? 'relative rounded-2xl border-2 border-indigo-500 bg-indigo-500/5 p-6 flex flex-col'
    : 'relative rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 flex flex-col'

  return (
    <div className={cardClass}>
      {isFeatured && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="rounded-full bg-indigo-600 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-white">
            Most Popular
          </span>
        </div>
      )}

      {/* Header */}
      <div className="mb-2">
        <h2 className="text-lg font-semibold text-white">{tier.name}</h2>
        <p className="text-xs text-zinc-500 mt-0.5">{tier.tagline}</p>
      </div>

      {/* Pricing block */}
      {isSolo ? (
        <div className="my-4 min-h-[100px]">
          <div className="text-3xl font-bold text-white">Free</div>
          <p className="text-xs text-zinc-500 mt-1">7-day trial · 30 minutes</p>
        </div>
      ) : (
        <>
          {/* Monthly + Annual side-by-side */}
          <div className="grid grid-cols-2 gap-2 mt-4 mb-3">
            <div className="rounded-lg border border-zinc-800 p-2.5 text-center">
              <div className="text-[9px] uppercase tracking-wider text-zinc-500 mb-0.5">
                Monthly
              </div>
              <div className="text-xl font-semibold text-white">
                ${tier.monthlyPrice}
              </div>
              <div className="text-[10px] text-zinc-500">/mo</div>
            </div>
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2.5 text-center relative">
              <span className="absolute -top-2 left-1/2 -translate-x-1/2 bg-emerald-400 text-zinc-950 text-[8px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full">
                Save 25%
              </span>
              <div className="text-[9px] uppercase tracking-wider text-zinc-500 mb-0.5">
                Annual
              </div>
              <div className="text-xl font-semibold text-white">
                ${tier.monthlyEquivalent}
              </div>
              <div className="text-[10px] text-zinc-500">/mo</div>
            </div>
          </div>

          {/* Effective rate callout */}
          {tier.effectiveRatePerMinute > 0 && (
            <div className="mb-3 rounded-md border border-emerald-500/15 bg-emerald-500/5 px-2 py-1.5">
              <div className="text-[10px] font-medium text-emerald-400">
                ${tier.effectiveRatePerMinute.toFixed(3)}/min effective
              </div>
              <div className="text-[9px] text-emerald-400/70">
                at full annual bundle
              </div>
            </div>
          )}
        </>
      )}

      {/* CTAs */}
      {isSolo ? (
        <SubscribeButton
          tierId={tier.id}
          priceId={null}
          interval="monthly"
          isFeatured={true}
          buttonLabel="Start free trial"
        />
      ) : (
        <div className="grid grid-cols-2 gap-2 mb-4">
          <SubscribeButton
            tierId={tier.id}
            priceId={tier.stripePriceIdMonthly ?? null}
            interval="monthly"
            isFeatured={false}
            buttonLabel="Subscribe monthly"
          />
          <SubscribeButton
            tierId={tier.id}
            priceId={tier.stripePriceIdAnnual ?? null}
            interval="annual"
            isFeatured={true}
            buttonLabel="Subscribe annual"
          />
        </div>
      )}

      {/* Features */}
      <ul className="space-y-2 flex-1 border-t border-zinc-800/60 pt-4">
        <li className="flex items-start gap-2 text-xs text-zinc-300">
          <Check className="h-3.5 w-3.5 text-indigo-400 shrink-0 mt-0.5" />
          <span>
            {tier.includedMinutes.toLocaleString()} min/month
            {isSolo && ' (trial)'}
          </span>
        </li>
        {!isSolo && (
          <li className="flex items-start gap-2 text-xs text-zinc-300">
            <Check className="h-3.5 w-3.5 text-indigo-400 shrink-0 mt-0.5" />
            <span>
              ${tier.overageRate.toFixed(2)}/min overage
              {tier.id === 'pro' && (
                <span className="text-emerald-400 ml-1">↓</span>
              )}
              {tier.id === 'agency' && (
                <span className="text-emerald-400 ml-1">↓↓</span>
              )}
            </span>
          </li>
        )}
        <li className="flex items-start gap-2 text-xs text-zinc-300">
          <Check className="h-3.5 w-3.5 text-indigo-400 shrink-0 mt-0.5" />
          <span>Full CRM included free</span>
        </li>
        <li className="flex items-start gap-2 text-xs text-zinc-300">
          <Check className="h-3.5 w-3.5 text-indigo-400 shrink-0 mt-0.5" />
          <span>Recordings + transcripts + AI summaries</span>
        </li>
        {tier.prioritySupport && (
          <li className="flex items-start gap-2 text-xs text-zinc-300">
            <Check className="h-3.5 w-3.5 text-indigo-400 shrink-0 mt-0.5" />
            <span>Priority support</span>
          </li>
        )}
        {tier.whiteLabel && (
          <li className="flex items-start gap-2 text-xs text-zinc-300">
            <Check className="h-3.5 w-3.5 text-indigo-400 shrink-0 mt-0.5" />
            <span>White-label + custom domain</span>
          </li>
        )}
      </ul>
    </div>
  )
}
