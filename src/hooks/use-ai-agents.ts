"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { AIAgent } from "@/types/database";

interface UseAIAgentsOptions {
  limit?: number;
  offset?: number;
}

interface AIAgentData {
  name: string;
  type: "inbound" | "outbound" | "sms" | "chat";
  voice_id?: string | null;
  system_prompt?: string | null;
  greeting_message?: string | null;
  retell_agent_id?: string | null;
  retell_llm_id?: string | null;
  cost_per_minute?: number | null;
  response_latency?: number | null;
  // Extended fields
  company_name?: string | null;
  max_duration_mins?: number | null;
  max_call_duration?: number | null;
  objection_handling?: string | null;
  closing_script?: string | null;
  knowledge_base?: string | null;
  transfer_number?: string | null;
  dnc_phrases?: string | null;
  personality?: number | null;
  role?: string | null;
  // Separate inbound/outbound scripts
  inbound_prompt?: string | null;
  inbound_greeting?: string | null;
  outbound_prompt?: string | null;
  outbound_greeting?: string | null;
  voice_speed?: number | null;
  webrtc_enabled?: boolean | null;
  settings?: Record<string, unknown> | null;
}

export function useAIAgents(options: UseAIAgentsOptions = {}) {
  const [agents, setAgents] = useState<AIAgent[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { limit = 50, offset = 0 } = options;

  const fetchAgents = useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = createClient();

    const { data, error: fetchError, count: totalCount } = await supabase
      .from("ai_agents")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (fetchError) {
      setError(fetchError.message);
    } else {
      setAgents(data || []);
      setCount(totalCount || 0);
    }
    setLoading(false);
  }, [limit, offset]);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  return { agents, count, loading, error, refetch: fetchAgents };
}

export function useAIAgent(id: string | null) {
  const [agent, setAgent] = useState<AIAgent | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!id) {
      setAgent(null);
      return;
    }
    setLoading(true);
    const supabase = createClient();
    supabase
      .from("ai_agents")
      .select("*")
      .eq("id", id)
      .single()
      .then(({ data }) => {
        setAgent(data);
        setLoading(false);
      });
  }, [id]);

  return { agent, loading };
}

export async function createAIAgent(
  agent: AIAgentData
): Promise<{ data: AIAgent | null; error: string | null }> {
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
    .from("ai_agents")
    .insert({
      ...agent,
      organization_id: profile.organization_id,
      status: "active",
      total_calls: 0,
    })
    .select()
    .single();

  return { data, error: error?.message || null };
}

export async function updateAIAgent(
  id: string,
  updates: Partial<AIAgentData>
): Promise<{ error: string | null }> {
  const supabase = createClient();
  const { error } = await supabase.from("ai_agents").update(updates).eq("id", id);
  return { error: error?.message || null };
}

export async function deleteAIAgent(
  id: string
): Promise<{ error: string | null }> {
  const supabase = createClient();
  const { error } = await supabase.from("ai_agents").delete().eq("id", id);
  return { error: error?.message || null };
}
