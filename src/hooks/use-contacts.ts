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
  contacts: Partial<Contact>[]
): Promise<{ count: number; skipped: number; error: string | null }> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { count: 0, skipped: 0, error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();

  if (!profile) return { count: 0, skipped: 0, error: "No profile found" };

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

  let skipped = 0;
  const rows = contacts
    .map((c) => {
      const phoneKey = normalizePhone(c.phone as string | null | undefined);
      const emailKey = normalize(c.email as string | null | undefined);

      if ((phoneKey && (existingPhones.has(phoneKey) || seenPhones.has(phoneKey))) ||
          (emailKey && (existingEmails.has(emailKey) || seenEmails.has(emailKey)))) {
        skipped++;
        return null;
      }
      if (phoneKey) seenPhones.add(phoneKey);
      if (emailKey) seenEmails.add(emailKey);
      return {
        ...c,
        organization_id: profile.organization_id,
        source: c.source || "csv_import",
      };
    })
    .filter(Boolean) as Record<string, unknown>[];

  if (rows.length === 0) {
    return { count: 0, skipped, error: null };
  }

  // 3) Insert in chunks of 500 so we don't hit payload limits on huge uploads
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { data, error } = await supabase.from("contacts").insert(chunk).select("id");
    if (error) {
      return { count: inserted, skipped, error: error.message };
    }
    inserted += data?.length || 0;
  }

  return { count: inserted, skipped, error: null };
}
