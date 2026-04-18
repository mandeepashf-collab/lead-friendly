import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();
    if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

    const { data: numbers, error } = await supabase
      .from("phone_numbers")
      .select("*")
      .eq("organization_id", profile.organization_id)
      .eq("status", "active")
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const formatted = (numbers || []).map((n: Record<string, unknown>) => ({
      ...n,
      phone_number: n.number,
      vanity_format: formatNumber((n.number as string) || ""),
    }));

    return NextResponse.json({ numbers: formatted });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to load numbers" }, { status: 500 });
  }
}

function formatNumber(e164: string): string {
  const digits = e164.replace(/\D/g, "");
  if (digits.length === 11 && digits[0] === "1") {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return e164;
}
