import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Get campaign to find its org + agent
  const { data: campaign, error: campErr } = await supabase
    .from("campaigns")
    .select("id, organization_id, ai_agent_id")
    .eq("id", id)
    .single();

  if (campErr || !campaign) {
    return NextResponse.json({ calls: [] }, { status: 404 });
  }

  // Fetch calls for this campaign's agent + org
  let query = supabase
    .from("calls")
    .select("*, contacts:contact_id(first_name, last_name)")
    .eq("organization_id", campaign.organization_id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (campaign.ai_agent_id) {
    query = query.eq("ai_agent_id", campaign.ai_agent_id);
  }

  const { data: calls, error: callsErr } = await query;

  if (callsErr) {
    return NextResponse.json({ calls: [], error: callsErr.message }, { status: 500 });
  }

  return NextResponse.json({ calls: calls || [] });
}
