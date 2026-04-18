"use client";

import { useEffect, useState } from "react";

/**
 * Single source of truth for call statistics across the app.
 * Backed by the Supabase `call_stats_by_org` view via /api/stats/calls.
 *
 * If you add a new dashboard widget that shows a call number, read it
 * from here — not from ad-hoc supabase queries — so all pages agree.
 */
export interface CallStats {
  total_calls: number;
  calls_today: number;
  calls_this_month: number;
  calls_last_7d: number;
  answered_calls: number;
  appointments_booked: number;
  appointments_booked_30d: number;
  total_duration_seconds: number;
  total_minutes: number;
  minutes_this_month: number;
  avg_duration_seconds: number;
  answer_rate_pct: number;
}

const ZERO: CallStats = {
  total_calls: 0,
  calls_today: 0,
  calls_this_month: 0,
  calls_last_7d: 0,
  answered_calls: 0,
  appointments_booked: 0,
  appointments_booked_30d: 0,
  total_duration_seconds: 0,
  total_minutes: 0,
  minutes_this_month: 0,
  avg_duration_seconds: 0,
  answer_rate_pct: 0,
};

export function useCallStats() {
  const [stats, setStats] = useState<CallStats>(ZERO);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/stats/calls", { cache: "no-store" });
        const data = (await res.json()) as Partial<CallStats>;
        if (cancelled) return;
        setStats({ ...ZERO, ...data });
      } catch {
        if (!cancelled) setStats(ZERO);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { stats, loading };
}

export interface AgentCallStats {
  total_calls: number;
  answered_calls: number;
  appointments_booked: number;
  total_duration_seconds: number;
  total_minutes: number;
}

const AGENT_ZERO: AgentCallStats = {
  total_calls: 0,
  answered_calls: 0,
  appointments_booked: 0,
  total_duration_seconds: 0,
  total_minutes: 0,
};

export function useAgentCallStats(agentId: string | null | undefined) {
  const [stats, setStats] = useState<AgentCallStats>(AGENT_ZERO);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!agentId) {
      setStats(AGENT_ZERO);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(
          `/api/stats/calls?agentId=${encodeURIComponent(agentId)}`,
          { cache: "no-store" },
        );
        const data = (await res.json()) as Partial<AgentCallStats>;
        if (cancelled) return;
        setStats({ ...AGENT_ZERO, ...data });
      } catch {
        if (!cancelled) setStats(AGENT_ZERO);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  return { stats, loading };
}
