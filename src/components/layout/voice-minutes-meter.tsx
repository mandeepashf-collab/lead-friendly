'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

interface MinutesPayload {
  used?: number
  limit?: number | null
  tier?: string
  overageMinutes?: number
}

export function VoiceMinutesMeter({ className }: { className?: string }) {
  const [used, setUsed] = useState<number>(0)
  const [limit, setLimit] = useState<number | null>(30)
  const [tier, setTier] = useState<string>('solo')
  const [overage, setOverage] = useState<number>(0)

  useEffect(() => {
    fetch('/api/ai-minutes')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: MinutesPayload | null) => {
        if (!d) return
        setUsed(d.used ?? 0)
        setLimit(d.limit === null ? null : d.limit ?? 30)
        setTier(d.tier ?? 'solo')
        setOverage(d.overageMinutes ?? 0)
      })
      .catch(() => {})
  }, [])

  const isUnlimited = limit === null
  const isPaid = tier !== 'solo'
  const pct = isUnlimited ? 0 : Math.min(100, (used / Math.max(limit ?? 1, 1)) * 100)

  const barClass =
    pct >= 90 ? 'bg-lost' : pct >= 70 ? 'bg-hot' : 'bg-violet-primary'

  // Solo tier shows "Upgrade for more". Paid tiers show "View plan" linking
  // to /pricing for now (Phase 5 will replace with /settings/billing).
  const ctaText = isPaid ? 'View plan →' : 'Upgrade for more →'

  return (
    <div className={cn('rounded-md bg-zinc-900 p-3', className)}>
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-zinc-400">Voice minutes</span>
        <span className="font-mono tabular-nums text-zinc-300">
          {isUnlimited ? `Unlimited · ${used} used` : `${used} / ${limit}`}
        </span>
      </div>
      {!isUnlimited && (
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-zinc-800">
          <div
            className={cn('h-full rounded-full transition-all', barClass)}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      {overage > 0 && (
        <p className="mt-1 text-[10px] text-amber-400">
          {overage} overage min · drawn from wallet
        </p>
      )}
      <Link
        href="/pricing"
        className="mt-2 block text-[11px] font-medium text-indigo-400 hover:text-indigo-300"
      >
        {ctaText}
      </Link>
    </div>
  )
}
