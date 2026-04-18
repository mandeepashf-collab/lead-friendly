"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  X, Copy, Check, ChevronDown, ChevronUp, Headphones, Save, MessageSquare, Bot, User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { Call } from "@/types/database";

interface Props {
  call: Call & {
    contacts?: { first_name: string | null; last_name: string | null; phone?: string | null };
    notes?: string | null;
    ai_agent_id?: string | null;
    contact_id?: string | null;
  };
  onClose: () => void;
  onUpdated?: () => void;
}

const SENTIMENT_COLORS: Record<string, string> = {
  positive: "bg-green-500/10 text-green-400 border-green-500/20",
  neutral: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  negative: "bg-red-500/10 text-red-400 border-red-500/20",
};

const formatDuration = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
};

export function CallDetail({ call, onClose, onUpdated }: Props) {
  const [transcriptExpanded, setTranscriptExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [notes, setNotes] = useState<string>(call.notes || "");
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);

  // Reset notes state if parent passes a different call
  useEffect(() => {
    setNotes(call.notes || "");
    setNotesSaved(false);
  }, [call.id, call.notes]);

  const contactName = call.contacts
    ? [call.contacts.first_name, call.contacts.last_name].filter(Boolean).join(" ")
    : "Unknown";

  const handleCopyTranscript = () => {
    if (call.transcript) {
      navigator.clipboard.writeText(call.transcript);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const saveNotes = async () => {
    setSavingNotes(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("calls")
        .update({ notes })
        .eq("id", call.id);
      if (!error) {
        setNotesSaved(true);
        setTimeout(() => setNotesSaved(false), 2000);
        onUpdated?.();
      }
    } finally {
      setSavingNotes(false);
    }
  };

  // Format the transcript as alternating bubbles if it's structured like
  // "Agent: ...\nCustomer: ..." — otherwise just show as pre-wrap.
  const transcriptLines = (call.transcript || "").split(/\n+/).filter(Boolean);
  const looksConversational = transcriptLines.some((l) =>
    /^(agent|ai|assistant|bot|customer|lead|user):/i.test(l)
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md overflow-y-auto border-l border-zinc-800 bg-zinc-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-800 bg-zinc-900 px-6 py-4">
          <h2 className="text-lg font-semibold text-white">Call Details</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Call Header */}
          <div className="text-center">
            <p className="text-sm text-zinc-400 flex items-center justify-center gap-1.5">
              {call.ai_agent_id ? <Bot className="h-3.5 w-3.5 text-indigo-400" /> : <User className="h-3.5 w-3.5 text-emerald-400" />}
              {call.ai_agent_id ? "AI-handled" : "Human-dialed"} · {call.direction === "inbound" ? "Incoming" : "Outgoing"}
            </p>
            <h3 className="mt-2 text-xl font-semibold text-white">{contactName}</h3>
            <p className="mt-1 text-sm text-zinc-400">
              {new Date(call.created_at).toLocaleString()}
            </p>
          </div>

          {/* Quick Actions: call back (human) if we have a contact + phone */}
          {(call.contact_id || call.contacts?.phone) && (
            <div className="grid grid-cols-2 gap-2">
              <Link
                href={`/calls/human${call.contact_id ? `?contactId=${call.contact_id}` : ""}`}
                className="flex items-center justify-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-400 hover:bg-emerald-500/20"
              >
                <Headphones className="h-4 w-4" /> Call Back (Human)
              </Link>
              <button
                disabled
                title="SMS coming soon"
                className="flex items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm font-medium text-zinc-400 opacity-50 cursor-not-allowed"
              >
                <MessageSquare className="h-4 w-4" /> SMS
              </button>
            </div>
          )}

          {/* Call Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-3 text-center">
              <p className="text-xs text-zinc-500">Duration</p>
              <p className="mt-1 text-lg font-semibold text-white">
                {formatDuration(call.duration_seconds)}
              </p>
            </div>
            <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-3 text-center">
              <p className="text-xs text-zinc-500">Status</p>
              <p className="mt-1 text-lg font-semibold capitalize text-white">
                {call.status}
              </p>
            </div>
            <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-3 text-center">
              <p className="text-xs text-zinc-500">Direction</p>
              <p className="mt-1 text-lg font-semibold capitalize text-white">
                {call.direction}
              </p>
            </div>
          </div>

          {/* Sentiment Badge */}
          {call.sentiment && (
            <div className="flex justify-center">
              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium",
                  SENTIMENT_COLORS[call.sentiment] || SENTIMENT_COLORS.neutral
                )}
              >
                {call.sentiment.charAt(0).toUpperCase() + call.sentiment.slice(1)} Sentiment
              </span>
            </div>
          )}

          {/* Recording */}
          {call.recording_url && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase text-zinc-500">Recording</h4>
              <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-3">
                <audio
                  controls
                  className="h-8 w-full"
                  src={call.recording_url}
                  style={{ colorScheme: "dark" }}
                />
                <a
                  href={call.recording_url}
                  download
                  className="mt-2 block w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-center text-xs font-medium text-zinc-300 hover:bg-zinc-700"
                >
                  Download Recording
                </a>
              </div>
            </div>
          )}

          {/* Call Summary */}
          {call.call_summary && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase text-zinc-500">Summary</h4>
              <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-4 text-sm text-zinc-300 leading-relaxed">
                {call.call_summary}
              </div>
            </div>
          )}

          {/* Transcript */}
          {call.transcript && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase text-zinc-500">Transcript</h4>
                <button
                  onClick={handleCopyTranscript}
                  className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white"
                  title="Copy transcript"
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>

              <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 overflow-hidden">
                <button
                  onClick={() => setTranscriptExpanded(!transcriptExpanded)}
                  className="w-full flex items-center justify-between p-4 text-sm font-medium text-zinc-300 hover:bg-zinc-700"
                >
                  <span>{transcriptExpanded ? "Hide" : "Show"} Transcript</span>
                  {transcriptExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>

                {transcriptExpanded && (
                  <div className="border-t border-zinc-700 p-4 max-h-96 overflow-y-auto">
                    {looksConversational ? (
                      <div className="space-y-2">
                        {transcriptLines.map((line, i) => {
                          const m = line.match(/^(agent|ai|assistant|bot|customer|lead|user):\s*(.+)$/i);
                          if (!m) {
                            return <p key={i} className="text-sm text-zinc-400">{line}</p>;
                          }
                          const role = m[1].toLowerCase();
                          const text = m[2];
                          const isAgent = /^(agent|ai|assistant|bot)$/.test(role);
                          return (
                            <div key={i} className={cn("flex", isAgent ? "justify-start" : "justify-end")}>
                              <div className={cn(
                                "max-w-[85%] rounded-xl px-3 py-2 text-sm",
                                isAgent ? "bg-indigo-500/10 text-indigo-100 border border-indigo-500/20" : "bg-zinc-700 text-zinc-100"
                              )}>
                                <p className="text-[10px] uppercase font-semibold mb-0.5 opacity-70">{isAgent ? "Agent" : "Caller"}</p>
                                {text}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">
                        {call.transcript}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Notes / annotations */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase text-zinc-500">Notes</h4>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add your own notes about this call — e.g. 'Lead was hesitant with AI agent, try human follow-up.'"
              rows={4}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:border-indigo-500 focus:outline-none resize-y"
            />
            <button
              onClick={saveNotes}
              disabled={savingNotes || notes === (call.notes || "")}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {notesSaved ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
              {notesSaved ? "Saved" : savingNotes ? "Saving…" : "Save notes"}
            </button>
          </div>

          {/* Metadata */}
          <div className="rounded-lg bg-zinc-800/50 p-3 text-xs text-zinc-500 space-y-1">
            <p>
              Call ID: <span className="text-[10px] text-zinc-600 font-mono">{call.id}</span>
            </p>
            <p>
              Created:{" "}
              <span className="text-zinc-300">
                {new Date(call.created_at).toLocaleString()}
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
