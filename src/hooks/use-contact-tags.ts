/**
 * Tag mutation hooks for contacts.
 *
 * All tag writes go through the Postgres RPCs added in migrations 017 & 018:
 *   - add_contact_tag(contact_id, tag)
 *   - remove_contact_tag(contact_id, tag)
 *   - bulk_add_contact_tags(pairs jsonb) -> returns inserted count
 *
 * The RPCs write to `contact_tags` (the normalized join table); a trigger
 * syncs `contacts.tags[]` so all existing readers keep working unchanged.
 *
 * Do NOT mutate `contacts.tags` directly from UI code — writes won't
 * populate `contact_tags`, which means the Stage 2 automation matcher
 * won't see them.
 */

import { createClient } from "@/lib/supabase/client";

export type TagSource =
  | "manual"
  | "csv_import"
  | "api"
  | "automation"
  | "eval_failure";

export interface BulkTagPair {
  contact_id: string;
  tag: string;
  source?: TagSource;
}

/**
 * Add a single tag to a contact. Idempotent — no-op if already present.
 * Returns true on success, false on error.
 */
export async function addContactTag(
  contactId: string,
  tag: string,
): Promise<boolean> {
  const trimmed = tag.trim();
  if (!trimmed) return false;

  const supabase = createClient();
  const { error } = await supabase.rpc("add_contact_tag", {
    p_contact_id: contactId,
    p_tag: trimmed,
  });
  if (error) {
    console.error("addContactTag failed:", error);
    return false;
  }
  return true;
}

/**
 * Remove a tag from a contact. Idempotent — no-op if not present.
 * Returns true on success, false on error.
 */
export async function removeContactTag(
  contactId: string,
  tag: string,
): Promise<boolean> {
  const trimmed = tag.trim();
  if (!trimmed) return false;

  const supabase = createClient();
  const { error } = await supabase.rpc("remove_contact_tag", {
    p_contact_id: contactId,
    p_tag: trimmed,
  });
  if (error) {
    console.error("removeContactTag failed:", error);
    return false;
  }
  return true;
}

/**
 * Bulk-add pairs in a single round trip. Designed for CSV import.
 * Returns the count of rows actually inserted (dupes / no-ops excluded).
 */
export async function bulkAddContactTags(
  pairs: BulkTagPair[],
): Promise<number> {
  if (!pairs.length) return 0;

  const supabase = createClient();
  const { data, error } = await supabase.rpc("bulk_add_contact_tags", {
    p_pairs: pairs,
  });
  if (error) {
    console.error("bulkAddContactTags failed:", error);
    return 0;
  }
  return (data as number) ?? 0;
}

/**
 * Helper: apply a full tag list to a contact by diffing against current.
 * Useful for the edit-dialog case where the user submits a final list.
 * Does one add per net-new tag and one remove per net-dropped tag.
 */
export async function setContactTags(
  contactId: string,
  currentTags: string[],
  nextTags: string[],
  source: TagSource = "manual",
): Promise<{ added: number; removed: number }> {
  const currentSet = new Set(currentTags.map((t) => t.trim()).filter(Boolean));
  const nextSet = new Set(nextTags.map((t) => t.trim()).filter(Boolean));

  const toAdd = [...nextSet].filter((t) => !currentSet.has(t));
  const toRemove = [...currentSet].filter((t) => !nextSet.has(t));

  if (toAdd.length) {
    await bulkAddContactTags(
      toAdd.map((tag) => ({ contact_id: contactId, tag, source })),
    );
  }
  for (const tag of toRemove) {
    await removeContactTag(contactId, tag);
  }

  return { added: toAdd.length, removed: toRemove.length };
}
