"use client";

/**
 * SystemEventCard — Phase 3c
 *
 * Catch-all renderer for `event_type='system'` and any future event_type
 * values added to contact_events before the timeline UI is updated to
 * recognize them. Defensive against schema drift — anything in the table
 * still produces a card rather than disappearing silently.
 */

import { Info } from "lucide-react";
import type { ContactEventRow } from "@/lib/contacts/activity-feed";

interface Props {
  event: ContactEventRow;
  authorLabel: string;
  relativeTime: string;
}

function summarize(event: ContactEventRow): string {
  const note = event.payload_json.note as string | undefined;
  if (note) return note;
  // For event_types we don't have a dedicated card for, render the
  // event_type itself in a humanized form.
  const verb = event.event_type.replace(/_/g, " ");
  return verb.charAt(0).toUpperCase() + verb.slice(1);
}

export function SystemEventCard({ event, authorLabel, relativeTime }: Props) {
  const summary = summarize(event);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 hover:border-zinc-700 transition-colors">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center flex-shrink-0">
          <Info size={13} className="text-zinc-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-zinc-300">{summary}</p>
          <p className="text-xs text-zinc-500 mt-1">
            {authorLabel} · {relativeTime}
          </p>
        </div>
      </div>
    </div>
  );
}
