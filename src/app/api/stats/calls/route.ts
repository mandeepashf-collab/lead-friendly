/**
 * GET /api/stats/calls
 *
 * Single source of truth for call statistics. Reads from the
 * call_stats_by_org view so Dashboard, Call Logs, AI Agents, Campaigns,
 * and Billing all show the same numbers.
 *
 * Query params:
 *   agentId  — if provided, returns per-agent stats from call_stats_by_agent
 *
 * Response:
 * {
 *   total_calls, calls_today, calls_this_month, calls_last_7d,
 *   answered_calls, appointments_booked, appointments_booked_30d,
 *   total_duration_seconds, total_minutes, minutes_this_month,
 *   avg_duration_seconds, answer_rate_pct
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const ZERO = {
  total_calls: 0,
  calls_today: 0,
  calls_this_month: 0,
  calls_last_7d: 0,
  answered_calls: 0,
  appointments_booked: 0,
  appointments_booked_30d: 0,
  total_duration_seconds: 0,
  total_minutes: 0,
  minutes_this_month: 0,
  avg_duration_seconds: 0,
  answer_rate_pct: 0,
};

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json(ZERO);
    }

    const orgId = profile.organization_id;
    const agentId = req.nextUrl.searchParams.get("agentId");

    if (agentId) {
      // Per-agent stats
      const { data, error } = await supabase
        .from("call_stats_by_agent")
        .select(
          "total_calls, answered_calls, appointments_booked, total_duration_seconds, total_minutes",
        )
        .eq("organization_id", orgId)
        .eq("ai_agent_id", agentId)
        .maybeSingle();

      if (error) {
        // View may not exist yet (migration not applied) — return zeros
        console.warn("[stats/calls] per-agent view error:", error.message);
        return NextResponse.json({
          total_calls: 0,
          answered_calls: 0,
          appointments_booked: 0,
          total_duration_seconds: 0,
          total_minutes: 0,
        });
      }

      return NextResponse.json(
        data ?? {
          total_calls: 0,
          answered_calls: 0,
          appointments_booked: 0,
          total_duration_seconds: 0,
          total_minutes: 0,
        },
      );
    }

    // Org-level stats
    const { data, error } = await supabase
      .from("call_stats_by_org")
      .select("*")
      .eq("organization_id", orgId)
      .maybeSingle();

    if (error) {
      console.warn(
        "[stats/calls] org view error — falling back to zeros:",
        error.message,
      );
      return NextResponse.json(ZERO);
    }

    return NextResponse.json(data ?? ZERO);
  } catch (err) {
    console.error("[stats/calls] unhandled error:", err);
    return NextResponse.json(ZERO);
  }
}
