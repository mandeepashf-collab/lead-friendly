'use client';

// src/components/contacts/FieldSection.tsx
//
// Partitions a list of contact fields into populated vs empty and renders
// empty ones behind a <details> toggle. Editor nodes are rendered as-is —
// they bring their own inline labels (ContactField, custom selects, etc.),
// so this component does NOT render a <dt> label per field. `label` is
// used only as the partition key and React key.
//
// Stage 1.6.1 bug #3 — "populated first, empty collapsed".

import type { ReactNode } from 'react';

export type Field = {
  /** Used as React key + in the toggle summary count. */
  label: string;
  /** Used only to decide populated vs empty. The editor renders the actual
   * input/select (which brings its own label internally). */
  value: unknown;
  editor: ReactNode;
};

function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string' && v.trim() === '') return true;
  if (Array.isArray(v) && v.length === 0) return true;
  if (typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length === 0) return true;
  return false;
}

type FieldSectionProps = {
  title: string;
  fields: Field[];
  /** Hide the toggle even if empty fields exist. Used for display-only
   * sections where editing doesn't apply. */
  hideEmpty?: boolean;
};

export function FieldSection({ title, fields, hideEmpty = false }: FieldSectionProps) {
  const populated = fields.filter((f) => !isEmpty(f.value));
  const empty = fields.filter((f) => isEmpty(f.value));

  if (populated.length === 0 && empty.length === 0) return null;

  return (
    <div>
      <p className="text-xs font-semibold text-zinc-600 uppercase tracking-wide mb-2">{title}</p>

      {populated.length > 0 && (
        <div className="space-y-3">
          {populated.map((f) => (
            <div key={f.label}>{f.editor}</div>
          ))}
        </div>
      )}

      {!hideEmpty && empty.length > 0 && (
        <details className="mt-3 group">
          <summary className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-300 select-none list-none flex items-center gap-1 py-1">
            <span className="inline-block group-open:rotate-90 transition-transform">▸</span>
            <span className="group-open:hidden">
              Show {empty.length} empty field{empty.length === 1 ? '' : 's'}
            </span>
            <span className="hidden group-open:inline">Hide empty fields</span>
          </summary>
          <div className="space-y-3 mt-2 opacity-70">
            {empty.map((f) => (
              <div key={f.label}>{f.editor}</div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
