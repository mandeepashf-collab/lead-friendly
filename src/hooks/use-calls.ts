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

    let query = supabase
      .from("calls")
      .select("*, contacts:contact_id(first_name, last_name)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (direction && direction !== "all") {
      query = query.eq("direction", direction);
    }

    if (startDate) {
      query = query.gte("created_at", startDate);
    }

    if (endDate) {
      query = query.lte("created_at", endDate);
    }

    if (search) {
      query = query.or(
        `contacts.first_name.ilike.%${search}%,contacts.last_name.ilike.%${search}%`
      );
    }

    const { data, error: fetchError, count: totalCount } = await query;

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

export async function getCallStats(): Promise<{
  totalCalls: number;
  avgDuration: number;
  answerRate: number;
  appointmentsBooked: number;
  error: string | null;
}> {
  const supabase = createClient();

  const { data: calls, error } = await supabase
    .from("calls")
    .select("duration_seconds, status");

  if (error) {
    return { totalCalls: 0, avgDuration: 0, answerRate: 0, appointmentsBooked: 0, error: error.message };
  }

  const callList = calls || [];
  const totalCalls = callList.length;
  const avgDuration = totalCalls > 0 ? Math.round(callList.reduce((sum, c) => sum + (c.duration_seconds || 0), 0) / totalCalls) : 0;
  const answeredCalls = callList.filter(c => c.status === "completed" || c.status === "answered").length;
  const answerRate = totalCalls > 0 ? Math.round((answeredCalls / totalCalls) * 100) : 0;

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
