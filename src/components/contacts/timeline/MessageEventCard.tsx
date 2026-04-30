"use client";

/**
 * MessageEventCard — Phase 3c
 *
 * Renders a row from the `messages` table (joined to its conversation
 * for contact resolution by the parent feed query). Shows incoming on
 * the left, outgoing on the right, with channel + read-state badges.
 *
 * Channel-agnostic: SMS, email, anything else gets the same bubble
 * shape so newly-supported channels light up automatically. Email
 * subject is shown as a small header above the body when present.
 */

import { useState } from "react";
import { MessageSquare, Mail, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MessageRow } from "@/lib/contacts/activity-feed";

const PREVIEW_LIMIT = 200;

function channelIcon(channel: string) {
  switch (channel) {
    case "email":
      return Mail;
    case "voice":
    case "voicemail":
      return Phone;
    case "sms":
    default:
      return MessageSquare;
  }
}

function channelLabel(channel: string): string {
  if (!channel) return "Message";
  return channel.toUpperCase();
}

interface Props {
  message: MessageRow;
  relativeTime: string;
}

/** A message is "incoming" if the contact (not us) sent it. */
function isIncoming(senderType: string): boolean {
  // sender_type values seen in DB: 'contact', 'user', 'ai_agent', 'system'
  return senderType === "contact";
}

export function MessageEventCard({ message, relativeTime }: Props) {
  const [expanded, setExpanded] = useState(false);

  const incoming = isIncoming(message.sender_type);
  const Icon = channelIcon(message.channel);
  const channel = channelLabel(message.channel);

  const body = message.content ?? "";
  const isLong = body.length > PREVIEW_LIMIT;
  const display = !expanded && isLong ? body.slice(0, PREVIEW_LIMIT) + "…" : body;

  return (
    <div className={cn(
      "bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 hover:border-zinc-700 transition-colors",
    )}>
      <div className={cn("flex gap-3", incoming ? "" : "flex-row-reverse")}>
        <div className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
          incoming
            ? "bg-zinc-800 border border-zinc-700"
            : "bg-indigo-500/10 border border-indigo-500/20",
        )}>
          <Icon size={13} className={incoming ? "text-zinc-400" : "text-indigo-400"} />
        </div>
        <div className={cn("flex-1 min-w-0 max-w-[85%]", incoming ? "" : "text-right")}>
          <div className={cn(
            "flex items-center gap-2",
            incoming ? "" : "flex-row-reverse",
          )}>
            <span className="text-xs font-medium text-zinc-400">
              {incoming ? "From contact" : message.sender_name || "You"}
            </span>
            <span className="text-[10px] uppercase tracking-wider text-zinc-600 px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700">
              {channel}
            </span>
          </div>
          {message.email_subject ? (
            <p className="text-xs font-medium text-zinc-300 mt-1">
              {message.email_subject}
            </p>
          ) : null}
          <p className={cn(
            "text-sm leading-relaxed mt-1 whitespace-pre-wrap text-left rounded-lg px-3 py-2 inline-block",
            incoming
              ? "bg-zinc-800 text-zinc-300"
              : "bg-indigo-500/10 text-indigo-100",
          )}>
            {display}
          </p>
          {isLong && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="block text-xs text-indigo-400 hover:text-indigo-300 mt-1"
            >
              {expanded ? "Show less" : "Show more"}
            </button>
          )}
          <p className={cn("text-xs text-zinc-500 mt-1", incoming ? "" : "text-right")}>
            {relativeTime}
          </p>
        </div>
      </div>
    </div>
  );
}
