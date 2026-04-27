// src/components/dashboard/kpi-card.tsx
//
// Stage 3.6.3 — KPI tile with optional inline 7-day sparkline.

import type { LucideIcon } from "lucide-react"
import { Sparkline } from "./sparkline"

export interface KpiCardProps {
  label: string
  value: string                  // pre-formatted (e.g. "847", "$12,340")
  icon: LucideIcon
  /** Tailwind classes for the icon's bg+fg, e.g. "bg-violet-500/15 text-violet-400" */
  iconClass?: string
  /** 7-element array; oldest → newest. Pass empty for a flat baseline. */
  sparkline?: number[]
  /** Sparkline color — typically var(--violet-primary) or similar. */
  sparklineColor?: string
}

export function KpiCard({
  label,
  value,
  icon: Icon,
  iconClass = "bg-zinc-800 text-zinc-300",
  sparkline,
  sparklineColor = "var(--violet-primary)",
}: KpiCardProps) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
      <div className="flex items-center justify-between">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${iconClass}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-3 text-2xl font-bold text-white tabular-nums">{value}</p>
      <p className="text-sm text-zinc-500">{label}</p>
      <div className="mt-3 -mx-1">
        <Sparkline points={sparkline ?? []} color={sparklineColor} />
      </div>
    </div>
  )
}
