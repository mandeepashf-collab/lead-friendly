// src/lib/contacts/table-preferences.ts
//
// Per-user, per-table column visibility/order. Backed by the
// user_table_preferences table (RLS-enforced self-only).
//
// columns_json shape:
//   [{"field_key": "name", "visible": true}, {"field_key": "phone", "visible": true}, ...]
//
// `field_key` mapping:
//   - Built-in contact columns use their database column name:
//     name, email, phone, company_name, status, source, created_at, etc.
//   - Custom fields use "custom:<slug>" e.g. "custom:loan_amount"
//   - "name" is always present and locked-on (cannot be hidden)

import { createClient } from "@/lib/supabase/client";

export type ColumnPref = {
  field_key: string;
  visible: boolean;
};

export const CONTACTS_DEFAULT_COLUMNS: ColumnPref[] = [
  { field_key: "name",         visible: true },  // locked
  { field_key: "email",        visible: true },
  { field_key: "phone",        visible: true },
  { field_key: "company_name", visible: true },
  { field_key: "status",       visible: true },
  { field_key: "source",       visible: true },
  { field_key: "created_at",   visible: true },
];

export const LOCKED_COLUMNS = new Set(["name"]);

export async function getTablePreferences(
  tableName: string,
): Promise<ColumnPref[] | null> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("user_table_preferences")
    .select("columns_json")
    .eq("user_id", user.id)
    .eq("table_name", tableName)
    .maybeSingle();

  if (error) {
    console.error("[table-prefs] getTablePreferences:", error);
    return null;
  }
  if (!data) return null;
  return data.columns_json as ColumnPref[];
}

export async function saveTablePreferences(
  tableName: string,
  columns: ColumnPref[],
): Promise<{ error: string | null }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Defensive: name must be present and visible
  const hasName = columns.find((c) => c.field_key === "name");
  if (!hasName) {
    columns = [{ field_key: "name", visible: true }, ...columns];
  } else if (!hasName.visible) {
    columns = columns.map((c) =>
      c.field_key === "name" ? { ...c, visible: true } : c,
    );
  }

  const { error } = await supabase
    .from("user_table_preferences")
    .upsert(
      {
        user_id: user.id,
        table_name: tableName,
        columns_json: columns,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,table_name" },
    );
  return { error: error?.message ?? null };
}

export async function resetTablePreferences(
  tableName: string,
): Promise<{ error: string | null }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("user_table_preferences")
    .delete()
    .eq("user_id", user.id)
    .eq("table_name", tableName);
  return { error: error?.message ?? null };
}
