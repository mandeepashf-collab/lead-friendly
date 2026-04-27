// src/components/dashboard/agent-cards-section.tsx
//
// Stage 3.6.3 — Wrapper that fetches initial agent statuses and renders
// the per-agent cards grid. Each AgentLiveCard owns its own polling.

"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { fetchAgentLiveStatuses, type AgentLiveStatus } from "@/lib/dashboard/agent-status"
import { AgentLiveCard } from "./agent-live-card"

interface Props {
  orgId: string | null
}

export function AgentCardsSection({ orgId }: Props) {
  const [statuses, setStatuses] = useState<AgentLiveStatus[] | null>(null)

  useEffect(() => {
    if (!orgId) return
    const supabase = createClient()
    let cancelled = false

    async function loadInitial() {
      try {
        const all = await fetchAgentLiveStatuses(supabase, orgId!)
        if (!cancelled) setStatuses(all)
      } catch (err) {
        console.warn("[agent-cards] initial load failed", err)
        if (!cancelled) setStatuses([])
      }
    }
    loadInitial()
    return () => {
      cancelled = true
    }
  }, [orgId])

  if (!orgId) return null
  if (statuses === null) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5 h-[120px] animate-pulse" />
        ))}
      </div>
    )
  }
  if (statuses.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 text-sm text-zinc-500">
        No active AI agents. Configure one in AI Agents.
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {statuses.map((s) => (
        <AgentLiveCard key={s.agentId} initialStatus={s} orgId={orgId} />
      ))}
    </div>
  )
}
