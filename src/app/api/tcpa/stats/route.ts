import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOverrideStats } from "@/lib/tcpa/audit";

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthenticated" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  if (!profile?.organization_id) {
    return NextResponse.json({ ok: false, error: "No organization" }, { status: 400 });
  }

  const { data: org } = await supabase
    .from("organizations")
    .select("default_timezone")
    .eq("id", profile.organization_id)
    .single();

  try {
    const stats = await getOverrideStats({
      supabase,
      orgId: profile.organization_id,
      orgTimezone: org?.default_timezone ?? "America/New_York",
    });
    return NextResponse.json({ ok: true, stats });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
