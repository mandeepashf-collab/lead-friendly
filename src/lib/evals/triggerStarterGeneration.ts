// src/lib/evals/triggerStarterGeneration.ts
//
// Fire-and-forget helper to kick off starter eval generation after agent creation.
// Callers don't await this — evals appear in the background and are visible on
// the agent's Evals tab on the next visit.
//
// Usage (from server-side agent-creation flow):
//
//   import { triggerStarterEvalGeneration } from "@/lib/evals/triggerStarterGeneration";
//   const { data: newAgent, error } = await supabase.from("ai_agents").insert(...).select().single();
//   if (newAgent) void triggerStarterEvalGeneration(newAgent.id);
//
// Usage (from client-side flow, e.g. the new-agent page):
//
//   await fetch(`/api/agents/${agentId}/evals/generate`, { method: "POST" });
//   // or
//   triggerStarterEvalGenerationClient(agentId);

import { generateStarterEvals } from "./generator";
import { createServiceClient } from "@/lib/supabase/service";
import { randomUUID } from "crypto";

/**
 * Server-side helper — direct DB write. Does NOT go through the API route.
 * Safe to fire-and-forget: errors are swallowed but logged.
 */
export function triggerStarterEvalGeneration(agentId: string): Promise<void> {
  return _generate(agentId).catch((err) => {
    // Never throw — the agent was created successfully. Log for observability.
    console.warn(
      `[triggerStarterEvalGeneration] Failed for agent ${agentId}:`,
      err instanceof Error ? err.message : err,
    );
  });
}

async function _generate(agentId: string): Promise<void> {
  const service = createServiceClient();

  // Load agent
  const { data: agent, error: agentErr } = await service
    .from("ai_agents")
    .select(
      "id, name, system_prompt, outbound_prompt, inbound_prompt, role, role_title, company_name",
    )
    .eq("id", agentId)
    .single();

  if (agentErr || !agent) {
    console.warn(`[triggerStarterEvalGeneration] Agent ${agentId} not found`);
    return;
  }

  const instructions = [agent.system_prompt, agent.outbound_prompt, agent.inbound_prompt]
    .filter((s: unknown): s is string => typeof s === "string" && s.trim().length > 0)
    .join("\n\n---\n\n");

  if (!instructions || instructions.trim().length < 20) {
    // No useful instructions — silently skip. User can manually generate later.
    return;
  }

  const result = await generateStarterEvals({
    agentName: agent.name,
    agentDescription: agent.role_title ?? agent.role ?? agent.company_name ?? null,
    systemPrompt: instructions,
  });

  if (result.error || result.evals.length === 0) {
    console.warn(
      `[triggerStarterEvalGeneration] Generation failed for agent ${agentId}:`,
      result.error,
    );
    return;
  }

  const batchId = randomUUID();
  const rows = result.evals.map((e) => ({
    agent_id: agentId,
    title: e.title,
    criterion: e.criterion,
    source: "ai_generated" as const,
    generation_batch_id: batchId,
  }));

  const { error: insertErr } = await service.from("agent_evals").insert(rows);
  if (insertErr) {
    console.warn(
      `[triggerStarterEvalGeneration] Insert failed for agent ${agentId}:`,
      insertErr.message,
    );
    return;
  }
  console.log(
    `[triggerStarterEvalGeneration] Generated ${result.evals.length} starter evals for agent ${agentId}`,
  );
}

/**
 * Client-side helper — POSTs to the API route. Fire-and-forget variant.
 */
export function triggerStarterEvalGenerationClient(agentId: string): void {
  fetch(`/api/agents/${agentId}/evals/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
    keepalive: true, // allow request to survive page navigation
  }).catch((err) => {
    console.warn("[triggerStarterEvalGenerationClient] Failed:", err);
  });
}
