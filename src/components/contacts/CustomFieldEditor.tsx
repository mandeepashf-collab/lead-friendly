// src/components/contacts/CustomFieldEditor.tsx
//
// Inline editor for one custom field on the contact detail page.
// One component, all field types. Saves write directly to
// contacts.custom_fields JSONB (RLS lets the user update their own org's
// contacts).

"use client";

import { useState, useCallback } from "react";
import { Check, Loader2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  formatCustomFieldValue,
  humanizeFieldKey,
  type CustomFieldType,
} from "@/lib/contacts/format-value";
import type { CustomFieldDefinition } from "@/lib/contacts/custom-fields";

type Props = {
  contactId: string;
  /** Current full custom_fields blob (we update by replacing it). */
  currentBlob: Record<string, unknown> | null | undefined;
  definition: CustomFieldDefinition;
  onSaved?: (newBlob: Record<string, unknown>) => void;
};

export function CustomFieldEditor({
  contactId,
  currentBlob,
  definition,
  onSaved,
}: Props) {
  const rawValue = currentBlob?.[definition.field_key];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(rawValueToDraft(rawValue));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const label = definition.name || humanizeFieldKey(definition.field_key);
  const display = formatCustomFieldValue(rawValue, {
    fieldKey: definition.field_key,
    fieldType: definition.field_type,
  });

  const handleSave = useCallback(async () => {
    setError(null);
    setSaving(true);
    try {
      const next: Record<string, unknown> = { ...(currentBlob ?? {}) };
      const trimmed = draft.trim();

      if (trimmed === "") {
        delete next[definition.field_key];
      } else {
        next[definition.field_key] = coerceForType(trimmed, definition.field_type);
      }

      const supabase = createClient();
      const { error: dbErr } = await supabase
        .from("contacts")
        .update({ custom_fields: next })
        .eq("id", contactId);
      if (dbErr) throw new Error(dbErr.message);

      onSaved?.(next);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [contactId, currentBlob, definition.field_key, definition.field_type, draft, onSaved]);

  const handleCancel = () => {
    setDraft(rawValueToDraft(rawValue));
    setError(null);
    setEditing(false);
  };

  if (!editing) {
    return (
      <div
        className="flex flex-col cursor-pointer group"
        onClick={() => {
          setDraft(rawValueToDraft(rawValue));
          setEditing(true);
        }}
        role="button"
        aria-label={`Edit ${label}`}
      >
        <dt className="text-xs text-zinc-600">{label}</dt>
        <dd className="text-sm text-zinc-300 break-words group-hover:text-white transition-colors">
          {display}
        </dd>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-zinc-600">{label}</label>
      <div className="flex items-start gap-1.5">
        <FieldInput
          value={draft}
          fieldType={definition.field_type}
          options={definition.options}
          onChange={setDraft}
          autoFocus
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-md bg-indigo-600 p-1.5 text-white hover:bg-indigo-700 disabled:opacity-50"
          aria-label="Save"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={saving}
          className="rounded-md border border-zinc-700 p-1.5 text-zinc-400 hover:bg-zinc-800 disabled:opacity-50"
          aria-label="Cancel"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {error && <p className="text-xs text-red-400 mt-0.5">{error}</p>}
    </div>
  );
}

function FieldInput({
  value,
  fieldType,
  options,
  onChange,
  autoFocus,
}: {
  value: string;
  fieldType: CustomFieldType;
  options: CustomFieldDefinition["options"];
  onChange: (v: string) => void;
  autoFocus?: boolean;
}) {
  const baseInputClass =
    "flex-1 rounded-md border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none";

  if (fieldType === "textarea") {
    return (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={autoFocus}
        rows={3}
        className={baseInputClass + " resize-y min-h-[60px]"}
      />
    );
  }

  if (fieldType === "dropdown") {
    const opts = normalizeOptions(options);
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={autoFocus}
        className={baseInputClass + " appearance-none"}
      >
        <option value="">— select —</option>
        {opts.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    );
  }

  if (fieldType === "checkbox") {
    const checked = value === "true";
    return (
      <button
        type="button"
        onClick={() => onChange(checked ? "false" : "true")}
        className={
          "flex-1 rounded-md border px-2.5 py-1.5 text-sm text-left " +
          (checked
            ? "border-indigo-500 bg-indigo-500/10 text-indigo-300"
            : "border-zinc-700 bg-zinc-800 text-zinc-400")
        }
      >
        {checked ? "Yes" : "No"}
      </button>
    );
  }

  const inputType: string =
    fieldType === "number" || fieldType === "currency" ? "number"
    : fieldType === "date" ? "date"
    : fieldType === "url" ? "url"
    : fieldType === "email" ? "email"
    : fieldType === "phone" ? "tel"
    : "text";

  return (
    <input
      type={inputType}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      autoFocus={autoFocus}
      className={baseInputClass}
    />
  );
}

function normalizeOptions(
  options: CustomFieldDefinition["options"],
): Array<{ label: string; value: string }> {
  if (!options || !Array.isArray(options)) return [];
  return options.map((o) => {
    if (typeof o === "string") return { label: o, value: o };
    return { label: o.label, value: o.value };
  });
}

function rawValueToDraft(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function coerceForType(raw: string, type: CustomFieldType): unknown {
  if (type === "number" || type === "currency") {
    const cleaned = raw.replace(/[$,%\s]/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : raw;
  }
  if (type === "checkbox") return raw === "true";
  return raw;
}
