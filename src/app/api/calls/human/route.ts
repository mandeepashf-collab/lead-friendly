import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { dial } from "@/lib/telnyx";
import { callLogger } from "@/lib/call-logger";

/**
 * POST /api/calls/human
 *
 * Path A — Callback bridge for human-dialed calls.
 *
 * Flow:
 *   1. Server dials the REP's phone first (or the user's registered number)
 *   2. When rep picks up, Telnyx fires call.answered → our webhook dials the CONTACT
 *   3. When contact picks up, webhook bridges both legs
 *
 * This gives the rep a real two-way PSTN conversation without needing
 * WebRTC, browser mic access, or any client-side audio infrastructure.
 *
 * Body: {
 *   contactId: string,
 *   contactPhone: string,
 *   fromNumber: string,        // caller ID shown to the contact
 *   repPhone?: string,         // rep's phone to ring first (defaults to fromNumber — will need user settings)
 * }
 */
export async function POST(request: NextRequest) {
  let body: {
    contactId?: string;
    contactPhone?: string;
    fromNumber?: string;
    repPhone?: string;
  } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { contactId, contactPhone, fromNumber, repPhone } = body;

  if (!contactPhone) {
    return NextResponse.json({ error: "contactPhone is required" }, { status: 400 });
  }

  if (!process.env.TELNYX_API_KEY || !process.env.TELNYX_APP_ID) {
    return NextResponse.json({ error: "Server misconfigured: missing Telnyx credentials" }, { status: 500 });
  }

  // Auth
  const userSupabase = await createClient();
  const { data: { user } } = await userSupabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await userSupabase
    .from("profiles")
    .select("organization_id, phone")
    .eq("id", user.id)
    .single();

  if (!profile?.organization_id) {
    return NextResponse.json({ error: "Organization not found" }, { status: 400 });
  }

  const orgId = profile.organization_id;

  // Rep phone: explicit param > user profile phone. NEVER fall back to
  // fromNumber — that's a Lead Friendly-owned Telnyx number, not the rep's
  // cell, and silently using it causes the "call rings nobody" bug where the
  // UI shows a live timer but no phone actually rang.
  const repPhoneNumber = repPhone || profile.phone;
  if (!repPhoneNumber) {
    return NextResponse.json(
      {
        error: "Rep phone not configured. Add your phone in Settings.",
        code: "REP_PHONE_MISSING",
      },
      { status: 400 },
    );
  }

  // Service-role client for DB writes
  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const log = callLogger("human-" + Date.now());

  // Normalize numbers
  const toNumber = contactPhone.startsWith("+") ? contactPhone : `+1${contactPhone.replace(/\D/g, "")}`;
  const repNum = repPhoneNumber.startsWith("+") ? repPhoneNumber : `+1${repPhoneNumber.replace(/\D/g, "")}`;

  // Number pool (pick a from number if not provided)
  let from: string;
  if (fromNumber) {
    from = fromNumber.startsWith("+") ? fromNumber : `+1${fromNumber.replace(/\D/g, "")}`;
  } else {
    const { data: nums } = await supabase
      .from("phone_numbers")
      .select("id, number, daily_used, daily_cap, rotation_order, last_used_at")
      .eq("organization_id", orgId)
      .eq("status", "active")
      .order("rotation_order", { ascending: true })
      .order("last_used_at", { ascending: true, nullsFirst: true });

    const available = (nums || []).filter(n => ((n.daily_used as number) || 0) < ((n.daily_cap as number) || 50));
    if (available.length === 0) {
      return NextResponse.json({ error: "No active phone numbers available" }, { status: 400 });
    }
    from = available[0].number as string;

    // Increment counter AND stamp last_used_at — critical for rotation
    await supabase
      .from("phone_numbers")
      .update({
        daily_used: ((available[0].daily_used as number) || 0) + 1,
        last_used_at: new Date().toISOString(),
      })
      .eq("id", available[0].id);
  }

  // Create call record
  const { data: callRecord, error: dbError } = await supabase
    .from("calls")
    .insert({
      organization_id: orgId,
      contact_id: contactId ?? null,
      direction: "outbound",
      status: "initiated",
      from_number: from,
      to_number: toNumber,
      rep_phone: repNum,
      call_mode: "callback_bridge",
      initiated_by: "human",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .maybeSingle();

  if (dbError || !callRecord) {
    log.error("db_insert_failed", { error: dbError?.message });
    return NextResponse.json({ error: `DB insert failed: ${dbError?.message}` }, { status: 500 });
  }

  log.info("call_record_created", { callRecordId: callRecord.id });

  // Dial Leg A: call the REP first
  const dialResult = await dial({
    to: repNum,
    from: from,
    clientState: {
      callRecordId: callRecord.id,
      contactId: contactId ?? null,
      organizationId: orgId,
      callMode: "callback_bridge",
      bridgeTarget: toNumber,
      bridgeFrom: from,
      legA: true,
    },
  });

  if (!dialResult.ok) {
    log.error("telnyx_dial_failed", { status: dialResult.status, body: dialResult.raw.slice(0, 300) });
    await supabase.from("calls").update({ status: "failed" }).eq("id", callRecord.id);
    return NextResponse.json(
      { error: "Failed to initiate call", details: dialResult.raw.slice(0, 300) },
      { status: 500 },
    );
  }

  const callControlId = (dialResult.data as { data?: { call_control_id?: string } })?.data?.call_control_id;

  await supabase
    .from("calls")
    .update({ telnyx_call_id: callControlId, status: "ringing" })
    .eq("id", callRecord.id);

  log.info("leg_a_dialing", { to: repNum, callControlId });
  await log.persist(supabase);

  return NextResponse.json({
    callRecordId: callRecord.id,
    telnyxCallControlId: callControlId,
    status: "ringing",
    mode: "callback_bridge",
  });
}
