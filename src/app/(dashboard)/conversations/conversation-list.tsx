"use client";

import { useState, useMemo } from "react";
import { Search, Phone, MessageSquare, Mail, Mail as UnreadIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Conversation } from "@/types/database";
import type { Contact } from "@/types/database";

interface ConversationListProps {
  conversations: Conversation[];
  contacts: Map<string, Contact>;
  selectedId: string | null;
  onSelect: (conversationId: string) => void;
  loading: boolean;
}

type FilterType = "all" | "unread" | "starred" | "sms" | "email";

export function ConversationList({
  conversations,
  contacts,
  selectedId,
  onSelect,
  loading,
}: ConversationListProps) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");

  const filtered = useMemo(() => {
    return conversations.filter((conv) => {
      const contact = conv.contact_id ? contacts.get(conv.contact_id) : null;
      const contactName = contact
        ? `${contact.first_name || ""} ${contact.last_name || ""}`.trim()
        : "Unknown";

      // Apply filter
      if (filter === "unread" && conv.unread_count === 0) return false;
      if (filter === "starred" && !conv.is_starred) return false;
      if (filter === "sms" && conv.channel !== "sms") return false;
      if (filter === "email" && conv.channel !== "email") return false;

      // Apply search
      if (search) {
        const searchLower = search.toLowerCase();
        return (
          contactName.toLowerCase().includes(searchLower) ||
          (conv.last_message?.toLowerCase().includes(searchLower) || false)
        );
      }

      return true;
    });
  }, [conversations, contacts, filter, search]);

  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case "sms":
        return <MessageSquare className="h-4 w-4" />;
      case "email":
        return <Mail className="h-4 w-4" />;
      case "call":
        return <Phone className="h-4 w-4" />;
      default:
        return null;
    }
  };

  const getInitials = (contact: Contact | undefined) => {
    if (!contact) return "?";
    const first = contact.first_name?.[0] || "";
    const last = contact.last_name?.[0] || "";
    return (first + last).toUpperCase() || "?";
  };

  const formatTime = (date: string | null) => {
    if (!date) return "";
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const hours = diff / (1000 * 60 * 60);
    const days = diff / (1000 * 60 * 60 * 24);

    if (hours < 1) {
      const mins = Math.floor(diff / (1000 * 60));
      return mins === 0 ? "now" : `${mins}m`;
    }
    if (hours < 24) {
      return `${Math.floor(hours)}h`;
    }
    if (days < 7) {
      return `${Math.floor(days)}d`;
    }
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <div className="flex h-full w-80 flex-col border-r border-zinc-800 bg-zinc-950">
      {/* Header */}
      <div className="border-b border-zinc-800 p-4">
        <h2 className="mb-4 text-lg font-semibold text-white">Messages</h2>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Search conversations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 py-2 pl-10 pr-3 text-sm text-white placeholder-zinc-500 focus:border-indigo-500 focus:outline-none"
          />
        </div>

        {/* Filter Tabs */}
        <div className="flex flex-wrap gap-2">
          {(["all", "unread", "starred", "sms", "email"] as FilterType[]).map(
            (f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  filter === f
                    ? "bg-indigo-600 text-white"
                    : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                )}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            )
          )}
        </div>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center p-8 text-zinc-500">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-indigo-500" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center text-zinc-500">
            <MessageSquare className="mb-3 h-8 w-8" />
            <p className="text-sm">No conversations yet</p>
          </div>
        ) : (
          filtered.map((conversation) => {
            const contact = conversation.contact_id
              ? contacts.get(conversation.contact_id)
              : undefined;
            const contactName = contact
              ? `${contact.first_name || ""} ${contact.last_name || ""}`.trim()
              : "Unknown";
            const initials = getInitials(contact);

            return (
              <button
                key={conversation.id}
                onClick={() => onSelect(conversation.id)}
                className={cn(
                  "w-full border-b border-zinc-800 p-3 text-left transition-colors hover:bg-zinc-900",
                  selectedId === conversation.id && "bg-indigo-950"
                )}
              >
                <div className="flex items-start gap-3">
                  {/* Avatar */}
                  <div className="mt-1 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-semibold text-white">
                    {initials}
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="truncate font-semibold text-white">
                        {contactName}
                      </h3>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {getChannelIcon(conversation.channel) && (
                          <div className="text-zinc-500">
                            {getChannelIcon(conversation.channel)}
                          </div>
                        )}
                        <span className="text-xs text-zinc-500">
                          {formatTime(conversation.last_message_at)}
                        </span>
                      </div>
                    </div>

                    {/* Message preview */}
                    <p className="truncate text-sm text-zinc-400">
                      {conversation.last_message || "No messages yet"}
                    </p>

                    {/* Unread badge and starred */}
                    <div className="mt-1 flex items-center gap-2">
                      {conversation.unread_count > 0 && (
                        <span className="inline-flex h-5 items-center justify-center rounded-full bg-indigo-600 px-1.5 text-xs font-semibold text-white">
                          {conversation.unread_count}
                        </span>
                      )}
                      {conversation.is_starred && (
                        <span className="text-xs text-yellow-500">★</span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
