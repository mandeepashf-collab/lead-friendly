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

    const { data: org } = await supabase
      .from("organizations")
      .select("ai_minutes_used, ai_minutes_limit")
      .eq("id", profile.organization_id)
      .single();

    if (!org) return NextResponse.json({ used: 0, limit: 500 });

    return NextResponse.json({
      used: (org as Record<string, unknown>).ai_minutes_used || 0,
      limit: (org as Record<string, unknown>).ai_minutes_limit || 500,
    });
  } catch (err) {
    return NextResponse.json({ used: 0, limit: 500 });
  }
}
