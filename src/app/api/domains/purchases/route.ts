import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/domains/purchases — list the user's domain purchase records
export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("domain_purchases")
    .select("*")
    .eq("user_id", user.id)
    .order("purchased_at", { ascending: false });

  if (error) {
    // Table may not exist yet (migration not run) — return empty array gracefully
    if (error.code === "42P01") {
      return NextResponse.json([]);
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
