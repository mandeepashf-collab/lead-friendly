"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Workflow } from "@/types/database";

interface UseWorkflowsOptions {
  status?: string;
  limit?: number;
  offset?: number;
}

interface WorkflowStep {
  type: "send_sms" | "send_email" | "wait" | "update_status" | "assign_agent" | "condition";
  [key: string]: unknown;
}

interface WorkflowData {
  name: string;
  description: string | null;
  status: "active" | "paused";
  trigger_type: string;
  steps: any[];
}

export function useWorkflows(options: UseWorkflowsOptions = {}) {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { status, limit = 50, offset = 0 } = options;

  const fetchWorkflows = useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = createClient();

    let query = supabase
      .from("workflows")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    const { data, error: fetchError, count: totalCount } = await query;

    if (fetchError) {
      setError(fetchError.message);
    } else {
      setWorkflows(data || []);
      setCount(totalCount || 0);
    }
    setLoading(false);
  }, [status, limit, offset]);

  useEffect(() => {
    fetchWorkflows();
  }, [fetchWorkflows]);

  return { workflows, count, loading, error, refetch: fetchWorkflows };
}

export function useWorkflow(id: string | null) {
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!id) {
      setWorkflow(null);
      return;
    }
    setLoading(true);
    const supabase = createClient();
    supabase
      .from("workflows")
      .select("*")
      .eq("id", id)
      .single()
      .then(({ data }) => {
        setWorkflow(data);
        setLoading(false);
      });
  }, [id]);

  return { workflow, loading };
}

export async function createWorkflow(
  workflow: WorkflowData
): Promise<{ data: Workflow | null; error: string | null }> {
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

  const { data, error } = await supabase
    .from("workflows")
    .insert({
      ...workflow,
      organization_id: profile.organization_id,
      total_runs: 0,
    })
    .select()
    .single();

  return { data, error: error?.message || null };
}

export async function updateWorkflow(
  id: string,
  updates: Partial<WorkflowData>
): Promise<{ error: string | null }> {
  const supabase = createClient();
  const { error } = await supabase.from("workflows").update(updates).eq("id", id);
  return { error: error?.message || null };
}

export async function deleteWorkflow(
  id: string
): Promise<{ error: string | null }> {
  const supabase = createClient();
  const { error } = await supabase.from("workflows").delete().eq("id", id);
  return { error: error?.message || null };
}
