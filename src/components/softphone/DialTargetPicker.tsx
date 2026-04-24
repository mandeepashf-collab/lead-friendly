'use client';

// src/components/softphone/DialTargetPicker.tsx
//
// Popover UI for selecting which number to dial when a contact has both
// phone and cell_phone populated. Decision #3 in locked log: user always
// picks, no auto-select timeout.

import { useEffect, useRef } from 'react';

export type DialTarget = {
  label: 'Primary' | 'Cell';
  number: string;
  field: 'phone' | 'cell_phone';
};

type DialTargetPickerProps = {
  targets: DialTarget[];
  onSelect: (target: DialTarget) => void;
  onCancel: () => void;
};

export function DialTargetPicker({ targets, onSelect, onCancel }: DialTargetPickerProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onCancel();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onCancel]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Choose number to dial"
      className="absolute z-50 mt-1 w-56 rounded-md border border-zinc-700 bg-zinc-900 shadow-lg"
    >
      <div className="px-3 py-2 text-xs font-medium text-zinc-400 border-b border-zinc-800">Dial which number?</div>
      <ul className="py-1">
        {targets.map((t) => (
          <li key={t.field}>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onSelect(t); }}
              className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-zinc-800 focus:bg-zinc-800 focus:outline-none text-zinc-100"
            >
              <span className="text-zinc-400">{t.label}</span>
              <span className="text-zinc-100 font-mono text-xs">{formatPhoneForDisplay(t.number)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatPhoneForDisplay(n: string): string {
  // Display only; assumes E.164 or 10-digit US. If neither, show raw.
  const digits = n.replace(/\D/g, '');
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  return n;
}

/**
 * Given a contact with phone and/or cell_phone, returns the array of dial
 * targets. Decision #4 in locked log: dedupe when both normalize to the same
 * number (digits-only, optional leading 1 stripped).
 */
export function resolveDialTargets(contact: { phone?: string | null; cell_phone?: string | null }): DialTarget[] {
  const targets: DialTarget[] = [];
  if (contact.phone) targets.push({ label: 'Primary', number: contact.phone, field: 'phone' });
  if (contact.cell_phone) targets.push({ label: 'Cell', number: contact.cell_phone, field: 'cell_phone' });

  // Dedupe: if the two normalize to the same digits, keep only primary.
  if (targets.length === 2) {
    const a = targets[0].number.replace(/\D/g, '').replace(/^1/, '');
    const b = targets[1].number.replace(/\D/g, '').replace(/^1/, '');
    if (a === b) return [targets[0]];
  }

  return targets;
}
