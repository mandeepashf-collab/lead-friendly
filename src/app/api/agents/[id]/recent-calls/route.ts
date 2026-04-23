// src/app/api/agents/[id]/recent-calls/route.ts
//
// GET /api/agents/[id]/recent-calls?limit=20
//
// Returns the most recent calls for this agent that have a completed transcript.
// Purpose-built for the Evals tab's "Run against which call?" dropdown — we need
// a guaranteed shape and filter on transcript availability, which the general
// /api/calls endpoint may not provide.
//
// Auth: RLS via the calls table + join to ai_agents (enforces org membership).

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
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10) || 20));

  // Find calls for this agent with a transcript.
  // Inner join to call_transcripts filters out calls without one.
  const { data, error } = await supabase
    .from("calls")
    .select(
      `
        id,
        created_at,
        started_at,
        duration_seconds,
        from_number,
        to_number,
        call_transcripts!inner(id, duration_seconds)
      `,
    )
    .eq("ai_agent_id", agentId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const calls = (data ?? []).map((c: any) => ({
    id: c.id,
    created_at: c.created_at,
    started_at: c.started_at,
    duration_seconds:
      c.duration_seconds ??
      (Array.isArray(c.call_transcripts) && c.call_transcripts[0]?.duration_seconds) ??
      null,
    from_number: c.from_number,
    to_number: c.to_number,
    has_transcript: true,
  }));

  return NextResponse.json({ calls });
}
