import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import {
  bookCalcomMeeting,
  buildCalcomStartISO,
  getCalcomIntegration,
} from "@/lib/calcom/client";

/**
 * POST /api/appointments/book
 *
 * Internal API called from the voice webhook when the AI agent uses the
 * `book_meeting` tool during a live conversation. Trusts the caller via the
 * service-role key (same pattern as /api/calls/trigger campaign-launch mode).
 *
 * Body (camelCase preferred; snake_case aliases accepted for the Python
 * agent worker which sends snake_case keys):
 *   organizationId / organization_id : string (optional if callId resolves it)
 *   contactId      / contact_id      : string | null (optional if callId resolves it)
 *   callId         / call_id         : string | null  // originating call
 *   date           : "YYYY-MM-DD"
 *   startTime      / start_time      : "HH:MM" (24h)
 *   endTime        / end_time        : "HH:MM" (24h)  // optional — defaults to +30min
 *   title          : string                            // e.g. "Demo call"
 *   notes          : string                            // optional
 *
 * When organizationId / contactId are not provided but callId is, the route
 * looks them up from the `calls` table. The Python agent worker only knows
 * call_id in its userdata, so this lookup keeps that worker payload minimal
 * and avoids Railway redeploys for schema drift.
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
    organization_id?: string;
    contactId?: string | null;
    contact_id?: string | null;
    callId?: string | null;
    call_id?: string | null;
    date?: string;
    startTime?: string;
    start_time?: string;
    endTime?: string;
    end_time?: string;
    title?: string;
    notes?: string;
  } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Accept either camelCase (TS callers, e.g. /api/voice/answer) or snake_case
  // (Python agent worker). Pick whichever is present.
  let organizationId: string | null = body.organizationId ?? body.organization_id ?? null;
  let contactId: string | null = body.contactId ?? body.contact_id ?? null;
  const callId = body.callId ?? body.call_id ?? null;
  const date = body.date;
  const startTime = body.startTime ?? body.start_time;
  const explicitEndTime = body.endTime ?? body.end_time;
  const { title, notes } = body;

  if (!date || !startTime) {
    return NextResponse.json(
      { error: "date and startTime are required" },
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
  let endTime = explicitEndTime;
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

  // If the caller didn't provide organizationId / contactId but did pass a
  // callId, look them up from the `calls` table. The Python agent worker
  // only has call_id in its userdata — resolving here keeps that worker
  // payload minimal and avoids Railway redeploys for schema drift.
  if (callId && (!organizationId || !contactId)) {
    const { data: callRow } = await supabase
      .from("calls")
      .select("organization_id, contact_id")
      .eq("id", callId)
      .maybeSingle();
    if (callRow) {
      if (!organizationId) organizationId = callRow.organization_id ?? null;
      if (!contactId) contactId = callRow.contact_id ?? null;
    }
  }

  if (!organizationId) {
    return NextResponse.json(
      { error: "organizationId is required (or pass callId so we can resolve it)" },
      { status: 400 }
    );
  }

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

  // Best-effort Cal.com sync — local appointment is authoritative regardless.
  // If the org has connected Cal.com, push a booking there too so it shows
  // up in their downstream calendar (Google/Outlook/Apple via Cal.com sync).
  try {
    const calcom = await getCalcomIntegration(organizationId);
    if (calcom && contactId) {
      const { data: contact } = await supabase
        .from("contacts")
        .select("first_name, last_name, email, phone")
        .eq("id", contactId)
        .maybeSingle();
      const { data: org } = await supabase
        .from("organizations")
        .select("default_timezone")
        .eq("id", organizationId)
        .maybeSingle();

      const attendeeName = contact
        ? [contact.first_name, contact.last_name].filter(Boolean).join(" ").trim() || "Lead"
        : "Lead";
      const attendeeEmail = (contact?.email as string | null) || "";
      const attendeePhone = (contact?.phone as string | null) || undefined;
      const timezone = (org?.default_timezone as string | null) || "America/Los_Angeles";

      // Cal.com requires an attendee email to send the confirmation. If we
      // don't have one, skip the sync rather than booking a confirmation
      // that goes nowhere.
      if (attendeeEmail) {
        const result = await bookCalcomMeeting({
          apiKey: calcom.apiKey,
          eventTypeId: calcom.eventTypeId,
          start: buildCalcomStartISO(date, startTime, timezone),
          attendeeName,
          attendeeEmail,
          attendeePhone,
          attendeeTimezone: timezone,
          notes: notes || undefined,
        });

        if (result.ok && result.uid) {
          // Reuse the existing google_event_id column as a generic external
          // event reference. Renaming would be a separate migration.
          await supabase
            .from("appointments")
            .update({ google_event_id: result.uid })
            .eq("id", appt.id);
        } else if (!result.ok) {
          console.error("[cal_com] booking sync failed:", result.error);
        }
      }
    }
  } catch (err) {
    // Catch everything — Cal.com sync is never allowed to break the
    // appointment response.
    console.error("[cal_com] sync threw unexpectedly:", err);
  }

  return NextResponse.json({ appointmentId: appt.id, ...appt });
}
