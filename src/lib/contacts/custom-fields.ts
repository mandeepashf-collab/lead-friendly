// src/lib/contacts/custom-fields.ts
//
// Client helpers for the custom_fields definitions table.
// Direct table access — RLS (custom_fields_read/write/upd/del) enforces
// org scoping via get_user_org_id() and is_org_in_scope(). No RPC needed.

import { createClient } from "@/lib/supabase/client";
import type { CustomFieldType } from "./format-value";

export type CustomFieldDefinition = {
  id: string;
  organization_id: string;
  name: string;
  field_key: string;
  field_type: CustomFieldType;
  applies_to: string[] | null;
  is_required: boolean | null;
  default_value: string | null;
  options: Array<string | { label: string; value: string }> | null;
  sort_order: number | null;
  is_active: boolean | null;
  created_at: string;
};

const FIELD_TYPES: CustomFieldType[] = [
  "text", "number", "date", "dropdown", "checkbox",
  "url", "email", "phone", "textarea", "currency",
];
const SLUG_RE = /^[a-z][a-z0-9_]*$/;

export async function listCustomFields(): Promise<CustomFieldDefinition[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("custom_fields")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) {
    console.error("[custom-fields] listCustomFields:", error);
    return [];
  }
  return (data ?? []) as CustomFieldDefinition[];
}

export type UpsertCustomFieldInput = {
  id?: string | null;
  name: string;
  field_key: string;
  field_type: CustomFieldType;
  options?: CustomFieldDefinition["options"];
  is_required?: boolean;
  sort_order?: number;
};

export async function upsertCustomField(
  input: UpsertCustomFieldInput,
): Promise<{ data: CustomFieldDefinition | null; error: string | null }> {
  // Client-side validation. RLS will reject foreign-org writes anyway, but
  // shape errors deserve a clear message before round-tripping.
  if (!input.name?.trim()) return { data: null, error: "Name is required" };
  if (!SLUG_RE.test(input.field_key)) {
    return { data: null, error: "Slug must start with a lowercase letter and contain only lowercase letters, digits, and underscores" };
  }
  if (!FIELD_TYPES.includes(input.field_type)) {
    return { data: null, error: `Invalid field type: ${input.field_type}` };
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated" };
  const { data: profile } = await supabase
    .from("profiles").select("organization_id").eq("id", user.id).single();
  if (!profile) return { data: null, error: "No profile found" };

  const row = {
    organization_id: profile.organization_id,
    name: input.name.trim(),
    field_key: input.field_key,
    field_type: input.field_type,
    options: input.options ?? [],
    is_required: input.is_required ?? false,
    sort_order: input.sort_order ?? 0,
    is_active: true,
    applies_to: ["contacts"],
  };

  if (input.id) {
    const { data, error } = await supabase
      .from("custom_fields")
      .update(row)
      .eq("id", input.id)
      .select().single();
    return { data: data as CustomFieldDefinition | null, error: error?.message ?? null };
  } else {
    const { data, error } = await supabase
      .from("custom_fields")
      .insert(row)
      .select().single();
    return { data: data as CustomFieldDefinition | null, error: error?.message ?? null };
  }
}

export async function archiveCustomField(id: string): Promise<{ error: string | null }> {
  const supabase = createClient();
  const { error } = await supabase
    .from("custom_fields")
    .update({ is_active: false })
    .eq("id", id);
  return { error: error?.message ?? null };
}

/** Auto-generate a slug from a human-readable name. */
export function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_\s-]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/^[^a-z]+/, "")
    .replace(/_+$/, "");
}
