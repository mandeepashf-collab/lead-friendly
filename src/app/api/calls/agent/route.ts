import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { dial } from "@/lib/telnyx";
import { callLogger } from "@/lib/call-logger";

/**
 * POST /api/calls/agent
 *
 * AI-agent-dialed outbound call. This is the AI pipeline path —
 * the voice webhook handles the entire conversation autonomously.
 *
 * Body: {
 *   contactId?: string,
 *   contactPhone: string,
 *   fromNumber?: string,       // explicit caller ID, or auto-select from pool
 *   agentId?: string,          // AI agent to use
 *   campaignId?: string,
 *   organizationId?: string,   // required for campaign launches
 * }
 */
export async function POST(request: NextRequest) {
  let body: {
    contactId?: string;
    contactPhone?: string;
    fromNumber?: string;
    agentId?: string;
    campaignId?: string;
    organizationId?: string;
  } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { contactId, contactPhone, fromNumber, agentId, organizationId } = body;

  if (!contactPhone) {
    return NextResponse.json({ error: "contactPhone is required" }, { status: 400 });
  }
  if (!process.env.TELNYX_API_KEY || !process.env.TELNYX_APP_ID) {
    return NextResponse.json({ error: "Server misconfigured: missing Telnyx credentials" }, { status: 500 });
  }

  // Auth
  const campaignKey = request.headers.get("x-campaign-launch-key");
  const isCampaignLaunch = !!campaignKey
    && !!process.env.SUPABASE_SERVICE_ROLE_KEY
    && campaignKey === process.env.SUPABASE_SERVICE_ROLE_KEY;

  let orgId: string | null = null;

  if (isCampaignLaunch) {
    if (!organizationId) {
      return NextResponse.json({ error: "organizationId required for campaign launch" }, { status: 400 });
    }
    orgId = organizationId;
  } else {
    const userSupabase = await createClient();
    const { data: { user } } = await userSupabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { data: profile } = await userSupabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();
    if (!profile?.organization_id) {
      return NextResponse.json({ error: "Organization not found" }, { status: 400 });
    }
    orgId = profile.organization_id;
  }

  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const log = callLogger("agent-" + Date.now());

  const toNumber = contactPhone.startsWith("+") ? contactPhone : `+1${contactPhone.replace(/\D/g, "")}`;

  // Number Pool Rotation
  let from: string;
  if (fromNumber) {
    from = fromNumber.startsWith("+") ? fromNumber : `+1${fromNumber.replace(/\D/g, "")}`;
  } else {
    const { data: nums, error: numError } = await supabase
      .from("phone_numbers")
      .select("id, number, daily_used, daily_cap, rotation_order, last_used_at")
      .eq("organization_id", orgId!)
      .eq("status", "active")
      .order("rotation_order", { ascending: true })
      .order("last_used_at", { ascending: true, nullsFirst: true });

    if (numError || !nums || nums.length === 0) {
      return NextResponse.json(
        { error: "No active phone numbers available. Add a phone number in Settings > Phone Numbers." },
        { status: 400 },
      );
    }

    const underLimit = nums.filter(n => ((n.daily_used as number) || 0) < ((n.daily_cap as number) || 50));
    if (underLimit.length === 0) {
      return NextResponse.json(
        { error: "All phone numbers have reached their daily call limit." },
        { status: 429 },
      );
    }

    const selected = underLimit[0];
    from = selected.number as string;

    const newCount = ((selected.daily_used as number) || 0) + 1;
    const cap = (selected.daily_cap as number) || 50;
    await supabase
      .from("phone_numbers")
      .update({
        daily_used: newCount,
        last_used_at: new Date().toISOString(),
        ...(newCount >= cap ? { status: "exhausted" } : {}),
      })
      .eq("id", selected.id);

    log.info("number_pool_selected", { from, count: newCount, cap });
  }

  const { data: callRecord, error: dbError } = await supabase
    .from("calls")
    .insert({
      organization_id: orgId!,
      contact_id: contactId ?? null,
      direction: "outbound",
      status: "initiated",
      from_number: from,
      to_number: toNumber,
      ai_agent_id: agentId ?? null,
      call_mode: "ai_agent",
      initiated_by: "ai_agent",
      started_at: new Date().toISOString(),
    })
    .select("id, organization_id")
    .maybeSingle();

  if (dbError) {
    log.error("db_insert_failed", { error: dbError.message });
    return NextResponse.json({ error: `DB insert failed: ${dbError.message}` }, { status: 500 });
  }

  let callRecordId: string;
  if (!callRecord) {
    const { data: latest } = await supabase
      .from("calls")
      .select("id")
      .eq("organization_id", orgId!)
      .eq("to_number", toNumber)
      .eq("status", "initiated")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!latest) {
      return NextResponse.json({ error: "Call record not found after insert" }, { status: 500 });
    }
    callRecordId = latest.id;
  } else {
    callRecordId = callRecord.id;
  }

  log.info("call_record_created", { callRecordId });

  const dialResult = await dial({
    to: toNumber,
    from,
    clientState: {
      callRecordId,
      contactId: contactId ?? null,
      agentId: agentId ?? null,
      organizationId: orgId,
      callMode: "ai_agent",
      conversationHistory: [],
      turnCount: 0,
    },
  });

  if (!dialResult.ok) {
    log.error("telnyx_dial_failed", { status: dialResult.status, body: dialResult.raw.slice(0, 300) });
    await supabase.from("calls").update({ status: "failed" }).eq("id", callRecordId);
    await log.persist(supabase);
    return NextResponse.json(
      { error: "Telnyx call failed", details: dialResult.raw.slice(0, 300) },
      { status: 500 },
    );
  }

  const callControlId = (dialResult.data as { data?: { call_control_id?: string } })?.data?.call_control_id;

  await supabase
    .from("calls")
    .update({ telnyx_call_id: callControlId, status: "ringing" })
    .eq("id", callRecordId);

  log.info("call_dialing", { to: toNumber, callControlId });
  await log.persist(supabase);

  return NextResponse.json({
    callRecordId,
    telnyxCallControlId: callControlId,
    status: "ringing",
  });
}
