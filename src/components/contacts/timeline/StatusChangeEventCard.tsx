"use client";

/**
 * StatusChangeEventCard — Phase 3c
 *
 * Renders a `status_changed` event from contact_events with a
 * "from → to" badge pair, humanized reason, author, and timestamp.
 */

import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { CONTACT_STATUSES, type ContactStatusOption } from "@/lib/contacts/statuses";
import type { ContactEventRow } from "@/lib/contacts/activity-feed";

const FALLBACK_STATUS: ContactStatusOption = {
  value: "unknown",
  label: "Unknown",
  color: "bg-zinc-700 text-zinc-400 border-zinc-600",
};

function getStatus(value: string | undefined | null): ContactStatusOption {
  if (!value) return FALLBACK_STATUS;
  return CONTACT_STATUSES.find((s) => s.value === value) ?? {
    value,
    label: value,
    color: FALLBACK_STATUS.color,
  };
}

const REASON_LABELS: Record<string, string> = {
  "auto:first_call_completed": "Auto · after first call",
  "auto:appointment_booked": "Auto · after appointment booked",
  "auto:dnc_keyword_detected": "Auto · DNC keyword detected",
  manual_single: "Manual",
  manual_bulk: "Manual",
};

function reasonLabel(reason: string | undefined): string | null {
  if (!reason) return null;
  return REASON_LABELS[reason] ?? reason;
}

interface Props {
  event: ContactEventRow;
  authorLabel: string;
  relativeTime: string;
}

export function StatusChangeEventCard({ event, authorLabel, relativeTime }: Props) {
  const fromValue = (event.payload_json.from as string | null) ?? null;
  const toValue = (event.payload_json.to as string | null) ?? null;
  const reason = (event.payload_json.reason as string | undefined) ?? undefined;
  const reasonText = reasonLabel(reason);

  const fromOpt = getStatus(fromValue);
  const toOpt = getStatus(toValue);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 hover:border-zinc-700 transition-colors">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center flex-shrink-0">
          <ArrowRight size={13} className="text-zinc-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-zinc-400">Status:</span>
            <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", fromOpt.color)}>
              {fromOpt.label}
            </span>
            <ArrowRight size={11} className="text-zinc-600 flex-shrink-0" />
            <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", toOpt.color)}>
              {toOpt.label}
            </span>
          </div>
          <p className="text-xs text-zinc-500 mt-1">
            {reasonText ? <>{reasonText} · </> : null}
            {authorLabel} · {relativeTime}
          </p>
        </div>
      </div>
    </div>
  );
}
