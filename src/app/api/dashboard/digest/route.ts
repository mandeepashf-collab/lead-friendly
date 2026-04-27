// src/app/api/dashboard/digest/route.ts
//
// Stage 3.6.4 — Daily AI digest endpoint.
// GET → fetchOrGenerateDigest → JSON { text, generated_at, cached }.
// Haiku call + caching live in src/lib/dashboard/digest.ts (template:
// src/lib/evals/judge.ts:14-75 SDK pattern, NOT raw fetch).

import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { fetchOrGenerateDigest } from "@/lib/dashboard/digest";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();
    if (!profile?.organization_id) {
      return NextResponse.json(
        { error: "No organization on profile" },
        { status: 404 },
      );
    }

    const result = await fetchOrGenerateDigest(supabase, profile.organization_id);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[/api/dashboard/digest] error:", err);
    return NextResponse.json(
      { error: "Failed to generate digest" },
      { status: 500 },
    );
  }
}
