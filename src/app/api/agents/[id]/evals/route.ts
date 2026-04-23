// src/app/api/agents/[id]/evals/route.ts
//
// GET  /api/agents/[id]/evals  — list active evals for an agent
// POST /api/agents/[id]/evals  — create a new eval
//
// Auth: user must belong to the agent's org (enforced by RLS).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: RouteContext) {
  const { id: agentId } = await ctx.params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const includeInactive = searchParams.get("includeInactive") === "true";

  let query = supabase
    .from("agent_evals")
    .select(
      `
        id, agent_id, title, criterion, source, source_ref,
        generation_batch_id, is_active, created_at, updated_at
      `,
    )
    .eq("agent_id", agentId)
    .order("created_at", { ascending: false });

  if (!includeInactive) query = query.eq("is_active", true);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Also fetch the latest eval_run per eval (for the summary column)
  const evalIds = (data ?? []).map((e) => e.id);
  let latestRuns: Record<string, { verdict: string; reason: string; created_at: string }> = {};
  if (evalIds.length > 0) {
    const { data: runs } = await supabase
      .from("eval_runs")
      .select("eval_id, verdict, reason, created_at")
      .in("eval_id", evalIds)
      .order("created_at", { ascending: false });
    for (const r of runs ?? []) {
      if (!latestRuns[r.eval_id]) {
        latestRuns[r.eval_id] = {
          verdict: r.verdict,
          reason: r.reason,
          created_at: r.created_at,
        };
      }
    }
  }

  return NextResponse.json({
    evals: (data ?? []).map((e) => ({ ...e, latest_run: latestRuns[e.id] ?? null })),
  });
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  const { id: agentId } = await ctx.params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: {
    title?: string;
    criterion?: string;
    source?: "user" | "ai_generated" | "from_annotation";
    source_ref?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const title = (body.title ?? "").trim();
  const criterion = (body.criterion ?? "").trim();
  const source = body.source ?? "user";
  const source_ref = body.source_ref ?? null;

  // Client-side validation mirrors DB CHECK constraints for friendlier errors
  if (title.length < 2 || title.length > 120) {
    return NextResponse.json(
      { error: "title must be 2-120 characters" },
      { status: 400 },
    );
  }
  if (criterion.length < 10 || criterion.length > 2000) {
    return NextResponse.json(
      { error: "criterion must be 10-2000 characters" },
      { status: 400 },
    );
  }
  if (!["user", "ai_generated", "from_annotation"].includes(source)) {
    return NextResponse.json({ error: "invalid source" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("agent_evals")
    .insert({
      agent_id: agentId,
      title,
      criterion,
      source,
      source_ref,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ eval: data }, { status: 201 });
}
