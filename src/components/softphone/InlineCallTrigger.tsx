'use client';

// src/components/softphone/InlineCallTrigger.tsx
//
// Wraps an existing call-trigger button. Only intercepts the click when the
// contact has two distinct dialable numbers — then shows DialTargetPicker.
// Single-number or zero-number cases pass through to the inner button's own
// onClick handler, preserving existing UX (toasts, disabled state, etc.).
//
// Stage 1.6. Decision #3/4 in locked log.

import { useState, type ReactNode } from 'react';
import { useSoftphone } from './SoftphoneContext';
import { DialTargetPicker, resolveDialTargets, type DialTarget } from './DialTargetPicker';

type InlineCallTriggerProps = {
  contact: {
    id: string;
    phone?: string | null;
    cell_phone?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    company_name?: string | null;
  };
  children: ReactNode;
  className?: string;
};

export function InlineCallTrigger({ contact, children, className }: InlineCallTriggerProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const { openWith } = useSoftphone();

  const targets = resolveDialTargets(contact);

  // Only intercept when there's a genuine ambiguity (2 distinct numbers).
  // 0 or 1 target → let the inner button's onClick fire normally so its
  // existing behavior (no-phone toast, disabled state, etc.) is preserved.
  const handleClick = (e: React.MouseEvent) => {
    if (targets.length <= 1) return;
    e.preventDefault();
    e.stopPropagation();
    setPickerOpen(true);
  };

  const dial = (target: DialTarget) => {
    setPickerOpen(false);
    openWith({
      id: contact.id,
      firstName: contact.first_name ?? null,
      lastName: contact.last_name ?? null,
      phone: target.number,
      company: contact.company_name ?? null,
    });
  };

  return (
    <span
      className={`relative inline-block ${className ?? ''}`}
      onClick={handleClick}
    >
      {children}
      {pickerOpen && (
        <DialTargetPicker
          targets={targets}
          onSelect={dial}
          onCancel={() => setPickerOpen(false)}
        />
      )}
    </span>
  );
}
