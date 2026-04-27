// src/lib/dashboard/agent-status.ts
//
// Stage 3.6.3 — Live status fetch for AI agents.
// Used both for initial load and for client-side polling.
// Polls every 15s when the dashboard tab is visible (D2).

import type { SupabaseClient } from "@supabase/supabase-js"

export interface AgentLiveStatus {
  agentId: string
  name: string
  voiceId: string | null
  isDefault: boolean
  status: "on-call" | "idle"
  currentCall: {
    contactName: string | null
    durationSec: number
    sentiment: string | null
    startedAt: string
  } | null
  dayStats: {
    calls: number
    booked: number
  }
  lastCall: {
    endedAt: string
    contactName: string | null
  } | null
}

function startOfTodayLocalIso(): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

export async function fetchAgentLiveStatuses(
  supabase: SupabaseClient,
  orgId: string,
): Promise<AgentLiveStatus[]> {
  if (!orgId) return []

  const { data: agents } = await supabase
    .from("ai_agents")
    .select("id, name, voice_id, is_default")
    .eq("organization_id", orgId)
    .eq("status", "active")
    .order("is_default", { ascending: false })

  if (!agents || agents.length === 0) return []

  const todayIso = startOfTodayLocalIso()

  const statuses = await Promise.all(
    agents.map(async (agent: { id: string; name: string; voice_id: string | null; is_default: boolean }) => {
      const [activeCallResult, todayCallsResult, todayBookedResult, lastCallResult] = await Promise.all([
        supabase
          .from("calls")
          .select("started_at, sentiment, contact_id, contacts(first_name, last_name)")
          .eq("organization_id", orgId)
          .eq("ai_agent_id", agent.id)
          .is("ended_at", null)
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle(),

        supabase
          .from("calls")
          .select("*", { count: "exact", head: true })
          .eq("organization_id", orgId)
          .eq("ai_agent_id", agent.id)
          .gte("created_at", todayIso),

        supabase
          .from("appointments")
          .select("*", { count: "exact", head: true })
          .eq("organization_id", orgId)
          .eq("ai_agent_id", agent.id)
          .gte("created_at", todayIso),

        supabase
          .from("calls")
          .select("ended_at, contact_id, contacts(first_name, last_name)")
          .eq("organization_id", orgId)
          .eq("ai_agent_id", agent.id)
          .not("ended_at", "is", null)
          .order("ended_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])

      const activeCall = activeCallResult.data as
        | { started_at: string | null; sentiment: string | null; contacts: unknown }
        | null
      const lastCall = lastCallResult.data as
        | { ended_at: string | null; contacts: unknown }
        | null

      let currentCall: AgentLiveStatus["currentCall"] = null
      if (activeCall && activeCall.started_at) {
        const contactRow = (Array.isArray(activeCall.contacts)
          ? activeCall.contacts[0]
          : activeCall.contacts) as
          | { first_name: string | null; last_name: string | null }
          | null
          | undefined
        const contactName = contactRow
          ? [contactRow.first_name, contactRow.last_name].filter(Boolean).join(" ") || null
          : null
        const durationSec = Math.max(
          0,
          Math.floor((Date.now() - new Date(activeCall.started_at).getTime()) / 1000),
        )
        currentCall = {
          contactName,
          durationSec,
          sentiment: activeCall.sentiment ?? null,
          startedAt: activeCall.started_at,
        }
      }

      let lastCallNormalized: AgentLiveStatus["lastCall"] = null
      if (lastCall && lastCall.ended_at) {
        const contactRow = (Array.isArray(lastCall.contacts)
          ? lastCall.contacts[0]
          : lastCall.contacts) as
          | { first_name: string | null; last_name: string | null }
          | null
          | undefined
        const contactName = contactRow
          ? [contactRow.first_name, contactRow.last_name].filter(Boolean).join(" ") || null
          : null
        lastCallNormalized = {
          endedAt: lastCall.ended_at,
          contactName,
        }
      }

      return {
        agentId: agent.id,
        name: agent.name,
        voiceId: agent.voice_id,
        isDefault: agent.is_default,
        status: currentCall ? "on-call" : "idle",
        currentCall,
        dayStats: {
          calls: todayCallsResult.count ?? 0,
          booked: todayBookedResult.count ?? 0,
        },
        lastCall: lastCallNormalized,
      } satisfies AgentLiveStatus
    }),
  )

  return statuses
}
