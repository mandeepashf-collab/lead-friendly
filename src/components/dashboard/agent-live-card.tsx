// src/components/dashboard/agent-live-card.tsx
//
// Stage 3.6.3 — Live AI agent card.
// Polls every 15s, pausing when the tab is not visible (D2). Refetches
// immediately on tab focus.

"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { fetchAgentLiveStatuses, type AgentLiveStatus } from "@/lib/dashboard/agent-status"
import { Phone } from "lucide-react"

interface AgentLiveCardProps {
  initialStatus: AgentLiveStatus
  orgId: string
}

const POLL_INTERVAL_MS = 15_000

function capitalize(name: string): string {
  if (!name) return name
  return name.charAt(0).toUpperCase() + name.slice(1)
}

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}s`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}m ${s.toString().padStart(2, "0")}s`
}

function formatRelativeTime(iso: string): string {
  const ago = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ago / 60_000)
  if (min < 1) return "just now"
  if (min < 60) return `${min}m ago`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

export function AgentLiveCard({ initialStatus, orgId }: AgentLiveCardProps) {
  const [status, setStatus] = useState<AgentLiveStatus>(initialStatus)

  useEffect(() => {
    if (!orgId) return

    const supabase = createClient()
    let cancelled = false

    async function poll() {
      if (cancelled) return
      if (document.visibilityState !== "visible") return
      try {
        const all = await fetchAgentLiveStatuses(supabase, orgId)
        if (cancelled) return
        const mine = all.find((s) => s.agentId === initialStatus.agentId)
        if (mine) setStatus(mine)
      } catch (err) {
        console.warn("[agent-live-card] poll failed", err)
      }
    }

    const interval = setInterval(poll, POLL_INTERVAL_MS)
    const onVisibility = () => {
      if (document.visibilityState === "visible") poll()
    }
    document.addEventListener("visibilitychange", onVisibility)

    return () => {
      cancelled = true
      clearInterval(interval)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [orgId, initialStatus.agentId])

  const onCall = status.status === "on-call" && status.currentCall

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-500/15 text-violet-400">
            <Phone className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-semibold text-white">
              {capitalize(status.name)}
            </div>
            {status.isDefault && (
              <div className="text-[10px] uppercase tracking-wide text-zinc-500">Default</div>
            )}
          </div>
        </div>
        {onCall ? (
          <div className="flex items-center gap-1.5 text-xs">
            <span className="relative inline-flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            <span className="text-emerald-400 font-medium">On call</span>
          </div>
        ) : (
          <span className="text-xs text-zinc-500">Idle</span>
        )}
      </div>

      <div className="mt-4 text-sm">
        {onCall && status.currentCall ? (
          <div className="text-zinc-300">
            <span className="tabular-nums">{formatDuration(status.currentCall.durationSec)}</span>
            {status.currentCall.contactName && (
              <> · {status.currentCall.contactName}</>
            )}
            {status.currentCall.sentiment && (
              <> · <span className="text-zinc-400 capitalize">{status.currentCall.sentiment}</span></>
            )}
          </div>
        ) : status.dayStats.calls > 0 ? (
          <div className="text-zinc-400">
            {status.lastCall ? (
              <>Last: {formatRelativeTime(status.lastCall.endedAt)} · </>
            ) : null}
            <span className="tabular-nums">{status.dayStats.calls}</span> calls today,{" "}
            <span className="tabular-nums">{status.dayStats.booked}</span> booked
          </div>
        ) : (
          <div className="text-zinc-500">Ready · 0 calls today</div>
        )}
      </div>
    </div>
  )
}
