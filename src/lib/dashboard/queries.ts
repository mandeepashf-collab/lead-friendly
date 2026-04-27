// src/lib/dashboard/queries.ts
//
// Stage 3.6.3 — Dashboard KPI data layer.
// Runs against the BROWSER Supabase client; called from the dashboard page
// which is a client component. RLS handles auth scoping; we just pass orgId
// for the queries that filter by it.

import type { SupabaseClient } from "@supabase/supabase-js"

export interface DashboardKpis {
  callsToday: number
  bookedLast30d: number
  totalContacts: number
  pipelineValue: number
  sparklines: {
    callsPerDay: number[]        // 7 entries, oldest → newest
    bookedPerDay: number[]       // 7 entries
    contactsCreatedPerDay: number[] // 7 entries
    pipelineCreatedPerDay: number[] // 7 entries (sum of opportunities.value created on each day)
  }
  // For the slim status header
  activeCampaigns: number
}

const EMPTY_KPIS: DashboardKpis = {
  callsToday: 0,
  bookedLast30d: 0,
  totalContacts: 0,
  pipelineValue: 0,
  sparklines: {
    callsPerDay: [0, 0, 0, 0, 0, 0, 0],
    bookedPerDay: [0, 0, 0, 0, 0, 0, 0],
    contactsCreatedPerDay: [0, 0, 0, 0, 0, 0, 0],
    pipelineCreatedPerDay: [0, 0, 0, 0, 0, 0, 0],
  },
  activeCampaigns: 0,
}

/**
 * Returns the YYYY-MM-DD key for a Date in the user's local timezone.
 */
function localDayKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

/**
 * Build a 7-element array of day keys [today-6, today-5, ..., today]
 * in local time. Used for sparkline X-axis alignment.
 */
function last7DayKeys(): string[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const keys: string[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    keys.push(localDayKey(d))
  }
  return keys
}

function bucketCountsByDay(timestamps: (string | null | undefined)[]): number[] {
  const keys = last7DayKeys()
  const counts: Record<string, number> = Object.fromEntries(keys.map(k => [k, 0]))
  for (const t of timestamps) {
    if (!t) continue
    const key = localDayKey(new Date(t))
    if (key in counts) counts[key]! += 1
  }
  return keys.map(k => counts[k]!)
}

function bucketSumsByDay(rows: { ts: string | null | undefined; value: number }[]): number[] {
  const keys = last7DayKeys()
  const sums: Record<string, number> = Object.fromEntries(keys.map(k => [k, 0]))
  for (const r of rows) {
    if (!r.ts) continue
    const key = localDayKey(new Date(r.ts))
    if (key in sums) sums[key]! += r.value
  }
  return keys.map(k => sums[k]!)
}

export async function fetchDashboardKpis(
  supabase: SupabaseClient,
  orgId: string,
): Promise<DashboardKpis> {
  if (!orgId) return EMPTY_KPIS

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const sevenDaysAgo = new Date(today)
  sevenDaysAgo.setDate(today.getDate() - 6)
  const sevenDaysAgoIso = sevenDaysAgo.toISOString()

  const [
    statsResult,
    contactsCountResult,
    contactsRecentResult,
    opportunitiesAllResult,
    opportunitiesRecentResult,
    callsRecentResult,
    appointmentsRecentResult,
    activeCampaignsResult,
  ] = await Promise.all([
    supabase
      .from("call_stats_by_org")
      .select("calls_today, appointments_booked_30d")
      .eq("organization_id", orgId)
      .maybeSingle(),

    supabase
      .from("contacts")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", orgId),

    supabase
      .from("contacts")
      .select("created_at")
      .eq("organization_id", orgId)
      .gte("created_at", sevenDaysAgoIso),

    supabase
      .from("opportunities")
      .select("value")
      .eq("organization_id", orgId),

    supabase
      .from("opportunities")
      .select("created_at, value")
      .eq("organization_id", orgId)
      .gte("created_at", sevenDaysAgoIso),

    supabase
      .from("calls")
      .select("created_at")
      .eq("organization_id", orgId)
      .gte("created_at", sevenDaysAgoIso),

    // Appointments has no booked_at column; use created_at.
    supabase
      .from("appointments")
      .select("created_at")
      .eq("organization_id", orgId)
      .gte("created_at", sevenDaysAgoIso),

    supabase
      .from("campaigns")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("status", "active"),
  ])

  const callsToday = statsResult.data?.calls_today ?? 0
  const bookedLast30d = statsResult.data?.appointments_booked_30d ?? 0
  const totalContacts = contactsCountResult.count ?? 0
  const pipelineValue = (opportunitiesAllResult.data ?? []).reduce(
    (sum: number, row: { value: number | null }) => sum + (Number(row.value) || 0),
    0,
  )
  const activeCampaigns = activeCampaignsResult.count ?? 0

  const callsPerDay = bucketCountsByDay(
    (callsRecentResult.data ?? []).map((r: { created_at: string }) => r.created_at),
  )
  const bookedPerDay = bucketCountsByDay(
    (appointmentsRecentResult.data ?? []).map((r: { created_at: string }) => r.created_at),
  )
  const contactsCreatedPerDay = bucketCountsByDay(
    (contactsRecentResult.data ?? []).map((r: { created_at: string }) => r.created_at),
  )
  const pipelineCreatedPerDay = bucketSumsByDay(
    (opportunitiesRecentResult.data ?? []).map(
      (r: { created_at: string; value: number | null }) => ({
        ts: r.created_at,
        value: Number(r.value) || 0,
      }),
    ),
  )

  return {
    callsToday,
    bookedLast30d,
    totalContacts,
    pipelineValue,
    sparklines: {
      callsPerDay,
      bookedPerDay,
      contactsCreatedPerDay,
      pipelineCreatedPerDay,
    },
    activeCampaigns,
  }
}
