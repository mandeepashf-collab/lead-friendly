"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Opportunity } from "@/types/database";

interface UseOpportunitiesOptions {
  pipelineId?: string;
  limit?: number;
  offset?: number;
}

interface OpportunitiesByStage {
  [stageId: string]: {
    stage: {
      id: string;
      name: string;
      color: string;
      sort_order: number;
    };
    opportunities: (Opportunity & {
      contact?: { first_name: string | null; last_name: string | null };
      assigned_user?: { full_name: string | null };
      days_in_stage?: number;
    })[];
    count: number;
    totalValue: number;
  };
}

export function useOpportunities(pipelineId?: string, options: UseOpportunitiesOptions = {}) {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [groupedByStage, setGroupedByStage] = useState<OpportunitiesByStage>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOpportunities = useCallback(async () => {
    if (!pipelineId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const supabase = createClient();

    try {
      const { data: opportunities, error: fetchError } = await supabase
        .from("opportunities")
        .select(
          `
          *,
          contact:contacts(first_name, last_name),
          assigned_user:profiles(full_name)
        `
        )
        .eq("pipeline_id", pipelineId)
        .order("created_at", { ascending: false });

      if (fetchError) {
        setError(fetchError.message);
        setLoading(false);
        return;
      }

      const { data: stages, error: stagesError } = await supabase
        .from("pipeline_stages")
        .select("*")
        .eq("pipeline_id", pipelineId)
        .order("sort_order", { ascending: true });

      if (stagesError) {
        setError(stagesError.message);
        setLoading(false);
        return;
      }

      setOpportunities(opportunities || []);

      // Group by stage
      const grouped: OpportunitiesByStage = {};
      stages?.forEach((stage) => {
        grouped[stage.id] = {
          stage,
          opportunities: [],
          count: 0,
          totalValue: 0,
        };
      });

      (opportunities || []).forEach((opp) => {
        if (grouped[opp.stage_id]) {
          const daysInStage = Math.floor(
            (Date.now() - new Date(opp.created_at).getTime()) / (1000 * 60 * 60 * 24)
          );
          grouped[opp.stage_id].opportunities.push({
            ...opp,
            days_in_stage: daysInStage,
          });
          grouped[opp.stage_id].count += 1;
          grouped[opp.stage_id].totalValue += opp.value || 0;
        }
      });

      setGroupedByStage(grouped);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [pipelineId]);

  useEffect(() => {
    fetchOpportunities();
  }, [fetchOpportunities]);

  return { opportunities, groupedByStage, loading, error, refetch: fetchOpportunities };
}

export function usePipelines() {
  const [pipelines, setPipelines] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();

    (async () => {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("id", user.id)
        .single();

      if (!profile) {
        setLoading(false);
        return;
      }

      const { data, error: fetchError } = await supabase
        .from("pipelines")
        .select("*")
        .eq("organization_id", profile.organization_id)
        .order("sort_order", { ascending: true });

      if (fetchError) {
        setError(fetchError.message);
      } else {
        setPipelines(data || []);
      }
      setLoading(false);
    })();
  }, []);

  return { pipelines, loading, error };
}

export function usePipelineStages(pipelineId?: string) {
  const [stages, setStages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!pipelineId) {
      setLoading(false);
      return;
    }

    const supabase = createClient();
    supabase
      .from("pipeline_stages")
      .select("*")
      .eq("pipeline_id", pipelineId)
      .order("sort_order", { ascending: true })
      .then(({ data }) => {
        setStages(data || []);
        setLoading(false);
      });
  }, [pipelineId]);

  return { stages, loading };
}

export async function createOpportunity(opportunity: Partial<Opportunity>) {
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
    .from("opportunities")
    .insert({ ...opportunity, organization_id: profile.organization_id })
    .select()
    .single();

  return { data, error: error?.message || null };
}

export async function updateOpportunity(id: string, updates: Partial<Opportunity>) {
  const supabase = createClient();
  const { error } = await supabase.from("opportunities").update(updates).eq("id", id);
  return { error: error?.message || null };
}

export async function deleteOpportunity(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("opportunities").delete().eq("id", id);
  return { error: error?.message || null };
}

export async function moveOpportunity(id: string, newStageId: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from("opportunities")
    .update({ stage_id: newStageId })
    .eq("id", id);
  return { error: error?.message || null };
}
