/**
 * Canonical contact-status definitions for Lead Friendly.
 *
 * Single source of truth. ALL contact-status UI must import from here:
 *   - contacts/page.tsx (filter tabs + StatusBadge)
 *   - people/page.tsx (filter dropdown + ContactStatusBadge)
 *   - people/[id]/page.tsx (status dropdown in right column)
 *   - contacts/contact-dialog.tsx (Add/Edit Contact <select>)
 *   - contacts/contact-detail.tsx (status pill in header)
 *   - automations/workflow-builder.tsx ("Set Status" action <select>)
 *   - components/contacts/BulkChangeStatusMenu.tsx (Phase 1b bulk popover)
 *
 * The 9 valid status values are enforced at the database layer by the
 * contacts_status_check constraint (migration 031). If you add or remove
 * a status here, you MUST also update that constraint AND the
 * v_valid_statuses array inside the bulk_update_contact_status RPC.
 *
 * Ordering rationale: workflow-progressive — leads enter as `new`, get
 * `contacted`, become `qualified`, then book an appointment, get a
 * proposal, enter negotiation, end as won/lost. `do_not_contact` is
 * a terminal opt-out state placed last.
 */

export interface ContactStatusOption {
  value: string;
  label: string;
  /** Tailwind classes for badge background + text + border. */
  color: string;
}

export const CONTACT_STATUSES: readonly ContactStatusOption[] = [
  { value: "new",                label: "New",                color: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  { value: "contacted",          label: "Contacted",          color: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  { value: "qualified",          label: "Qualified",          color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  { value: "appointment_booked", label: "Appointment Booked", color: "bg-violet-500/10 text-violet-400 border-violet-500/20" },
  { value: "proposal",           label: "Proposal",           color: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
  { value: "negotiation",        label: "Negotiation",        color: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" },
  { value: "won",                label: "Won",                color: "bg-green-500/10 text-green-400 border-green-500/20" },
  { value: "lost",               label: "Lost",               color: "bg-red-500/10 text-red-400 border-red-500/20" },
  { value: "do_not_contact",     label: "Do Not Contact",     color: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20" },
] as const;

/** Bare value list — for places that just need an array of status strings,
 *  e.g. <select> options in dialogs that title-case inline. */
export const CONTACT_STATUS_VALUES: readonly string[] = CONTACT_STATUSES.map((s) => s.value);

/** value -> label */
export const CONTACT_STATUS_LABEL: Record<string, string> = Object.fromEntries(
  CONTACT_STATUSES.map((s) => [s.value, s.label]),
);

/** value -> Tailwind classes */
export const CONTACT_STATUS_COLOR: Record<string, string> = Object.fromEntries(
  CONTACT_STATUSES.map((s) => [s.value, s.color]),
);

/** Filter-tab variant with an "All" pseudo-status prepended. Used by
 *  contacts/page.tsx and people/page.tsx for their filter UIs. */
export const CONTACT_STATUS_FILTER_OPTIONS: readonly ContactStatusOption[] = [
  { value: "all", label: "All", color: "" },
  ...CONTACT_STATUSES,
];

/** Defensive lookup. Returns the matching option, or the `new` entry as a
 *  neutral fallback. Important: we DO NOT fall back to `contacted` (amber)
 *  because that silently mislabels novel statuses as "Contacted". */
export function getStatusOption(status: string | null | undefined): ContactStatusOption {
  if (!status) return CONTACT_STATUSES[0];
  return CONTACT_STATUSES.find((s) => s.value === status) ?? CONTACT_STATUSES[0];
}

/** Title-case a status value for display, e.g. "appointment_booked" ->
 *  "Appointment Booked". Used by places that don't go through CONTACT_STATUS_LABEL
 *  because they want to render the raw value (e.g. contact-detail header). */
export function formatStatusLabel(status: string | null | undefined): string {
  const v = (status || "new").replace(/_/g, " ");
  return v.replace(/\b\w/g, (c) => c.toUpperCase());
}
