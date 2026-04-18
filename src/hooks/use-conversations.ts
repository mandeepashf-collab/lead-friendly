"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Conversation, Message } from "@/types/database";

interface UseConversationsOptions {
  channel?: string;
  filter?: "all" | "unread" | "starred";
  search?: string;
  limit?: number;
  offset?: number;
}

export function useConversations(options: UseConversationsOptions = {}) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const {
    channel,
    filter = "all",
    search,
    limit = 50,
    offset = 0,
  } = options;

  const fetchConversations = useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = createClient();

    let query = supabase
      .from("conversations")
      .select("*")
      .order("last_message_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (channel && channel !== "all") {
      query = query.eq("channel", channel);
    }

    if (filter === "unread") {
      query = query.gt("unread_count", 0);
    } else if (filter === "starred") {
      query = query.eq("is_starred", true);
    }

    if (search) {
      // Search will be done on the contact name via the joined contact
      query = query.ilike("last_message", `%${search}%`);
    }

    const { data, error: fetchError } = await query;

    if (fetchError) {
      setError(fetchError.message);
    } else {
      setConversations(data || []);
    }
    setLoading(false);
  }, [channel, filter, search, limit, offset]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const markAsRead = useCallback(
    async (conversationId: string) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("conversations")
        .update({ unread_count: 0 })
        .eq("id", conversationId);

      if (!error) {
        setConversations((prev) =>
          prev.map((c) =>
            c.id === conversationId ? { ...c, unread_count: 0 } : c
          )
        );
      }
    },
    []
  );

  const toggleStar = useCallback(
    async (conversationId: string, isStarred: boolean) => {
      const supabase = createClient();
      const { error } = await supabase
        .from("conversations")
        .update({ is_starred: !isStarred })
        .eq("id", conversationId);

      if (!error) {
        setConversations((prev) =>
          prev.map((c) =>
            c.id === conversationId
              ? { ...c, is_starred: !isStarred }
              : c
          )
        );
      }
    },
    []
  );

  return {
    conversations,
    loading,
    error,
    refetch: fetchConversations,
    markAsRead,
    toggleStar,
  };
}

export function useMessages(conversationId: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMessages = useCallback(async () => {
    if (!conversationId) {
      setMessages([]);
      return;
    }

    setLoading(true);
    setError(null);
    const supabase = createClient();

    const { data, error: fetchError } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (fetchError) {
      setError(fetchError.message);
    } else {
      setMessages(data || []);
    }
    setLoading(false);
  }, [conversationId]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  return { messages, loading, error, refetch: fetchMessages };
}

export async function sendMessage(
  conversationId: string,
  content: string,
  channel: "sms" | "email" | "note" = "note"
): Promise<{ data: Message | null; error: string | null }> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { data: null, error: "Not authenticated" };

  // Determine message type
  let messageType: "sms" | "email" | "note" | "call" = "note";
  if (channel === "sms") messageType = "sms";
  if (channel === "email") messageType = "email";

  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_id: user.id,
      content,
      channel,
      message_type: messageType,
      is_outgoing: true,
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (!error && data) {
    // Update conversation last message
    await supabase
      .from("conversations")
      .update({
        last_message: content,
        last_message_at: new Date().toISOString(),
      })
      .eq("id", conversationId);
  }

  return { data, error: error?.message || null };
}
