'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

interface MinutesPayload {
  used?: number
  limit?: number | null
}

export function VoiceMinutesMeter({ className }: { className?: string }) {
  const [used, setUsed] = useState<number>(0)
  const [limit, setLimit] = useState<number | null>(500)

  useEffect(() => {
    fetch('/api/ai-minutes')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: MinutesPayload | null) => {
        if (!d) return
        setUsed(d.used ?? 0)
        setLimit(d.limit === null ? null : d.limit ?? 500)
      })
      .catch(() => {})
  }, [])

  const isUnlimited = limit === null
  const pct = isUnlimited ? 0 : Math.min(100, (used / Math.max(limit ?? 1, 1)) * 100)

  // Threshold colors via Stage 3.6.1 bridge utilities (verified: bg-lost,
  // bg-hot resolve via @theme inline). Comfortable state uses Tailwind's
  // default violet palette.
  const barClass =
    pct >= 90 ? 'bg-lost' : pct >= 70 ? 'bg-hot' : 'bg-violet-500'

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
      <Link
        href="/billing"
        className="mt-2 block text-[11px] font-medium text-indigo-400 hover:text-indigo-300"
      >
        Upgrade for more →
      </Link>
    </div>
  )
}
