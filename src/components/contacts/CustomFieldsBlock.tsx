'use client';

// src/components/contacts/CustomFieldsBlock.tsx
//
// Read-only render of contact.custom_fields for the contact detail page.
// Smart formatter by key name (decision #2 in Stage 1.6 log):
//   loan_amount  → $414,122
//   age          → 74
//   *_rate       → NN%
//   *_date       → formatted date
//   default      → raw

import React from "react";

type CustomFieldsBlockProps = {
  customFields: Record<string, unknown> | null | undefined;
};

// Keys handled elsewhere in the UI — don't duplicate them here.
// - ai_instructions: already rendered by detail page as a textarea
// - cell_phone: lives in contacts.cell_phone column post-migration 020;
//   any legacy row still carrying it in custom_fields should NOT show twice.
const RESERVED_CUSTOM_KEYS = new Set<string>(['ai_instructions', 'cell_phone']);

export function CustomFieldsBlock({ customFields }: CustomFieldsBlockProps) {
  if (!customFields) return null;

  const entries = Object.entries(customFields)
    .filter(([k]) => !RESERVED_CUSTOM_KEYS.has(k))
    .sort(([a], [b]) => a.localeCompare(b));

  if (entries.length === 0) return null;

  return (
    <div>
      <p className="text-xs font-semibold text-zinc-600 uppercase tracking-wide mb-2">Custom Fields</p>
      <dl className="space-y-2">
        {entries.map(([key, value]) => (
          <div key={key} className="flex flex-col">
            <dt className="text-xs text-zinc-600">{humanizeKey(key)}</dt>
            <dd className="text-sm text-zinc-300 break-words">{formatValue(key, value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function humanizeKey(key: string): string {
  return key
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Smart formatter by key name (decision #2 in locked log).
 * Keys are matched by suffix/containment so "loan_amount" and "loanAmount"
 * and "home_loan_amount" all format as currency.
 */
function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';

  const keyLower = key.toLowerCase();
  const num = toFiniteNumber(value);

  // Currency keys
  if (num !== null && (keyLower.includes('amount') || keyLower.includes('price') || keyLower.includes('revenue') || keyLower.includes('cost') || keyLower.includes('salary') || keyLower.includes('income'))) {
    return `$${num.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  }

  // Integer-y keys (age, count, years)
  if (num !== null && (keyLower === 'age' || keyLower.endsWith('_age') || keyLower.includes('count') || keyLower.includes('years') || keyLower.includes('quantity'))) {
    return String(Math.round(num));
  }

  // Percent keys
  if (num !== null && (keyLower.includes('percent') || keyLower.includes('rate'))) {
    return `${num.toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;
  }

  // Date-ish keys — try ISO parse
  if (typeof value === 'string' && (keyLower.includes('date') || keyLower.includes('_at'))) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    }
  }

  // Fallback
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function toFiniteNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const trimmed = v.trim();
    if (!trimmed) return null;
    // Strip $, commas, % for display-only coercion on legacy string rows
    const cleaned = trimmed.replace(/[$,%\s]/g, '');
    if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
