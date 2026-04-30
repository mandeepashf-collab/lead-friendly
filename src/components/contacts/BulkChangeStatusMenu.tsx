"use client";

/**
 * BulkChangeStatusMenu — Phase 1b
 *
 * Popover that lets the user pick one of the 9 valid contact statuses
 * and apply it to all selected contact ids via the
 * `bulk_update_contact_status` RPC (migration 031).
 *
 * The RPC is SECURITY DEFINER and resolves the caller's org from
 * profiles WHERE id=auth.uid(); it raises if any contact_id belongs
 * to another org, so cross-org tampering is rejected before any write.
 */

import { useEffect, useRef, useState, type RefObject } from "react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { CONTACT_STATUSES } from "@/lib/contacts/statuses";

// Use the canonical 9 statuses from the shared module. Phase 1c (apr 29)
// extracted this into src/lib/contacts/statuses.ts so that all UI surfaces
// (filter tabs, status dropdowns, this menu, the contact detail badge,
// the workflow builder) stay in lock-step.
const STATUSES = CONTACT_STATUSES;

interface Props {
  selectedIds: string[];
  anchorRef: RefObject<HTMLButtonElement | null>;
  onSuccess: (updatedCount: number, status: string) => void;
  onError: (msg: string) => void;
  onClose: () => void;
}

export function BulkChangeStatusMenu({
  selectedIds,
  anchorRef,
  onSuccess,
  onError,
  onClose,
}: Props) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submittingValue, setSubmittingValue] = useState<string | null>(null);

  // Click-outside + Escape to close.
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (submitting) return;
      const target = e.target as Node;
      if (popoverRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (submitting) return;
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [submitting, onClose, anchorRef]);

  async function handlePick(status: string) {
    if (submitting || selectedIds.length === 0) return;
    setSubmitting(true);
    setSubmittingValue(status);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("bulk_update_contact_status", {
        p_contact_ids: selectedIds,
        p_status: status,
      });
      if (error) {
        console.error("[bulk_update_contact_status] RPC error:", error);
        onError(error.message);
        return;
      }
      const updatedCount = (data as { updated_count: number }[] | null)?.[0]?.updated_count ?? 0;
      onSuccess(Number(updatedCount), status);
    } finally {
      setSubmitting(false);
      setSubmittingValue(null);
    }
  }

  return (
    <div
      ref={popoverRef}
      className="absolute top-full left-0 mt-1 z-40 w-56 rounded-lg border border-zinc-800 bg-zinc-900 shadow-2xl py-1"
      role="menu"
    >
      <div className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500 border-b border-zinc-800">
        Change status to
      </div>
      {STATUSES.map((s) => (
        <button
          key={s.value}
          type="button"
          disabled={submitting}
          onClick={() => handlePick(s.value)}
          className={cn(
            "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50",
            submittingValue === s.value && "bg-zinc-800",
          )}
        >
          <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", s.color)}>
            {s.label}
          </span>
          {submittingValue === s.value && (
            <span className="text-xs text-zinc-500">…</span>
          )}
        </button>
      ))}
    </div>
  );
}
