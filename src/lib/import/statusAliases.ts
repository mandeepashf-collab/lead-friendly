// src/lib/import/statusAliases.ts
//
// Extracted from use-contacts.ts in Stage 1.6. The status preview UI in
// contacts/import-dialog.tsx needs read-only access to this map without
// pulling in the full hook module. Stage 1.7 (per-org overrides) will
// extend this module with a merge step.
//
// The contacts_status_check constraint permits only a fixed enum. Real CSVs
// routinely use aliases like "New Lead" or industry codes like "CI-A". We map
// known aliases to valid enum values; unknown values default to "new" and
// surface as a fallback tag (status-<slug>) so the value isn't lost.

export const VALID_STATUS: ReadonlySet<string> = new Set([
  "new", "contacted", "qualified", "proposal",
  "negotiation", "won", "lost", "do_not_contact",
]);

export const STATUS_ALIASES: Readonly<Record<string, string>> = {
  // new
  "new lead": "new", "fresh": "new", "lead": "new", "unworked": "new",
  // contacted
  "touched": "contacted", "reached": "contacted", "attempted": "contacted",
  // qualified
  "interested": "qualified", "warm": "qualified", "hot": "qualified",
  // proposal / negotiation
  "quoted": "proposal", "quote sent": "proposal",
  "negotiating": "negotiation", "in negotiation": "negotiation",
  // won
  "closed": "won", "converted": "won", "customer": "won", "client": "won",
  // lost
  "dead": "lost", "cold": "lost", "not interested": "lost", "disqualified": "lost",
  // DNC variants
  "dnc": "do_not_contact",
  "do not call": "do_not_contact",
  "do not contact": "do_not_contact",
};

export function slugStatus(raw: string): string {
  return raw.trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Given a CSV-provided status value, return { status, fallbackTag }.
 * - If the value matches the enum directly, use it.
 * - If it matches a known alias, use the mapped enum value.
 * - Otherwise, default to "new" and emit a fallbackTag "status-<slug>"
 *   so the original value is preserved as a tag on the contact.
 */
export function sanitizeStatus(
  raw: string | undefined | null,
): { status: string; fallbackTag: string | null } {
  if (!raw) return { status: "new", fallbackTag: null };
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return { status: "new", fallbackTag: null };
  if (VALID_STATUS.has(normalized)) return { status: normalized, fallbackTag: null };
  if (STATUS_ALIASES[normalized]) return { status: STATUS_ALIASES[normalized], fallbackTag: null };
  // Unknown — preserve as tag
  return { status: "new", fallbackTag: `status-${slugStatus(raw)}` };
}

/**
 * UI helper: does a raw status value resolve to the enum directly or via
 * alias? Returns the canonical enum value or null if unmapped. Used by the
 * importer status preview to show "will default to new" warnings.
 */
export function resolveStatusOrNull(raw: string): string | null {
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return null;
  if (VALID_STATUS.has(normalized)) return normalized;
  if (STATUS_ALIASES[normalized]) return STATUS_ALIASES[normalized];
  return null;
}
