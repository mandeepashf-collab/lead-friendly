import { PRICING_PAGE_COPY } from '@/config/pricing'

export function AddOnsBand() {
  const { phoneNumbers, customDomains } = PRICING_PAGE_COPY.addOns

  return (
    <div className="mt-4 rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/20 p-5">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-3">
        Add-ons
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <div className="text-sm font-semibold text-white">
            {phoneNumbers.title}
            <span className="ml-2 text-[10px] font-normal text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
              {phoneNumbers.tag}
            </span>
          </div>
          <p className="text-xs text-zinc-500 mt-1">{phoneNumbers.body}</p>
        </div>
        <div>
          <div className="text-sm font-semibold text-white">
            {customDomains.title}
            <span className="ml-2 text-[10px] font-normal text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">
              {customDomains.tag}
            </span>
          </div>
          <p className="text-xs text-zinc-500 mt-1">{customDomains.body}</p>
        </div>
      </div>
    </div>
  )
}
