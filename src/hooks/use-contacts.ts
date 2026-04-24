"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Contact } from "@/types/database";

interface UseContactsOptions {
  status?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

export function useContacts(options: UseContactsOptions = {}) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const {
    status,
    search,
    sortBy = "created_at",
    sortOrder = "desc",
    limit = 25,
    offset = 0,
  } = options;

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = createClient();

    let query = supabase
      .from("contacts")
      .select("*", { count: "exact" })
      .order(sortBy, { ascending: sortOrder === "asc" })
      .range(offset, offset + limit - 1);

    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    if (search) {
      query = query.or(
        `first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%,company_name.ilike.%${search}%`
      );
    }

    const { data, error: fetchError, count: totalCount } = await query;

    if (fetchError) {
      setError(fetchError.message);
    } else {
      setContacts(data || []);
      setCount(totalCount || 0);
    }
    setLoading(false);
  }, [status, search, sortBy, sortOrder, limit, offset]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  return { contacts, count, loading, error, refetch: fetchContacts };
}

export function useContact(id: string | null) {
  const [contact, setContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!id) {
      setContact(null);
      return;
    }
    setLoading(true);
    const supabase = createClient();
    supabase
      .from("contacts")
      .select("*")
      .eq("id", id)
      .single()
      .then(({ data }) => {
        setContact(data);
        setLoading(false);
      });
  }, [id]);

  return { contact, loading };
}

export async function createContact(
  contact: Partial<Contact>
): Promise<{ data: Contact | null; error: string | null }> {
  const supabase = createClient();

  // Get user's org
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  if (!profile) return { data: null, error: "No profile found" };

  const { data, error } = await supabase
    .from("contacts")
    .insert({ ...contact, organization_id: profile.organization_id })
    .select()
    .single();

  return { data, error: error?.message || null };
}

export async function updateContact(
  id: string,
  updates: Partial<Contact>
): Promise<{ error: string | null }> {
  const supabase = createClient();
  const { error } = await supabase.from("contacts").update(updates).eq("id", id);
  return { error: error?.message || null };
}

export async function deleteContact(
  id: string
): Promise<{ error: string | null }> {
  const supabase = createClient();
  const { error } = await supabase.from("contacts").delete().eq("id", id);
  return { error: error?.message || null };
}

// ─── Status sanitization ────────────────────────────────────────────────
// The contacts_status_check constraint permits only a fixed enum. Real CSVs
// routinely use aliases like "New Lead" or industry codes like "CI-A". We map
// known aliases to valid enum values; unknown values default to "new" and
// surface as a fallback tag (status-<slug>) so the value isn't lost.
const VALID_STATUS = new Set([
  "new", "contacted", "qualified", "proposal",
  "negotiation", "won", "lost", "do_not_contact",
]);

const STATUS_ALIASES: Record<string, string> = {
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

function slug(raw: string): string {
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
function sanitizeStatus(raw: string | undefined | null):
  { status: string; fallbackTag: string | null } {
  if (!raw) return { status: "new", fallbackTag: null };
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return { status: "new", fallbackTag: null };
  if (VALID_STATUS.has(normalized)) return { status: normalized, fallbackTag: null };
  if (STATUS_ALIASES[normalized]) return { status: STATUS_ALIASES[normalized], fallbackTag: null };
  // Unknown — preserve as tag
  return { status: "new", fallbackTag: `status-${slug(raw)}` };
}

/**
 * Bulk-import contacts from a CSV upload.
 *
 * Dedupes by (organization_id, phone) and (organization_id, email). We do
 * the dedupe client-side because a single UNIQUE index on contacts won't
 * cover "either phone OR email" — both can be null and either can collide.
 *
 * Returns { count: inserted, skipped: duplicates, error }.
 */
export async function bulkImportContacts(
  contacts: Partial<Contact>[],
  customFieldsByIndex?: Record<string, string>[],
): Promise<{
  count: number;
  skipped: number;
  error: string | null;
  insertedIds: (string | null)[];
  statusFallbackPairs: { rowIndex: number; tag: string }[];
}> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { count: 0, skipped: 0, error: "Not authenticated", insertedIds: [], statusFallbackPairs: [] };

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  if (!profile) return { count: 0, skipped: 0, error: "No profile found", insertedIds: [], statusFallbackPairs: [] };

  // Normalize phones to digits-only for matching (store original in phone field)
  const normalize = (s: string | undefined | null) =>
    s ? s.toLowerCase().trim() : "";
  const normalizePhone = (s: string | undefined | null) =>
    s ? s.replace(/\D/g, "") : "";

  // 1) Pull existing phones + emails for this org so we can dedupe
  const { data: existing } = await supabase
    .from("contacts")
    .select("phone, email")
    .eq("organization_id", profile.organization_id);

  const existingPhones = new Set<string>();
  const existingEmails = new Set<string>();
  (existing || []).forEach((r: { phone: string | null; email: string | null }) => {
    const p = normalizePhone(r.phone);
    const e = normalize(r.email);
    if (p) existingPhones.add(p);
    if (e) existingEmails.add(e);
  });

  // 2) Also dedupe within the CSV itself
  const seenPhones = new Set<string>();
  const seenEmails = new Set<string>();

  // Per-row alignment: dupeMask[i] = true if input row i was deduped and skipped.
  // We track this so the final insertedIds array aligns 1:1 with the input.
  const dupeMask: boolean[] = [];
  // rowIndex here refers to the ORIGINAL contacts[] input index.
  // We track fallback tags per-input-row so they align 1:1 with insertedIds
  // on the caller side.
  const statusFallbackPairs: { rowIndex: number; tag: string }[] = [];
  let skipped = 0;
  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < contacts.length; i++) {
    const c = contacts[i];
    const phoneKey = normalizePhone(c.phone as string | null | undefined);
    const emailKey = normalize(c.email as string | null | undefined);

    const isDupe =
      (phoneKey && (existingPhones.has(phoneKey) || seenPhones.has(phoneKey))) ||
      (emailKey && (existingEmails.has(emailKey) || seenEmails.has(emailKey)));

    if (isDupe) {
      dupeMask.push(true);
      skipped++;
      continue;
    }
    dupeMask.push(false);
    if (phoneKey) seenPhones.add(phoneKey);
    if (emailKey) seenEmails.add(emailKey);

    // Sanitize status: either pass through, map alias, or default + fallback tag
    const { status, fallbackTag } = sanitizeStatus(c.status as string | null | undefined);
    if (fallbackTag) {
      statusFallbackPairs.push({ rowIndex: i, tag: fallbackTag });
    }

    // Merge custom fields for this row into a JSONB blob
    const customFields = customFieldsByIndex?.[i];
    const customJson = customFields && Object.keys(customFields).length
      ? customFields
      : undefined;

    rows.push({
      ...c,
      status,
      custom_fields: customJson,
      organization_id: profile.organization_id,
      source: c.source || "csv_import",
    });
  }

  if (rows.length === 0) {
    // Fill insertedIds with nulls to match input length
    return {
      count: 0, skipped, error: null,
      insertedIds: dupeMask.map(() => null),
      statusFallbackPairs,
    };
  }

  // 3) Insert in chunks of 500 so we don't hit payload limits on huge uploads
  let inserted = 0;
  const insertedIdsLinear: string[] = [];
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { data, error } = await supabase.from("contacts").insert(chunk).select("id");
    if (error) {
      // Align what we got so far back onto the dupeMask; later entries are nulls.
      const aligned = alignInsertedIds(dupeMask, insertedIdsLinear);
      return { count: inserted, skipped, error: error.message, insertedIds: aligned, statusFallbackPairs };
    }
    inserted += data?.length || 0;
    for (const row of data ?? []) {
      insertedIdsLinear.push((row as { id: string }).id);
    }
  }

  return {
    count: inserted, skipped, error: null,
    insertedIds: alignInsertedIds(dupeMask, insertedIdsLinear),
    statusFallbackPairs,
  };
}

/**
 * Zip dupeMask (same length as input) with linearly-inserted IDs so the result
 * array aligns 1:1 with the input: insertedIds[i] === null iff input row i was
 * deduped, otherwise the inserted contact's UUID.
 */
function alignInsertedIds(dupeMask: boolean[], linearIds: string[]): (string | null)[] {
  const out: (string | null)[] = [];
  let cursor = 0;
  for (const isDupe of dupeMask) {
    if (isDupe) out.push(null);
    else out.push(linearIds[cursor++] ?? null);
  }
  return out;
}
