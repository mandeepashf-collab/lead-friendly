import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Auto-status hooks for contacts.
 *
 * These run as side effects from call-completion and appointment-booking
 * paths. They are best-effort: any failure is logged but never thrown,
 * so they cannot break the originating request.
 *
 * The two hooks are designed to compose without race conditions:
 *
 *   applyContactedOnFirstCall — only writes if status='new'.
 *     Will not overwrite anything else.
 *
 *   applyAppointmentBookedStatus — only writes if status NOT IN
 *     (won, lost, do_not_contact, appointment_booked). Idempotent on
 *     duplicate webhooks.
 *
 * Order doesn't matter because the guards on each hook are non-overlapping
 * for the relevant statuses. If an appointment books before the call's
 * "completed" webhook lands, Hook B fires first → status=appointment_booked
 * → Hook A then sees status≠'new' and no-ops.
 */

/**
 * After a call completes, upgrade the contact from 'new' to 'contacted'.
 * Never downgrades — if status is already qualified/proposal/etc, no-ops.
 */
export async function applyContactedOnFirstCall(
  supabase: SupabaseClient,
  contactId: string | null | undefined,
): Promise<void> {
  if (!contactId) return;
  try {
    const { error } = await supabase
      .from("contacts")
      .update({ status: "contacted" })
      .eq("id", contactId)
      .eq("status", "new");
    if (error) {
      console.error("[auto-status] applyContactedOnFirstCall failed:", error);
    }
  } catch (err) {
    console.error("[auto-status] applyContactedOnFirstCall threw:", err);
  }
}

/**
 * After an appointment books for a contact, set status='appointment_booked'.
 * Skips if the contact is already in a terminal state (won/lost/do_not_contact)
 * or already 'appointment_booked' (idempotent on duplicate webhooks).
 */
export async function applyAppointmentBookedStatus(
  supabase: SupabaseClient,
  contactId: string | null | undefined,
): Promise<void> {
  if (!contactId) return;
  try {
    const { error } = await supabase
      .from("contacts")
      .update({ status: "appointment_booked" })
      .eq("id", contactId)
      .not("status", "in", "(won,lost,do_not_contact,appointment_booked)");
    if (error) {
      console.error("[auto-status] applyAppointmentBookedStatus failed:", error);
    }
  } catch (err) {
    console.error("[auto-status] applyAppointmentBookedStatus threw:", err);
  }
}
