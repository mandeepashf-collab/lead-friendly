// src/components/contacts/AddCustomFieldDialog.tsx
//
// Modal for creating a new custom field definition.
// Type picker, name, auto-generated slug (editable), options for dropdown.

"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Plus, Loader2 } from "lucide-react";
import {
  upsertCustomField,
  nameToSlug,
} from "@/lib/contacts/custom-fields";
import type { CustomFieldType } from "@/lib/contacts/format-value";

type Props = {
  onClose: () => void;
  onCreated: () => void;
  /** Used to seed sort_order at the bottom of the existing list. */
  highestSortOrder?: number;
};

const FIELD_TYPE_OPTIONS: { value: CustomFieldType; label: string }[] = [
  { value: "text",     label: "Text" },
  { value: "textarea", label: "Long text" },
  { value: "number",   label: "Number" },
  { value: "currency", label: "Currency" },
  { value: "date",     label: "Date" },
  { value: "dropdown", label: "Single select" },
  { value: "checkbox", label: "Checkbox" },
  { value: "url",      label: "URL" },
  { value: "email",    label: "Email" },
  { value: "phone",    label: "Phone" },
];

export function AddCustomFieldDialog({ onClose, onCreated, highestSortOrder = 0 }: Props) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [fieldType, setFieldType] = useState<CustomFieldType>("text");
  const [options, setOptions] = useState<string[]>([""]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-generate slug from name (until the user touches the slug input)
  useEffect(() => {
    if (!slugTouched) setSlug(nameToSlug(name));
  }, [name, slugTouched]);

  const showOptions = fieldType === "dropdown";

  const handleSave = useCallback(async () => {
    setError(null);
    if (!name.trim()) { setError("Name is required"); return; }
    if (!slug.trim()) { setError("Slug is required"); return; }

    let optionList: Array<{ label: string; value: string }> | undefined;
    if (showOptions) {
      const trimmed = options.map((o) => o.trim()).filter(Boolean);
      if (trimmed.length === 0) { setError("Add at least one option"); return; }
      optionList = trimmed.map((o) => ({ label: o, value: o }));
    }

    setSaving(true);
    const { error: err } = await upsertCustomField({
      name: name.trim(),
      field_key: slug,
      field_type: fieldType,
      options: optionList,
      sort_order: highestSortOrder + 10,
    });
    setSaving(false);
    if (err) {
      setError(err);
      return;
    }
    onCreated();
  }, [name, slug, fieldType, options, showOptions, highestSortOrder, onCreated]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={() => !saving && onClose()}
    >
      <div
        className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3">
          <h3 className="text-sm font-semibold text-white">New custom field</h3>
          <button onClick={onClose} disabled={saving} className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs text-zinc-500">Type</label>
            <select
              value={fieldType}
              onChange={(e) => setFieldType(e.target.value as CustomFieldType)}
              disabled={saving}
              className="mt-1 h-9 w-full appearance-none rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-zinc-200 focus:border-indigo-500 focus:outline-none"
            >
              {FIELD_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-zinc-500">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
              autoFocus
              placeholder="e.g. Pre-approval Amount"
              className="mt-1 h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="text-xs text-zinc-500">
              Slug <span className="text-zinc-600">(auto-generated, editable)</span>
            </label>
            <input
              type="text"
              value={slug}
              onChange={(e) => { setSlug(e.target.value); setSlugTouched(true); }}
              disabled={saving}
              placeholder="pre_approval_amount"
              className="mt-1 h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm font-mono text-zinc-200 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
            />
            <p className="mt-1 text-[11px] text-zinc-600">
              Lowercase letters, digits, and underscores only.
            </p>
          </div>

          {showOptions && (
            <div>
              <label className="text-xs text-zinc-500">Options</label>
              <div className="mt-1 space-y-1.5">
                {options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={opt}
                      onChange={(e) => {
                        const next = [...options];
                        next[i] = e.target.value;
                        setOptions(next);
                      }}
                      placeholder={`Option ${i + 1}`}
                      disabled={saving}
                      className="h-8 flex-1 rounded-md border border-zinc-700 bg-zinc-800 px-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
                    />
                    {options.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setOptions(options.filter((_, j) => j !== i))}
                        disabled={saving}
                        className="rounded p-1.5 text-zinc-500 hover:bg-red-500/10 hover:text-red-400"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setOptions([...options, ""])}
                  disabled={saving}
                  className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300"
                >
                  <Plus className="h-3 w-3" /> Add option
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-zinc-800 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="h-8 rounded-lg border border-zinc-700 px-3 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex h-8 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-3 w-3 animate-spin" />}
            Save field
          </button>
        </div>
      </div>
    </div>
  );
}
