import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase
      .from("profiles").select("organization_id").eq("id", user.id).single();
    if (!profile) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // `used` comes from call_stats_by_org (the unified view that sums actual
    // calls.duration_seconds), matching what Dashboard / Call Logs / Billing
    // already display. The `organizations.ai_minutes_used` wallet column is
    // not incremented by the call pipeline and was returning stale 0s.
    // `limit` still comes from organizations.ai_minutes_limit.
    const [statsRes, orgRes] = await Promise.all([
      supabase
        .from("call_stats_by_org")
        .select("minutes_this_month")
        .eq("organization_id", profile.organization_id)
        .maybeSingle(),
      supabase
        .from("organizations")
        .select("ai_minutes_limit")
        .eq("id", profile.organization_id)
        .maybeSingle(),
    ]);

    const used = (statsRes.data as { minutes_this_month?: number } | null)
      ?.minutes_this_month ?? 0;
    const limit = (orgRes.data as { ai_minutes_limit?: number } | null)
      ?.ai_minutes_limit ?? 500;

    return NextResponse.json({ used, limit });
  } catch (err) {
    return NextResponse.json({ used: 0, limit: 500 });
  }
}
