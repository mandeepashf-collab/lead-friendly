// src/app/api/evals/[evalId]/route.ts
//
// PATCH  /api/evals/[evalId]  — update title/criterion/is_active
// DELETE /api/evals/[evalId]  — SOFT delete (sets is_active=false) to preserve eval_runs history
//
// Auth: org membership enforced by RLS.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ evalId: string }> };

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const { evalId } = await ctx.params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { title?: string; criterion?: string; is_active?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (typeof body.title === "string") {
    const t = body.title.trim();
    if (t.length < 2 || t.length > 120) {
      return NextResponse.json(
        { error: "title must be 2-120 characters" },
        { status: 400 },
      );
    }
    updates.title = t;
  }
  if (typeof body.criterion === "string") {
    const c = body.criterion.trim();
    if (c.length < 10 || c.length > 2000) {
      return NextResponse.json(
        { error: "criterion must be 10-2000 characters" },
        { status: 400 },
      );
    }
    updates.criterion = c;
  }
  if (typeof body.is_active === "boolean") updates.is_active = body.is_active;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("agent_evals")
    .update(updates)
    .eq("id", evalId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ eval: data });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const { evalId } = await ctx.params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Soft-delete: preserves eval_runs history.
  // Use ?hard=true query param for a hard delete (cascades to eval_runs). Reserved for admin cleanups.
  const { searchParams } = new URL(_req.url);
  const hard = searchParams.get("hard") === "true";

  if (hard) {
    const { error } = await supabase.from("agent_evals").delete().eq("id", evalId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ deleted: true, hard: true });
  }

  const { data, error } = await supabase
    .from("agent_evals")
    .update({ is_active: false })
    .eq("id", evalId)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ eval: data, deleted: true, hard: false });
}
