"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Invoice, Contact } from "@/types/database";

interface UseInvoicesOptions {
  status?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  rate: number;
}

export interface InvoiceForm {
  contact_id: string;
  invoice_number: string;
  status: string;
  line_items: InvoiceLineItem[];
  subtotal: number;
  tax: number;
  total: number;
  due_date: string;
  notes?: string;
}

export function useInvoices(options: UseInvoicesOptions = {}) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const {
    status,
    sortBy = "created_at",
    sortOrder = "desc",
    limit = 25,
    offset = 0,
  } = options;

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = createClient();

    let query = supabase
      .from("invoices")
      .select("*", { count: "exact" })
      .order(sortBy, { ascending: sortOrder === "asc" })
      .range(offset, offset + limit - 1);

    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    const { data, error: fetchError, count: totalCount } = await query;

    if (fetchError) {
      setError(fetchError.message);
    } else {
      setInvoices(data || []);
      setCount(totalCount || 0);
    }
    setLoading(false);
  }, [status, sortBy, sortOrder, limit, offset]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  return { invoices, count, loading, error, refetch: fetchInvoices };
}

export function useContacts() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("contacts")
      .select("*")
      .order("first_name", { ascending: true })
      .then(({ data }) => {
        setContacts(data || []);
        setLoading(false);
      });
  }, []);

  return { contacts, loading };
}

export async function createInvoice(
  invoice: Partial<Invoice>
): Promise<{ data: Invoice | null; error: string | null }> {
  const supabase = createClient();

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
    .from("invoices")
    .insert({ ...invoice, organization_id: profile.organization_id })
    .select()
    .single();

  return { data, error: error?.message || null };
}

export async function updateInvoice(
  id: string,
  updates: Partial<Invoice>
): Promise<{ error: string | null }> {
  const supabase = createClient();
  const { error } = await supabase.from("invoices").update(updates).eq("id", id);
  return { error: error?.message || null };
}

export async function deleteInvoice(
  id: string
): Promise<{ error: string | null }> {
  const supabase = createClient();
  const { error } = await supabase.from("invoices").delete().eq("id", id);
  return { error: error?.message || null };
}

// Mock data functions for other payment features
export function useSubscriptions() {
  return {
    subscriptions: [],
    loading: false,
  };
}

export function usePaymentLinks() {
  return {
    links: [],
    loading: false,
  };
}

export function useTransactions() {
  return {
    transactions: [],
    loading: false,
  };
}

export function useProducts() {
  return {
    products: [],
    loading: false,
  };
}
