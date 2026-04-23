// src/app/api/agents/[id]/evals/generate/route.ts
//
// POST /api/agents/[id]/evals/generate  — body: { replaceLastBatch?: boolean }
//
// Reads the agent's system prompt + outbound/inbound prompts, calls Haiku to generate
// 5-10 starter evals, bulk-inserts them with a shared generation_batch_id.
//
// If replaceLastBatch=true, soft-deletes (is_active=false) any evals from the previous
// ai_generated batch for this agent that have NO eval_runs yet. Ones with runs are preserved.
//
// Stage 3 of P1 #3. See architecture memo §3.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { generateStarterEvals } from "@/lib/evals/generator";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const maxDuration = 60;

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: RouteContext) {
  const { id: agentId } = await ctx.params;

  let body: { replaceLastBatch?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    /* body is optional */
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // 1. Load agent (RLS enforces org membership)
  const { data: agent, error: agentErr } = await supabase
    .from("ai_agents")
    .select(
      "id, name, system_prompt, outbound_prompt, inbound_prompt, role, role_title, company_name",
    )
    .eq("id", agentId)
    .single();
  if (agentErr || !agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  // 2. Assemble the richest "instructions" text we can from the agent fields
  const instructions = [
    agent.system_prompt,
    agent.outbound_prompt,
    agent.inbound_prompt,
  ]
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    .join("\n\n---\n\n");

  if (!instructions || instructions.trim().length < 20) {
    return NextResponse.json(
      {
        error:
          "Agent has no meaningful instructions to generate evals from. Add a system prompt first.",
      },
      { status: 400 },
    );
  }

  // 3. Generate
  const result = await generateStarterEvals({
    agentName: agent.name,
    agentDescription:
      agent.role_title ?? agent.role ?? agent.company_name ?? null,
    systemPrompt: instructions,
  });

  if (result.error || result.evals.length === 0) {
    return NextResponse.json(
      { error: result.error || "Generator returned no valid evals" },
      { status: 502 },
    );
  }

  // 4. Optionally soft-delete the last batch's unused evals
  const service = createServiceClient();
  if (body.replaceLastBatch) {
    // Find most recent batch_id for this agent, then deactivate its evals that have no runs
    const { data: lastBatch } = await service
      .from("agent_evals")
      .select("generation_batch_id")
      .eq("agent_id", agentId)
      .eq("source", "ai_generated")
      .eq("is_active", true)
      .not("generation_batch_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastBatch?.generation_batch_id) {
      // Deactivate evals from that batch that have no eval_runs
      const { data: batchEvals } = await service
        .from("agent_evals")
        .select("id")
        .eq("generation_batch_id", lastBatch.generation_batch_id);

      const batchEvalIds = (batchEvals ?? []).map((e) => e.id);
      if (batchEvalIds.length > 0) {
        const { data: runsForBatch } = await service
          .from("eval_runs")
          .select("eval_id")
          .in("eval_id", batchEvalIds);
        const idsWithRuns = new Set((runsForBatch ?? []).map((r) => r.eval_id));
        const safeToDeactivate = batchEvalIds.filter((id) => !idsWithRuns.has(id));
        if (safeToDeactivate.length > 0) {
          await service
            .from("agent_evals")
            .update({ is_active: false })
            .in("id", safeToDeactivate);
        }
      }
    }
  }

  // 5. Bulk insert new batch
  const batchId = randomUUID();
  const rows = result.evals.map((e) => ({
    agent_id: agentId,
    title: e.title,
    criterion: e.criterion,
    source: "ai_generated" as const,
    generation_batch_id: batchId,
    created_by: user.id,
  }));

  const { data: inserted, error: insertErr } = await service
    .from("agent_evals")
    .insert(rows)
    .select();

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({
    generation_batch_id: batchId,
    evals: inserted,
    count: inserted?.length ?? 0,
    latency_ms: result.latencyMs,
  });
}
