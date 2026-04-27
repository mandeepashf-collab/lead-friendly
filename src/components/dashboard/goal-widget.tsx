// src/components/dashboard/goal-widget.tsx
//
// Stage 3.6.3 — "This week" goal widget. Three progress bars + streak.

"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { fetchWeeklyGoals, type WeeklyGoals } from "@/lib/dashboard/goals"
import { Flame } from "lucide-react"

interface Props {
  orgId: string | null
}

function formatCurrencyShort(n: number): string {
  if (n < 1000) return `$${Math.round(n)}`
  if (n < 1_000_000) return `$${Math.round(n / 1000)}K`
  return `$${(n / 1_000_000).toFixed(1)}M`
}

function ProgressBar({ current, target, color }: { current: number; target: number; color: string }) {
  const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0
  return (
    <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </div>
  )
}

export function GoalWidget({ orgId }: Props) {
  const [goals, setGoals] = useState<WeeklyGoals | null>(null)

  useEffect(() => {
    if (!orgId) return
    const supabase = createClient()
    let cancelled = false

    async function load() {
      try {
        const g = await fetchWeeklyGoals(supabase, orgId!)
        if (!cancelled) setGoals(g)
      } catch (err) {
        console.warn("[goal-widget] load failed", err)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [orgId])

  if (!orgId || !goals) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
        <div className="text-sm font-semibold text-white">This week</div>
        <div className="mt-3 h-32 animate-pulse" />
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-white">This week</div>
        {goals.streak > 0 && (
          <div className="flex items-center gap-1 text-xs">
            <Flame className="h-3.5 w-3.5 text-amber-400" />
            <span className="text-amber-400 font-medium tabular-nums">{goals.streak}</span>
            <span className="text-zinc-500">day{goals.streak !== 1 ? "s" : ""}</span>
          </div>
        )}
      </div>

      <div className="mt-4 space-y-3">
        <div>
          <div className="flex justify-between text-xs">
            <span className="text-zinc-400">Appointments</span>
            <span className="text-zinc-300 tabular-nums">
              {goals.appointments.current} / {goals.appointments.target}
            </span>
          </div>
          <div className="mt-1.5">
            <ProgressBar
              current={goals.appointments.current}
              target={goals.appointments.target}
              color="rgb(52 211 153)"
            />
          </div>
        </div>

        <div>
          <div className="flex justify-between text-xs">
            <span className="text-zinc-400">Calls</span>
            <span className="text-zinc-300 tabular-nums">
              {goals.calls.current} / {goals.calls.target}
            </span>
          </div>
          <div className="mt-1.5">
            <ProgressBar
              current={goals.calls.current}
              target={goals.calls.target}
              color="var(--violet-primary)"
            />
          </div>
        </div>

        <div>
          <div className="flex justify-between text-xs">
            <span className="text-zinc-400">Pipeline</span>
            <span className="text-zinc-300 tabular-nums">
              {formatCurrencyShort(goals.pipeline.current)} / {formatCurrencyShort(goals.pipeline.target)}
            </span>
          </div>
          <div className="mt-1.5">
            <ProgressBar
              current={goals.pipeline.current}
              target={goals.pipeline.target}
              color="rgb(251 191 36)"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
