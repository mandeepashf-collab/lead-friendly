// src/app/api/agents/[id]/converted-annotations/route.ts
//
// GET /api/agents/[id]/converted-annotations
//
// Returns the set of annotation IDs that have already been converted to evals
// for this agent. Used by AnnotatePage to render "Converted ✓" on annotation
// rows instead of the "Convert to eval" button.
//
// Auth: RLS on agent_evals enforces org membership.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { id: agentId } = await ctx.params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("agent_evals")
    .select("source_ref, id")
    .eq("agent_id", agentId)
    .eq("source", "from_annotation")
    .eq("is_active", true)
    .not("source_ref", "is", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Map annotationId -> evalId for easy lookup
  const map: Record<string, string> = {};
  for (const row of data ?? []) {
    if (row.source_ref) map[row.source_ref] = row.id;
  }

  return NextResponse.json({
    convertedAnnotationIds: Object.keys(map),
    annotationToEval: map,
  });
}
