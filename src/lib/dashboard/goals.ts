// src/lib/dashboard/goals.ts
//
// Stage 3.6.3 — Hardcoded weekly goal targets (D1 decision).
// Per-org configurable targets are deferred to Stage 3.7+; v1 ships with
// these constants. Refactor to a DB column when first paying customer asks.

import type { SupabaseClient } from "@supabase/supabase-js"

export const WEEKLY_TARGETS = {
  appointments: 10,
  calls: 100,
  pipelineValue: 50_000,
} as const

export interface WeeklyGoals {
  appointments: { current: number; target: number }
  calls: { current: number; target: number }
  pipeline: { current: number; target: number }
  streak: number  // consecutive days with at least 1 AI-booked appointment
}

const EMPTY_GOALS: WeeklyGoals = {
  appointments: { current: 0, target: WEEKLY_TARGETS.appointments },
  calls: { current: 0, target: WEEKLY_TARGETS.calls },
  pipeline: { current: 0, target: WEEKLY_TARGETS.pipelineValue },
  streak: 0,
}

/**
 * Streak = consecutive days from today backwards with at least one entry.
 * Today not booking yet still counts the prior streak (i === 0 branch).
 * All dates evaluated in local timezone.
 */
function computeStreak(timestamps: string[]): number {
  if (timestamps.length === 0) return 0

  const dayKeys = new Set<string>()
  for (const t of timestamps) {
    const d = new Date(t)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    dayKeys.add(`${y}-${m}-${day}`)
  }

  let streak = 0
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  for (let i = 0; i < 60; i++) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    const key = `${y}-${m}-${day}`
    if (dayKeys.has(key)) {
      streak += 1
    } else if (i === 0) {
      // No appointment today — streak still valid from yesterday onwards
    } else {
      break
    }
  }
  return streak
}

/** Monday 00:00 local time of the current week. */
function startOfWeek(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  const dow = d.getDay()  // 0=Sun, 1=Mon, ...
  const offset = dow === 0 ? 6 : dow - 1
  d.setDate(d.getDate() - offset)
  return d
}

export async function fetchWeeklyGoals(
  supabase: SupabaseClient,
  orgId: string,
): Promise<WeeklyGoals> {
  if (!orgId) return EMPTY_GOALS

  const weekStart = startOfWeek()
  const weekStartIso = weekStart.toISOString()
  const sixtyDaysAgo = new Date()
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)
  const sixtyDaysAgoIso = sixtyDaysAgo.toISOString()

  const [
    apptsThisWeek,
    callsThisWeek,
    pipelineThisWeek,
    apptsForStreak,
  ] = await Promise.all([
    supabase
      .from("appointments")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .gte("created_at", weekStartIso),

    supabase
      .from("calls")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .gte("created_at", weekStartIso),

    supabase
      .from("opportunities")
      .select("value")
      .eq("organization_id", orgId)
      .gte("created_at", weekStartIso),

    supabase
      .from("appointments")
      .select("created_at")
      .eq("organization_id", orgId)
      .not("ai_agent_id", "is", null)
      .gte("created_at", sixtyDaysAgoIso),
  ])

  const appointmentsCurrent = apptsThisWeek.count ?? 0
  const callsCurrent = callsThisWeek.count ?? 0
  const pipelineCurrent = (pipelineThisWeek.data ?? []).reduce(
    (s: number, r: { value: number | null }) => s + (Number(r.value) || 0),
    0,
  )
  const streak = computeStreak(
    (apptsForStreak.data ?? []).map((r: { created_at: string }) => r.created_at),
  )

  return {
    appointments: { current: appointmentsCurrent, target: WEEKLY_TARGETS.appointments },
    calls: { current: callsCurrent, target: WEEKLY_TARGETS.calls },
    pipeline: { current: pipelineCurrent, target: WEEKLY_TARGETS.pipelineValue },
    streak,
  }
}
