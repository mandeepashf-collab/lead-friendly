import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

/**
 * POST /api/appointments/book
 *
 * Internal API called from the voice webhook when the AI agent uses the
 * `book_meeting` tool during a live conversation. Trusts the caller via the
 * service-role key (same pattern as /api/calls/trigger campaign-launch mode).
 *
 * Body:
 *   organizationId: string
 *   contactId: string | null
 *   callId:    string | null      // link back to the originating call
 *   date:      "YYYY-MM-DD"
 *   startTime: "HH:MM" (24h)
 *   endTime:   "HH:MM" (24h)      // optional — defaults to +30min
 *   title:     string              // e.g. "Demo call"
 *   notes:     string              // optional
 *
 * Returns: { appointmentId } on success.
 */
export async function POST(req: NextRequest) {
  // Auth — this endpoint is only called by the voice webhook, which passes
  // the service-role key. Reject anything else.
  const authKey = req.headers.get("x-service-key");
  if (!authKey || authKey !== process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    organizationId?: string;
    contactId?: string | null;
    callId?: string | null;
    date?: string;
    startTime?: string;
    endTime?: string;
    title?: string;
    notes?: string;
  } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { organizationId, contactId, callId, date, startTime, title, notes } = body;
  if (!organizationId || !date || !startTime) {
    return NextResponse.json(
      { error: "organizationId, date, and startTime are required" },
      { status: 400 }
    );
  }

  // Validate date/time format up-front so we don't insert garbage
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(startTime)) {
    return NextResponse.json({ error: "startTime must be HH:MM" }, { status: 400 });
  }

  // Default end time to start + 30 minutes if not provided
  let endTime = body.endTime;
  if (!endTime) {
    const [h, m] = startTime.split(":").map(Number);
    const totalMin = h * 60 + m + 30;
    const eh = Math.floor(totalMin / 60) % 24;
    const em = totalMin % 60;
    endTime = `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
  }

  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  // Double-check the org owns the contact (defense in depth — the webhook
  // is trusted, but an encoded organizationId in client_state could have
  // been mangled).
  if (contactId) {
    const { data: c } = await supabase
      .from("contacts")
      .select("id, organization_id")
      .eq("id", contactId)
      .maybeSingle();
    if (c && c.organization_id !== organizationId) {
      return NextResponse.json(
        { error: "Contact does not belong to organization" },
        { status: 403 }
      );
    }
  }

  const { data: appt, error } = await supabase
    .from("appointments")
    .insert({
      organization_id: organizationId,
      contact_id: contactId ?? null,
      title: title || "Meeting",
      appointment_date: date,
      start_time: startTime,
      end_time: endTime,
      status: "scheduled",
      booked_by: "ai_agent",
      notes: notes || null,
    })
    .select()
    .single();

  if (error || !appt) {
    console.error("Appointment insert failed:", error);
    return NextResponse.json(
      { error: "Failed to create appointment", details: error?.message },
      { status: 500 }
    );
  }

  // Link the appointment back to the call if we have a callId (best-effort)
  if (callId) {
    try {
      await supabase
        .from("calls")
        .update({ appointment_id: appt.id })
        .eq("id", callId);
    } catch {
      /* the calls table may not have appointment_id yet — non-fatal */
    }
  }

  // Bump the campaign's appointment counter if this call belongs to a campaign
  if (callId) {
    const { data: callRow } = await supabase
      .from("calls")
      .select("campaign_id")
      .eq("id", callId)
      .maybeSingle();
    if (callRow?.campaign_id) {
      const { data: camp } = await supabase
        .from("campaigns")
        .select("total_appointments")
        .eq("id", callRow.campaign_id)
        .maybeSingle();
      if (camp) {
        await supabase
          .from("campaigns")
          .update({ total_appointments: (camp.total_appointments || 0) + 1 })
          .eq("id", callRow.campaign_id);
      }
    }
  }

  return NextResponse.json({ appointmentId: appt.id, ...appt });
}
