import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function DELETE(request: NextRequest) {
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

    const { phone_number } = await request.json();
    if (!phone_number) return NextResponse.json({ error: "phone_number required" }, { status: 400 });

    // Verify user owns this number
    const { data: owned } = await supabase
      .from("phone_numbers")
      .select("*")
      .eq("number", phone_number)
      .eq("organization_id", profile.organization_id)
      .single();

    if (!owned) return NextResponse.json({ error: "Number not found" }, { status: 404 });

    // Release from Telnyx
    try {
      const releaseResponse = await fetch(
        `https://api.telnyx.com/v2/phone_numbers/${encodeURIComponent(phone_number)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${process.env.TELNYX_API_KEY}` },
        }
      );
      if (!releaseResponse.ok) {
        console.error("Telnyx release failed for", phone_number, releaseResponse.status);
      }
    } catch (err) {
      console.error("Telnyx release error:", err);
    }

    // Mark as released in Supabase
    await supabase
      .from("phone_numbers")
      .update({ status: "released" })
      .eq("number", phone_number)
      .eq("organization_id", profile.organization_id);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Release failed" }, { status: 500 });
  }
}
