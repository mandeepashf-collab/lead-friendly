"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Call } from "@/types/database";

interface UseCallsOptions {
  search?: string;
  direction?: "inbound" | "outbound" | "all";
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export function useCalls(options: UseCallsOptions = {}) {
  const [calls, setCalls] = useState<Call[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const {
    search,
    direction = "all",
    startDate,
    endDate,
    limit = 25,
    offset = 0,
  } = options;

  const fetchCalls = useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = createClient();

    // LEFT JOIN on contacts (and ai_agents) so rows with NULL contact_id —
    // like WebRTC test calls — still appear. The `!left` hint forces the
    // left join; without it, the earlier `contacts:resolved_contact_id(...)`
    // syntax was malformed and dropped all rows.
    let q = supabase
      .from("calls")
      .select(
        "*, contacts!left(first_name, last_name), ai_agents!left(name)",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (direction && direction !== "all") q = q.eq("direction", direction);
    if (startDate) q = q.gte("created_at", startDate);
    if (endDate) q = q.lte("created_at", endDate);
    if (search) {
      q = q.or(
        `first_name.ilike.%${search}%,last_name.ilike.%${search}%`,
        { referencedTable: "contacts" },
      );
    }

    const { data, error: fetchError, count: totalCount } = await q;

    if (fetchError) {
      setError(fetchError.message);
    } else {
      setCalls(data || []);
      setCount(totalCount || 0);
    }
    setLoading(false);
  }, [search, direction, startDate, endDate, limit, offset]);

  useEffect(() => {
    fetchCalls();
  }, [fetchCalls]);

  return { calls, count, loading, error, refetch: fetchCalls };
}

export function useCall(id: string | null) {
  const [call, setCall] = useState<(Call & { contacts?: { first_name: string | null; last_name: string | null } }) | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!id) {
      setCall(null);
      return;
    }
    setLoading(true);
    const supabase = createClient();
    supabase
      .from("calls")
      .select("*, contacts:contact_id(first_name, last_name)")
      .eq("id", id)
      .single()
      .then(({ data }) => {
        setCall(data);
        setLoading(false);
      });
  }, [id]);

  return { call, loading };
}

/**
 * Single source of truth for call stats.
 *
 * Reads from /api/stats/calls which is backed by the `call_stats_by_org`
 * Supabase view (see supabase/migrations/011_call_stats_view.sql).
 * This replaces the ad-hoc client-side aggregation that caused Dashboard,
 * Call Logs, AI Agents, and Billing to disagree.
 *
 * If the migration hasn't been applied yet, falls back to the legacy
 * client-side query so nothing breaks.
 */
export async function getCallStats(): Promise<{
  totalCalls: number;
  avgDuration: number;
  answerRate: number;
  appointmentsBooked: number;
  error: string | null;
}> {
  try {
    const res = await fetch("/api/stats/calls", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      return {
        totalCalls: data.total_calls ?? 0,
        avgDuration: data.avg_duration_seconds ?? 0,
        answerRate: data.answer_rate_pct ?? 0,
        appointmentsBooked: data.appointments_booked_30d ?? 0,
        error: null,
      };
    }
  } catch {
    // fall through to legacy path
  }

  // Legacy fallback — used only if the unified view / API is unavailable.
  const supabase = createClient();

  const { data: calls, error } = await supabase
    .from("calls")
    .select("duration_seconds, status");

  if (error) {
    return { totalCalls: 0, avgDuration: 0, answerRate: 0, appointmentsBooked: 0, error: error.message };
  }

  const callList = calls || [];
  const totalCalls = callList.length;
  const answeredCalls = callList.filter(c => c.status === "completed" || c.status === "answered");
  const avgDuration = answeredCalls.length > 0
    ? Math.round(answeredCalls.reduce((sum, c) => sum + (c.duration_seconds || 0), 0) / answeredCalls.length)
    : 0;
  const answerRate = totalCalls > 0 ? Math.round((answeredCalls.length / totalCalls) * 100) : 0;

  // Get appointments count from calls in the last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: recentAppointments } = await supabase
    .from("appointments")
    .select("id", { count: "exact" })
    .gte("created_at", thirtyDaysAgo.toISOString());

  const appointmentsBooked = recentAppointments?.length || 0;

  return { totalCalls, avgDuration, answerRate, appointmentsBooked, error: null };
}
