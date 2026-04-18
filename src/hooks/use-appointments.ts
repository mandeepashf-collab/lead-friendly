"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Appointment } from "@/types/database";

interface UseAppointmentsOptions {
  month?: number;
  year?: number;
  limit?: number;
  offset?: number;
}

export function useAppointments(month: number = new Date().getMonth() + 1, year: number = new Date().getFullYear()) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAppointments = useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = createClient();

    // Get appointments for the month
    const startDate = new Date(year, month - 1, 1).toISOString().split('T')[0];
    const endDate = new Date(year, month, 0).toISOString().split('T')[0];

    const { data, error: fetchError } = await supabase
      .from("appointments")
      .select("*")
      .gte("appointment_date", startDate)
      .lte("appointment_date", endDate)
      .order("appointment_date", { ascending: true });

    if (fetchError) {
      setError(fetchError.message);
    } else {
      setAppointments(data || []);
    }
    setLoading(false);
  }, [month, year]);

  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  return { appointments, loading, error, refetch: fetchAppointments };
}

export function useAppointmentsForDay(date: string) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!date) {
      setAppointments([]);
      return;
    }
    setLoading(true);
    const supabase = createClient();
    supabase
      .from("appointments")
      .select("*")
      .eq("appointment_date", date)
      .order("start_time", { ascending: true })
      .then(({ data }) => {
        setAppointments(data || []);
        setLoading(false);
      });
  }, [date]);

  return { appointments, loading };
}

export function useUpcomingAppointments(limit: number = 5) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    const today = new Date().toISOString().split('T')[0];

    supabase
      .from("appointments")
      .select("*")
      .gte("appointment_date", today)
      .order("appointment_date", { ascending: true })
      .order("start_time", { ascending: true })
      .limit(limit)
      .then(({ data }) => {
        setAppointments(data || []);
        setLoading(false);
      });
  }, [limit]);

  return { appointments, loading };
}

// UUID v4 regex for validating assigned_to before sending to DB
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function createAppointment(
  appointment: Partial<Appointment>
): Promise<{ data: Appointment | null; error: string | null }> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  if (!profile) return { data: null, error: "No profile found" };

  // Sanitize assigned_to: must be a valid UUID or null.
  // The UI currently sends free-text names which crash Postgres.
  const sanitized = { ...appointment };
  if (sanitized.assigned_to && !UUID_RE.test(sanitized.assigned_to)) {
    sanitized.assigned_to = null;
  }
  if (!sanitized.assigned_to) sanitized.assigned_to = null;

  // Sanitize contact_id the same way
  if (sanitized.contact_id && !UUID_RE.test(sanitized.contact_id)) {
    sanitized.contact_id = null;
  }
  if (!sanitized.contact_id) sanitized.contact_id = null;

  const { data, error } = await supabase
    .from("appointments")
    .insert({ ...sanitized, organization_id: profile.organization_id, booked_by: user.id })
    .select()
    .single();

  return { data, error: error?.message || null };
}

export async function updateAppointment(
  id: string,
  updates: Partial<Appointment>
): Promise<{ error: string | null }> {
  const supabase = createClient();

  // Sanitize UUID fields
  const sanitized = { ...updates };
  if (sanitized.assigned_to !== undefined && !UUID_RE.test(sanitized.assigned_to || "")) {
    sanitized.assigned_to = null;
  }
  if (sanitized.contact_id !== undefined && !UUID_RE.test(sanitized.contact_id || "")) {
    sanitized.contact_id = null;
  }

  const { error } = await supabase.from("appointments").update(sanitized).eq("id", id);
  return { error: error?.message || null };
}

export async function deleteAppointment(
  id: string
): Promise<{ error: string | null }> {
  const supabase = createClient();
  const { error } = await supabase.from("appointments").delete().eq("id", id);
  return { error: error?.message || null };
}
