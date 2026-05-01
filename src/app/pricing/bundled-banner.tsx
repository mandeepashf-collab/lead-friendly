import { TIER_STARTER, TIER_PRO, TIER_AGENCY, PRICING_PAGE_COPY } from '@/config/pricing'

export function BundledBanner() {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/15 shrink-0">
          <span className="text-emerald-400 text-sm font-semibold">$</span>
        </div>
        <div className="text-sm text-zinc-300 leading-relaxed">
          <p className="font-semibold text-white mb-1">
            {PRICING_PAGE_COPY.bundledBanner.title}
          </p>
          <p>
            {PRICING_PAGE_COPY.bundledBanner.body} Effective rates at full annual bundle:
            Starter <span className="text-emerald-400 font-medium">${TIER_STARTER.effectiveRatePerMinute.toFixed(3)}/min</span>
            , Pro <span className="text-emerald-400 font-medium">${TIER_PRO.effectiveRatePerMinute.toFixed(3)}/min</span>
            , Agency <span className="text-emerald-400 font-medium">${TIER_AGENCY.effectiveRatePerMinute.toFixed(3)}/min</span>.{' '}
            <span className="text-zinc-500">{PRICING_PAGE_COPY.bundledBanner.tagline}</span>
          </p>
        </div>
      </div>
    </div>
  )
}
