// src/app/api/dashboard/activity/route.ts
//
// Stage 3.6.4 — Activity pulse feed endpoint.
// Thin wrapper over fetchActivityFeed. Auth + org-resolution mirrors
// /api/ai-minutes pattern (Stage 3.6.3 reference).

import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { fetchActivityFeed } from "@/lib/dashboard/activity";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const allCookies = cookieStore.getAll();
    console.error("[debug-activity] cookie names:", allCookies.map(c => c.name));
    console.error("[debug-activity] cookie count:", allCookies.length);

    const hdrs = await headers();
    const rawCookieHeader = hdrs.get("cookie") ?? "";
    console.error("[debug-activity] raw cookie header length:", rawCookieHeader.length);
    console.error("[debug-activity] raw cookie sb- names:", rawCookieHeader.split(";").map(s => s.trim().split("=")[0]).filter(n => n.startsWith("sb-")));

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    console.error("[debug-activity] auth result:", { hasUser: !!user, userId: user?.id, error: userError?.message });
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();
    if (!profile?.organization_id) {
      return NextResponse.json({ events: [] });
    }

    const events = await fetchActivityFeed(supabase, profile.organization_id);
    return NextResponse.json({ events });
  } catch (err) {
    console.error("[/api/dashboard/activity] error:", err);
    return NextResponse.json(
      { error: "Failed to fetch activity feed" },
      { status: 500 },
    );
  }
}
