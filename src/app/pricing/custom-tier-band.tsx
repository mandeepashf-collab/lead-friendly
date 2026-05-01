import Link from 'next/link'
import type { PricingTier } from '@/config/pricing'

interface Props {
  tier: PricingTier
}

export function CustomTierBand({ tier }: Props) {
  return (
    <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900/30 p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <div className="text-sm font-semibold text-white">{tier.name}</div>
        <p className="text-xs text-zinc-400 mt-1">
          {tier.tagline}{' '}
          <span className="text-zinc-500">Volume discounts available.</span>
        </p>
      </div>
      <Link
        href="mailto:hello@leadfriendly.com"
        className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 whitespace-nowrap text-center"
      >
        Talk to us →
      </Link>
    </div>
  )
}
