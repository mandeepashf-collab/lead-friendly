"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Phone, MessageSquare, Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import { sendMessage } from "@/hooks/use-conversations";
import type { Message } from "@/types/database";
import type { Conversation, Contact } from "@/types/database";

interface MessageThreadProps {
  conversation: Conversation | null;
  contact: Contact | null;
  messages: Message[];
  loading: boolean;
  onMessageSent: () => void;
}

type ChannelType = "sms" | "email" | "note";

export function MessageThread({
  conversation,
  contact,
  messages,
  loading,
  onMessageSent,
}: MessageThreadProps) {
  const [content, setContent] = useState("");
  const [channel, setChannel] = useState<ChannelType>("note");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!conversation || !content.trim()) return;

    setSending(true);
    const { error } = await sendMessage(conversation.id, content, channel);
    setSending(false);

    if (!error) {
      setContent("");
      onMessageSent();
    }
  };

  if (!conversation) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-zinc-950">
        <MessageSquare className="mb-3 h-12 w-12 text-zinc-700" />
        <p className="text-zinc-400">Select a conversation to start messaging</p>
      </div>
    );
  }

  const contactName = contact
    ? `${contact.first_name || ""} ${contact.last_name || ""}`.trim()
    : "Unknown";

  return (
    <div className="flex flex-1 flex-col bg-zinc-950">
      {/* Top Bar */}
      <div className="border-b border-zinc-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">{contactName}</h2>
            <div className="mt-1 flex items-center gap-4">
              {contact?.phone && (
                <span className="text-sm text-zinc-400">
                  {contact.phone}
                </span>
              )}
              {contact?.email && (
                <a
                  href={`mailto:${contact.email}`}
                  className="text-sm text-zinc-400 hover:text-indigo-400"
                >
                  {contact.email}
                </a>
              )}
              {contact?.status && (
                <span className="inline-flex items-center rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs font-medium text-zinc-300">
                  {contact.status}
                </span>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <button className="rounded-lg bg-zinc-800 p-2 text-zinc-400 hover:bg-zinc-700 hover:text-white transition-colors">
              <Phone className="h-5 w-5" />
            </button>
            <button className="rounded-lg bg-zinc-800 p-2 text-zinc-400 hover:bg-zinc-700 hover:text-white transition-colors">
              <MessageSquare className="h-5 w-5" />
            </button>
            <button className="rounded-lg bg-zinc-800 p-2 text-zinc-400 hover:bg-zinc-700 hover:text-white transition-colors">
              <Mail className="h-5 w-5" />
            </button>
            <button className="rounded-lg bg-zinc-800 p-2 text-yellow-500 hover:bg-zinc-700 transition-colors">
              ★
            </button>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-indigo-500" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-zinc-500">
            <MessageSquare className="mb-3 h-8 w-8" />
            <p className="text-sm">No messages yet</p>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "flex gap-3",
                  message.is_outgoing ? "justify-end" : "justify-start"
                )}
              >
                <div
                  className={cn(
                    "max-w-xs rounded-lg px-4 py-2",
                    message.is_outgoing
                      ? "bg-indigo-600 text-white"
                      : "bg-zinc-800 text-zinc-100"
                  )}
                >
                  <p className="text-sm">{message.content}</p>
                  <p
                    className={cn(
                      "mt-1 text-xs",
                      message.is_outgoing
                        ? "text-indigo-200"
                        : "text-zinc-500"
                    )}
                  >
                    {new Date(message.created_at).toLocaleTimeString(
                      "en-US",
                      {
                        hour: "numeric",
                        minute: "2-digit",
                      }
                    )}
                  </p>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="border-t border-zinc-800 p-6">
        {/* Channel Tabs */}
        <div className="mb-4 flex gap-2">
          {(["sms", "email", "note"] as ChannelType[]).map((ch) => (
            <button
              key={ch}
              onClick={() => setChannel(ch)}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                channel === ch
                  ? "bg-indigo-600 text-white"
                  : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white"
              )}
            >
              {ch === "sms" && <MessageSquare className="h-4 w-4" />}
              {ch === "email" && <Mail className="h-4 w-4" />}
              {ch === "note" && <MessageSquare className="h-4 w-4" />}
              {ch.charAt(0).toUpperCase() + ch.slice(1)}
            </button>
          ))}
        </div>

        {/* Message Input */}
        <div className="flex gap-3">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.ctrlKey) {
                handleSend();
              }
            }}
            placeholder="Type your message... (Ctrl+Enter to send)"
            className="min-h-20 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-white placeholder-zinc-500 focus:border-indigo-500 focus:outline-none resize-none"
          />
          <button
            onClick={handleSend}
            disabled={sending || !content.trim()}
            className="flex flex-shrink-0 items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
