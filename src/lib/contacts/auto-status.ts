import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Auto-status hooks for contacts.
 *
 * These run as side effects from call-completion and appointment-booking
 * paths. They are best-effort: any failure is logged but never thrown,
 * so they cannot break the originating request.
 *
 * Phase 3b update: each hook now emits a `status_changed` row to
 * contact_events when (and ONLY when) the status was actually changed.
 * The `kind` parameter controls how the event is attributed in the
 * timeline:
 *   - 'webhook' → event came from an HTTP webhook (LiveKit, Telnyx,
 *                 Retell, Cal.com — the auth.uid() context isn't
 *                 available there)
 *   - 'system'  → event came from an internal completion path (e.g.
 *                 /api/webrtc/call-complete called by the agent worker)
 *
 * created_by_user_id is always null on these hooks since they run with
 * service-role credentials in webhook/server context.
 *
 * Race-safety: the UPDATE keeps its existing WHERE-status guard so two
 * concurrent webhooks can't both write. We then re-read the contact to
 * confirm whether THIS call is the one that flipped it before emitting,
 * preventing duplicate events on duplicate webhooks.
 *
 * The two hooks compose without races because their guards are
 * non-overlapping for the relevant statuses. If an appointment books
 * before the call's "completed" webhook lands, Hook B fires first →
 * status=appointment_booked → Hook A then sees status≠'new' and no-ops.
 */

export type AutoStatusKind = "webhook" | "system";

interface ContactStatusRow {
  organization_id: string;
  status: string;
}

/**
 * Best-effort emit of a status_changed event. Logs and swallows any
 * failure; never throws. Service-role context, so created_by_user_id
 * is null.
 */
async function emitStatusChangedEvent(
  supabase: SupabaseClient,
  args: {
    organizationId: string;
    contactId: string;
    fromStatus: string;
    toStatus: string;
    reason: string;
    kind: AutoStatusKind;
  },
): Promise<void> {
  try {
    const { error } = await supabase.from("contact_events").insert({
      organization_id: args.organizationId,
      contact_id: args.contactId,
      event_type: "status_changed",
      payload_json: {
        from: args.fromStatus,
        to: args.toStatus,
        reason: args.reason,
      },
      created_by_user_id: null,
      created_by_kind: args.kind,
    });
    if (error) {
      console.error("[auto-status] event emit failed:", error);
    }
  } catch (err) {
    console.error("[auto-status] event emit threw:", err);
  }
}

/**
 * After a call completes, upgrade the contact from 'new' to 'contacted'.
 * Never downgrades — if status is already qualified/proposal/etc, no-ops.
 *
 * Emits a 'status_changed' event with reason='auto:first_call_completed'
 * when (and only when) the UPDATE actually flipped the row.
 */
export async function applyContactedOnFirstCall(
  supabase: SupabaseClient,
  contactId: string | null | undefined,
  kind: AutoStatusKind = "system",
): Promise<void> {
  if (!contactId) return;
  try {
    // Read pre-state. If already past 'new', we no-op without
    // touching the row OR emitting an event.
    const { data: before, error: readErr } = await supabase
      .from("contacts")
      .select("organization_id, status")
      .eq("id", contactId)
      .single();
    if (readErr || !before) {
      console.error(
        "[auto-status] applyContactedOnFirstCall pre-read failed:",
        readErr,
      );
      return;
    }
    const beforeRow = before as ContactStatusRow;
    if (beforeRow.status !== "new") return;

    // Race-safe UPDATE: only writes if status is still 'new' at execute
    // time. If a concurrent webhook beat us to it, this affects 0 rows
    // and we skip the event.
    const { error: updateErr, count } = await supabase
      .from("contacts")
      .update({ status: "contacted" }, { count: "exact" })
      .eq("id", contactId)
      .eq("status", "new");
    if (updateErr) {
      console.error(
        "[auto-status] applyContactedOnFirstCall update failed:",
        updateErr,
      );
      return;
    }
    if (!count || count === 0) {
      // Lost the race; another process already flipped this. No event.
      return;
    }

    await emitStatusChangedEvent(supabase, {
      organizationId: beforeRow.organization_id,
      contactId,
      fromStatus: "new",
      toStatus: "contacted",
      reason: "auto:first_call_completed",
      kind,
    });
  } catch (err) {
    console.error("[auto-status] applyContactedOnFirstCall threw:", err);
  }
}

/**
 * After an appointment books for a contact, set status='appointment_booked'.
 * Skips if the contact is already in a terminal state (won/lost/do_not_contact)
 * or already 'appointment_booked' (idempotent on duplicate webhooks).
 *
 * Emits a 'status_changed' event with reason='auto:appointment_booked'
 * when (and only when) the UPDATE actually flipped the row.
 */
export async function applyAppointmentBookedStatus(
  supabase: SupabaseClient,
  contactId: string | null | undefined,
  kind: AutoStatusKind = "webhook",
): Promise<void> {
  if (!contactId) return;
  try {
    const TERMINAL_STATUSES = new Set([
      "won",
      "lost",
      "do_not_contact",
      "appointment_booked",
    ]);

    const { data: before, error: readErr } = await supabase
      .from("contacts")
      .select("organization_id, status")
      .eq("id", contactId)
      .single();
    if (readErr || !before) {
      console.error(
        "[auto-status] applyAppointmentBookedStatus pre-read failed:",
        readErr,
      );
      return;
    }
    const beforeRow = before as ContactStatusRow;
    if (TERMINAL_STATUSES.has(beforeRow.status)) return;

    const { error: updateErr, count } = await supabase
      .from("contacts")
      .update({ status: "appointment_booked" }, { count: "exact" })
      .eq("id", contactId)
      .not("status", "in", "(won,lost,do_not_contact,appointment_booked)");
    if (updateErr) {
      console.error(
        "[auto-status] applyAppointmentBookedStatus update failed:",
        updateErr,
      );
      return;
    }
    if (!count || count === 0) {
      // Lost the race — another process flipped to terminal between
      // our read and write. No event.
      return;
    }

    await emitStatusChangedEvent(supabase, {
      organizationId: beforeRow.organization_id,
      contactId,
      fromStatus: beforeRow.status,
      toStatus: "appointment_booked",
      reason: "auto:appointment_booked",
      kind,
    });
  } catch (err) {
    console.error("[auto-status] applyAppointmentBookedStatus threw:", err);
  }
}
