import { NextRequest, NextResponse } from "next/server";
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

    const { data: numbers } = await supabase
      .from("phone_numbers")
      .select("*")
      .eq("organization_id", profile.organization_id)
      .order("created_at", { ascending: false });

    // Stats
    const pool = numbers || [];
    const stats = {
      total: pool.length,
      active: pool.filter((n: Record<string, unknown>) => n.status === "active").length,
      exhausted: pool.filter((n: Record<string, unknown>) => n.status === "exhausted").length,
      totalCallsToday: pool.reduce((s: number, n: Record<string, unknown>) => s + ((n.daily_count as number) || 0), 0),
      availableCallsToday: pool.reduce((s: number, n: Record<string, unknown>) =>
        s + Math.max(0, ((n.daily_limit as number) || 50) - ((n.daily_count as number) || 0)), 0),
    };

    return NextResponse.json({ numbers: pool, stats });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
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

    const body = await req.json() as { phone_number: string; daily_limit?: number; label?: string };
    const { phone_number, daily_limit = 50, label } = body;

    if (!phone_number) return NextResponse.json({ error: "phone_number required" }, { status: 400 });

    // Clean the number
    const cleaned = phone_number.replace(/[^\d+]/g, "");
    if (cleaned.length < 10) return NextResponse.json({ error: "Invalid phone number" }, { status: 400 });

    // Check for duplicate
    const { data: existing } = await supabase
      .from("phone_numbers")
      .select("id")
      .eq("organization_id", profile.organization_id)
      .eq("number", cleaned)
      .single();

    if (existing) return NextResponse.json({ error: "Number already in pool" }, { status: 409 });

    const { data, error } = await supabase.from("phone_numbers").insert({
      organization_id: profile.organization_id,
      number: cleaned,
      friendly_name: label || cleaned,
      daily_cap: daily_limit,
      daily_used: 0,
      status: "active",
    }).select().single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ number: data }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
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

    const { id } = await req.json() as { id: string };
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    await supabase.from("phone_numbers").delete()
      .eq("id", id)
      .eq("organization_id", profile!.organization_id);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
