"use client";

/**
 * TagEventCard — Phase 3c
 *
 * Renders a `tag_added` or `tag_removed` event from contact_events.
 * Mode is derived from event.event_type, not a prop, so the card
 * auto-handles both shapes.
 */

import { Tag, X } from "lucide-react";
import type { ContactEventRow } from "@/lib/contacts/activity-feed";

interface Props {
  event: ContactEventRow;
  authorLabel: string;
  relativeTime: string;
}

export function TagEventCard({ event, authorLabel, relativeTime }: Props) {
  const tagName = (event.payload_json.tag_name as string | undefined) ?? "(unnamed tag)";
  const isRemoval = event.event_type === "tag_removed";
  const Icon = isRemoval ? X : Tag;
  const verb = isRemoval ? "Removed tag" : "Tagged with";

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 hover:border-zinc-700 transition-colors">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center flex-shrink-0">
          <Icon size={13} className="text-zinc-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-zinc-400">{verb}</span>
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-300">
              {tagName}
            </span>
          </div>
          <p className="text-xs text-zinc-500 mt-1">
            {authorLabel} · {relativeTime}
          </p>
        </div>
      </div>
    </div>
  );
}
