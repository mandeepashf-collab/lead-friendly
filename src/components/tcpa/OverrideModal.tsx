"use client";

import React, { useEffect, useRef, useState } from "react";
import type { TcpaWarning } from "./TcpaOverrideProvider";

type Props = {
  open: boolean;
  warnings: TcpaWarning[];
  contactName: string;
  phone: string;
  tokenExpired: boolean;
  onConfirm: (note: string | null) => void;
  onCancel: () => void;
};

export function OverrideModal({
  open,
  warnings,
  contactName,
  phone,
  tokenExpired,
  onConfirm,
  onCancel,
}: Props) {
  const [note, setNote] = useState("");
  const primaryBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // The provider remounts this component on every new request, so the
    // note state is already fresh — just move focus to the primary action
    // once the dialog appears.
    if (open) {
      const t = setTimeout(() => primaryBtnRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onCancel]);

  if (!open) return null;

  const submit = () => {
    const trimmed = note.trim();
    onConfirm(trimmed ? trimmed : null);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tcpa-override-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl">
        <div className="border-b border-zinc-800 px-5 py-4">
          <div className="flex items-center gap-2">
            <span aria-hidden className="text-amber-400">⚠</span>
            <h2 id="tcpa-override-title" className="text-base font-semibold text-zinc-100">
              Compliance warning
            </h2>
          </div>
          {tokenExpired && (
            <p className="mt-1 text-xs text-amber-400/80">
              Previous confirmation expired — please review and confirm again.
            </p>
          )}
        </div>

        <div className="px-5 py-4">
          <div className="mb-3 text-sm text-zinc-300">
            Calling <span className="font-medium text-zinc-100">{contactName}</span>
            <span className="text-zinc-500"> · {phone}</span>
          </div>

          <div className="mb-4 rounded border border-amber-500/30 bg-amber-500/5 px-3 py-3">
            <ul className="space-y-2 text-sm text-zinc-200">
              {warnings.map((w) => (
                <li key={w.code} className="flex gap-2">
                  <span aria-hidden className="mt-0.5 text-amber-400">•</span>
                  <span>
                    <span className="font-medium text-amber-200">
                      {humanizeCode(w.code)}
                    </span>
                    <span className="text-zinc-400"> — {w.reason}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <label className="mb-1 block text-xs font-medium text-zinc-400">
            Reason for override (optional, recorded in audit log)
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 500))}
            placeholder="e.g. Returning customer's explicit callback request"
            className="w-full resize-none rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            rows={2}
            maxLength={500}
          />
          <div className="mt-1 text-right text-xs text-zinc-600">{note.length}/500</div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-zinc-800 bg-zinc-950/50 px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-zinc-700 bg-transparent px-4 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-600"
          >
            Cancel
          </button>
          <button
            ref={primaryBtnRef}
            type="button"
            onClick={submit}
            className="rounded border border-amber-500 bg-amber-500/90 px-4 py-1.5 text-sm font-medium text-zinc-950 hover:bg-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            Call anyway
          </button>
        </div>
      </div>
    </div>
  );
}

function humanizeCode(code: string): string {
  // Map evaluator codes to short human titles. Falls back to title-cased code.
  const map: Record<string, string> = {
    quiet_hours: "Outside allowed hours",
    daily_cap_exceeded: "Daily cap exceeded",
    cooldown_active: "Too soon since last attempt",
    sunday_calling: "Sunday calling",
    dnc_stale: "DNC check is stale",
  };
  if (map[code]) return map[code];
  return code
    .split("_")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

/**
 * HARD-BLOCK variant — same modal shell, but no override button, red accents.
 * Exposed separately so callers can render it when they get a 403.
 */
export function HardBlockModal({
  open,
  blocks,
  contactName,
  phone,
  onClose,
}: {
  open: boolean;
  blocks: TcpaWarning[];
  contactName: string;
  phone: string;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-lg border border-red-500/40 bg-zinc-900 shadow-xl">
        <div className="border-b border-red-500/30 px-5 py-4">
          <div className="flex items-center gap-2">
            <span aria-hidden className="text-red-400">⛔</span>
            <h2 className="text-base font-semibold text-zinc-100">
              This call can&apos;t be placed
            </h2>
          </div>
        </div>

        <div className="px-5 py-4">
          <div className="mb-3 text-sm text-zinc-300">
            <span className="font-medium text-zinc-100">{contactName}</span>
            <span className="text-zinc-500"> · {phone}</span>
          </div>

          <div className="mb-3 rounded border border-red-500/30 bg-red-500/5 px-3 py-3">
            <ul className="space-y-2 text-sm text-zinc-200">
              {blocks.map((b) => (
                <li key={b.code} className="flex gap-2">
                  <span aria-hidden className="mt-0.5 text-red-400">•</span>
                  <span>
                    <span className="font-medium text-red-200">
                      {humanizeCode(b.code)}
                    </span>
                    <span className="text-zinc-400"> — {b.reason}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-zinc-500">
            This is a federal compliance requirement and can&apos;t be overridden.
          </p>
        </div>

        <div className="flex justify-end border-t border-zinc-800 bg-zinc-950/50 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            autoFocus
            className="rounded bg-zinc-800 px-4 py-1.5 text-sm font-medium text-zinc-100 hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-600"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
