'use client'

import { useState, useEffect } from 'react'

interface CounterSnapshot {
  spotsClaimed: number
  spotsTotal: number
  spotsRemaining: number
  soldOut: boolean
}

interface Props {
  initial: CounterSnapshot
}

/**
 * Live spots-claimed counter for /founding.
 *
 * Renders the initial snapshot from server-side props on first paint,
 * then polls /api/founding/counter every 30s to keep the display fresh.
 * If the page is open in a tab while a real customer claims a spot,
 * the counter ticks up without a reload.
 *
 * Polling is intentionally slow (30s) because:
 *   - Counter changes are rare (max 100 ever)
 *   - The /api/founding/counter endpoint has a 15s edge cache
 *   - Faster polling would burn DB queries with no UX benefit
 */
export function FoundingCounter({ initial }: Props) {
  const [snap, setSnap] = useState<CounterSnapshot>(initial)

  useEffect(() => {
    let cancelled = false

    const poll = async () => {
      try {
        const res = await fetch('/api/founding/counter', { cache: 'no-store' })
        if (!res.ok) return
        const data: CounterSnapshot = await res.json()
        if (!cancelled) setSnap(data)
      } catch {
        // Silently swallow — next poll will retry
      }
    }

    const interval = setInterval(poll, 30_000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  const pct = (snap.spotsClaimed / snap.spotsTotal) * 100

  return (
    <div className="w-full max-w-md">
      <div className="flex items-baseline justify-between mb-2">
        <div>
          <span className="text-3xl font-bold text-amber-400">{snap.spotsClaimed}</span>
          <span className="text-zinc-500 mx-1.5">/</span>
          <span className="text-2xl text-zinc-300">{snap.spotsTotal}</span>
          <span className="text-sm text-zinc-500 ml-2">spots claimed</span>
        </div>
        <span className="text-sm font-medium text-amber-300">
          {snap.spotsRemaining} left
        </span>
      </div>
      <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all"
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  )
}
