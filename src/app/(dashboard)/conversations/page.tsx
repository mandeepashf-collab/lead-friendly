"use client";

import { useState, useMemo } from "react";
import { useConversations, useMessages } from "@/hooks/use-conversations";
import { useContacts } from "@/hooks/use-contacts";
import { ConversationList } from "./conversation-list";
import { MessageThread } from "./message-thread";
import { ContactPanel } from "./contact-panel";
import type { Contact } from "@/types/database";

export default function ConversationsPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showContact, setShowContact] = useState(false);

  const { conversations, loading } = useConversations();
  const { messages, loading: msgLoading, refetch } = useMessages(selectedId);
  const { contacts: contactList } = useContacts({ limit: 500 });

  // Build Map<id, Contact> for ConversationList
  const contactsMap = useMemo(() => {
    const map = new Map<string, Contact>();
    contactList.forEach((c) => map.set(c.id, c));
    return map;
  }, [contactList]);

  const selected = conversations.find((c) => c.id === selectedId) ?? null;
  const selectedContact = selected?.contact_id
    ? (contactsMap.get(selected.contact_id) ?? null)
    : null;

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-0 rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
      {/* Conversation List */}
      <div className="w-80 shrink-0 border-r border-zinc-800">
        <ConversationList
          conversations={conversations}
          contacts={contactsMap}
          loading={loading}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </div>

      {/* Message Thread */}
      <div className="flex-1 min-w-0">
        <MessageThread
          conversation={selected}
          contact={selectedContact}
          messages={messages}
          loading={msgLoading}
          onMessageSent={refetch}
        />
      </div>

      {/* Contact Panel */}
      {showContact && (
        <div className="w-72 shrink-0 border-l border-zinc-800">
          <ContactPanel contact={selectedContact} />
        </div>
      )}
    </div>
  );
}
