// src/components/contacts/ManageFieldsDrawer.tsx
//
// Right-side drawer for managing visible columns on the contacts table.
// Three sections:
//   1. "Fields in table" — currently visible, drag-reorderable, toggle on/off
//   2. "Add fields" — collapsible categories of available-but-hidden fields
//   3. "Add custom field" — opens AddCustomFieldDialog
//
// Draft state held locally; commits via saveTablePreferences on Apply.

"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { X, GripVertical, Lock, Plus, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import {
  type ColumnPref,
  CONTACTS_DEFAULT_COLUMNS,
  LOCKED_COLUMNS,
  saveTablePreferences,
} from "@/lib/contacts/table-preferences";
import {
  listCustomFields,
  type CustomFieldDefinition,
} from "@/lib/contacts/custom-fields";
import { useDragReorder, reorderArray } from "@/hooks/useDragReorder";
import { AddCustomFieldDialog } from "./AddCustomFieldDialog";

type Props = {
  /** Currently-applied column prefs from the contacts page. */
  currentColumns: ColumnPref[];
  onClose: () => void;
  /** Called after Apply succeeds with the new column array. */
  onApplied: (columns: ColumnPref[]) => void;
};

// Built-in fields, partitioned for the "Add fields" categories.
// field_keys here MUST match the database column names used in queries.
type BuiltInField = { field_key: string; label: string };
const BUILT_IN_CONTACT: BuiltInField[] = [
  { field_key: "name",         label: "Contact name" },  // locked
  { field_key: "email",        label: "Email" },
  { field_key: "phone",        label: "Phone" },
  { field_key: "company_name", label: "Company" },
];
const BUILT_IN_GENERAL: BuiltInField[] = [
  { field_key: "status",     label: "Status" },
  { field_key: "source",     label: "Source" },
  { field_key: "created_at", label: "Created" },
  { field_key: "updated_at", label: "Last activity" },
  { field_key: "lead_score", label: "Lead score" },
];
const BUILT_IN_ADDRESS: BuiltInField[] = [
  { field_key: "city",       label: "City" },
  { field_key: "state",      label: "State" },
  { field_key: "zip_code",   label: "Zip" },
  { field_key: "lender_name", label: "Lender (built-in)" },
  { field_key: "job_title",  label: "Job title" },
];

export function ManageFieldsDrawer({ currentColumns, onClose, onApplied }: Props) {
  const [draft, setDraft] = useState<ColumnPref[]>(currentColumns);
  const [customFields, setCustomFields] = useState<CustomFieldDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [openCategories, setOpenCategories] = useState<Set<string>>(
    new Set(["custom"])  // open "Custom fields" by default since that's the new feature
  );

  // Load custom field definitions
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const fields = await listCustomFields();
      if (!cancelled) {
        setCustomFields(fields);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleReorder = useCallback((from: number, to: number) => {
    setDraft((prev) => reorderArray(prev, from, to));
  }, []);

  const visibleFields = draft.filter((c) => c.visible);
  const { getItemProps, draggingIndex } = useDragReorder({
    itemCount: visibleFields.length,
    onReorder: (from, to) => {
      // Map indices back to draft array (visibleFields is filtered)
      const visibleKeys = visibleFields.map((c) => c.field_key);
      const moved = visibleKeys[from];
      const target = visibleKeys[to];
      const fromIdx = draft.findIndex((c) => c.field_key === moved);
      const toIdx = draft.findIndex((c) => c.field_key === target);
      if (fromIdx >= 0 && toIdx >= 0) handleReorder(fromIdx, toIdx);
    },
  });

  /** Set visibility of a field. If it's not yet in the draft, add it. */
  const setVisibility = useCallback((fieldKey: string, visible: boolean) => {
    setDraft((prev) => {
      const idx = prev.findIndex((c) => c.field_key === fieldKey);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], visible };
        return next;
      } else if (visible) {
        return [...prev, { field_key: fieldKey, visible: true }];
      }
      return prev;
    });
  }, []);

  /** Field-key → visibility lookup for "Add fields" toggles. */
  const visibilityMap = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const c of draft) m.set(c.field_key, c.visible);
    return m;
  }, [draft]);

  const isVisible = (key: string) => visibilityMap.get(key) === true;

  const handleApply = async () => {
    setSaving(true);
    setError(null);
    const { error: err } = await saveTablePreferences("contacts", draft);
    setSaving(false);
    if (err) {
      setError(err);
      return;
    }
    onApplied(draft);
  };

  const toggleCategory = (cat: string) => {
    setOpenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };

  const labelFor = (fieldKey: string): string => {
    if (fieldKey.startsWith("custom:")) {
      const slug = fieldKey.slice(7);
      return customFields.find((f) => f.field_key === slug)?.name
        ?? slug.replace(/_/g, " ");
    }
    return [...BUILT_IN_CONTACT, ...BUILT_IN_GENERAL, ...BUILT_IN_ADDRESS]
      .find((f) => f.field_key === fieldKey)?.label
      ?? fieldKey;
  };

  const highestSortOrder = useMemo(() => {
    return customFields.reduce((max, f) => Math.max(max, f.sort_order ?? 0), 0);
  }, [customFields]);

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
        onClick={() => !saving && onClose()}
      >
        <div
          className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto border-l border-zinc-800 bg-zinc-900 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-800 bg-zinc-900 px-5 py-3">
            <h2 className="text-sm font-semibold text-white">Manage fields</h2>
            <button onClick={onClose} disabled={saving} className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div className="px-5 py-4 space-y-5">
            {/* ── Fields in table ── */}
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-2">
                Fields in table
              </h3>
              <div className="space-y-1">
                {visibleFields.map((col, idx) => {
                  const locked = LOCKED_COLUMNS.has(col.field_key);
                  const isDragging = draggingIndex === idx;
                  return (
                    <div
                      key={col.field_key}
                      {...getItemProps(idx)}
                      className={
                        "flex items-center gap-2 rounded-lg border px-2.5 py-2 select-none " +
                        (isDragging
                          ? "border-indigo-500 bg-indigo-500/5 opacity-50"
                          : "border-zinc-800 bg-zinc-800/50 hover:border-zinc-700")
                      }
                    >
                      <GripVertical className="h-4 w-4 shrink-0 text-zinc-600 cursor-grab active:cursor-grabbing" />
                      <Toggle
                        checked={col.visible}
                        disabled={locked}
                        onChange={(v) => setVisibility(col.field_key, v)}
                      />
                      <span className="text-sm text-zinc-300 flex-1 truncate">
                        {labelFor(col.field_key)}
                      </span>
                      {locked && <Lock className="h-3 w-3 text-zinc-600" />}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* ── Add fields ── */}
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-2">
                Add fields
              </h3>

              <Category
                title="Contact"
                isOpen={openCategories.has("contact")}
                onToggle={() => toggleCategory("contact")}
              >
                {BUILT_IN_CONTACT.filter((f) => !isVisible(f.field_key)).map((f) => (
                  <FieldRow key={f.field_key} label={f.label}
                    onAdd={() => setVisibility(f.field_key, true)} />
                ))}
                {BUILT_IN_CONTACT.every((f) => isVisible(f.field_key)) && (
                  <EmptyHint />
                )}
              </Category>

              <Category
                title="General info"
                isOpen={openCategories.has("general")}
                onToggle={() => toggleCategory("general")}
              >
                {BUILT_IN_GENERAL.filter((f) => !isVisible(f.field_key)).map((f) => (
                  <FieldRow key={f.field_key} label={f.label}
                    onAdd={() => setVisibility(f.field_key, true)} />
                ))}
                {BUILT_IN_GENERAL.every((f) => isVisible(f.field_key)) && (
                  <EmptyHint />
                )}
              </Category>

              <Category
                title="Additional info"
                isOpen={openCategories.has("additional")}
                onToggle={() => toggleCategory("additional")}
              >
                {BUILT_IN_ADDRESS.filter((f) => !isVisible(f.field_key)).map((f) => (
                  <FieldRow key={f.field_key} label={f.label}
                    onAdd={() => setVisibility(f.field_key, true)} />
                ))}
                {BUILT_IN_ADDRESS.every((f) => isVisible(f.field_key)) && (
                  <EmptyHint />
                )}
              </Category>

              <Category
                title={loading ? "Custom fields…" : `Custom fields (${customFields.length})`}
                isOpen={openCategories.has("custom")}
                onToggle={() => toggleCategory("custom")}
              >
                {loading ? (
                  <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-zinc-600">
                    <Loader2 className="h-3 w-3 animate-spin" /> Loading…
                  </div>
                ) : customFields.length === 0 ? (
                  <p className="px-2 py-1.5 text-xs text-zinc-600">
                    No custom fields yet. Add one below.
                  </p>
                ) : (
                  customFields
                    .filter((f) => !isVisible(`custom:${f.field_key}`))
                    .map((f) => (
                      <FieldRow
                        key={f.id}
                        label={f.name}
                        sublabel={f.field_type}
                        onAdd={() => setVisibility(`custom:${f.field_key}`, true)}
                      />
                    ))
                )}
                {!loading && customFields.length > 0 &&
                  customFields.every((f) => isVisible(`custom:${f.field_key}`)) && <EmptyHint />}
              </Category>
            </section>

            {/* ── Add custom field ── */}
            <section>
              <button
                type="button"
                onClick={() => setShowAddDialog(true)}
                className="flex items-center gap-1.5 text-sm text-indigo-400 hover:text-indigo-300"
              >
                <Plus className="h-3.5 w-3.5" /> Add custom field
              </button>
            </section>

            {error && (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                {error}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 flex justify-end gap-2 border-t border-zinc-800 bg-zinc-900 px-5 py-3">
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
              onClick={handleApply}
              disabled={saving}
              className="flex h-8 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-3 w-3 animate-spin" />}
              Apply
            </button>
          </div>
        </div>
      </div>

      {showAddDialog && (
        <AddCustomFieldDialog
          highestSortOrder={highestSortOrder}
          onClose={() => setShowAddDialog(false)}
          onCreated={async () => {
            setShowAddDialog(false);
            // Refresh definitions
            const fields = await listCustomFields();
            setCustomFields(fields);
          }}
        />
      )}
    </>
  );
}

// ── Subcomponents ──

function Toggle({ checked, disabled, onChange }: { checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={
        "relative h-4 w-7 shrink-0 rounded-full transition-colors " +
        (disabled ? "opacity-40 cursor-not-allowed " : "cursor-pointer ") +
        (checked ? "bg-indigo-600" : "bg-zinc-700")
      }
    >
      <span
        className={
          "absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform " +
          (checked ? "translate-x-3.5" : "translate-x-0.5")
        }
      />
    </button>
  );
}

function Category({
  title, isOpen, onToggle, children,
}: {
  title: string; isOpen: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-1 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200"
      >
        {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {title}
      </button>
      {isOpen && <div className="ml-4 space-y-1">{children}</div>}
    </div>
  );
}

function FieldRow({ label, sublabel, onAdd }: { label: string; sublabel?: string; onAdd: () => void }) {
  return (
    <button
      type="button"
      onClick={onAdd}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-zinc-300 hover:bg-zinc-800/50"
    >
      <Plus className="h-3 w-3 shrink-0 text-zinc-500" />
      <span className="flex-1 truncate">{label}</span>
      {sublabel && <span className="text-[10px] uppercase text-zinc-600">{sublabel}</span>}
    </button>
  );
}

function EmptyHint() {
  return (
    <p className="px-2 py-1.5 text-xs text-zinc-600">All fields in this category are already shown.</p>
  );
}
