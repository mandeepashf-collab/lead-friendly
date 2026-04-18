"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Campaign, AIAgent } from "@/types/database";

interface UseCampaignsOptions {
  status?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

export function useCampaigns(options: UseCampaignsOptions = {}) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const {
    status,
    sortBy = "created_at",
    sortOrder = "desc",
    limit = 25,
    offset = 0,
  } = options;

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = createClient();

    let query = supabase
      .from("campaigns")
      .select("*", { count: "exact" })
      .order(sortBy, { ascending: sortOrder === "asc" })
      .range(offset, offset + limit - 1);

    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    const { data, error: fetchError, count: totalCount } = await query;

    if (fetchError) {
      setError(fetchError.message);
    } else {
      setCampaigns(data || []);
      setCount(totalCount || 0);
    }
    setLoading(false);
  }, [status, sortBy, sortOrder, limit, offset]);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  return { campaigns, count, loading, error, refetch: fetchCampaigns };
}

export function useAIAgents() {
  const [agents, setAgents] = useState<AIAgent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("ai_agents")
      .select("*")
      .eq("status", "active")
      .order("name", { ascending: true })
      .then(({ data }) => {
        setAgents(data || []);
        setLoading(false);
      });
  }, []);

  return { agents, loading };
}

export async function createCampaign(
  campaign: Partial<Campaign>
): Promise<{ data: Campaign | null; error: string | null }> {
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
    .from("campaigns")
    .insert({ ...campaign, organization_id: profile.organization_id })
    .select()
    .single();

  return { data, error: error?.message || null };
}

export async function updateCampaign(
  id: string,
  updates: Partial<Campaign>
): Promise<{ error: string | null }> {
  const supabase = createClient();
  const { error } = await supabase
    .from("campaigns")
    .update(updates)
    .eq("id", id);
  return { error: error?.message || null };
}

export async function deleteCampaign(
  id: string
): Promise<{ error: string | null }> {
  const supabase = createClient();
  const { error } = await supabase.from("campaigns").delete().eq("id", id);
  return { error: error?.message || null };
}
