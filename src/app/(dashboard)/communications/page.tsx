"use client";

import { useState, useEffect } from "react";
import { Phone, Hash } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Calls imports ─────────────────────────────────────────────────
import { PhoneIncoming, PhoneOutgoing, Clock, TrendingUp, Calendar, Search, RefreshCw } from "lucide-react";
import { useCalls, getCallStats } from "@/hooks/use-calls";
import { CallDetail } from "../calls/call-detail";
import type { Call } from "@/types/database";

// ── Phone Numbers ────────────────────────────────────────────────
import { PhoneNumbersTab } from "./PhoneNumbersTab";

// ─────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────
type CallWithContact = Call & { contacts?: { first_name: string | null; last_name: string | null } };

function formatDuration(s: number) {
  if (!s) return "0:00";
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function CallStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    completed:   "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    answered:    "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    missed:      "bg-red-500/10 text-red-400 border-red-500/20",
    voicemail:   "bg-amber-500/10 text-amber-400 border-amber-500/20",
    busy:        "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
    failed:      "bg-red-500/10 text-red-400 border-red-500/20",
    "no-answer": "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  };
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize", map[status] || "bg-zinc-500/10 text-zinc-400 border-zinc-500/20")}>
      {status.replace(/-/g, " ")}
    </span>
  );
}

function SentimentBadge({ sentiment }: { sentiment: string | null }) {
  if (!sentiment) return <span className="text-zinc-600 text-sm">—</span>;
  const map: Record<string, string> = {
    positive: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    neutral:  "bg-amber-500/10 text-amber-400 border-amber-500/20",
    negative: "bg-red-500/10 text-red-400 border-red-500/20",
  };
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize", map[sentiment] || map.neutral)}>
      {sentiment}
    </span>
  );
}

function formatNumber(e164: string): string {
  const digits = e164.replace(/\D/g, "");
  if (digits.length === 11 && digits[0] === "1") {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return e164;
}

// ─────────────────────────────────────────────────────────────────
// Calls Tab (unchanged)
// ─────────────────────────────────────────────────────────────────
function CallsTab() {
  const [search, setSearch] = useState("");
  const [direction, setDirection] = useState<"all" | "inbound" | "outbound">("all");
  const [selectedCall, setSelectedCall] = useState<CallWithContact | null>(null);
  const [stats, setStats] = useState({ totalCalls: 0, avgDuration: 0, answerRate: 0, appointmentsBooked: 0 });
  const { calls, loading, refetch } = useCalls({ search: search || undefined, direction });

  useEffect(() => { getCallStats().then(setStats); }, []);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Total Calls", value: stats.totalCalls, icon: Phone, color: "text-indigo-400", sub: "All time" },
          { label: "Avg Duration", value: formatDuration(stats.avgDuration), icon: Clock, color: "text-blue-400", sub: "Per call" },
          { label: "Answer Rate", value: `${stats.answerRate}%`, icon: TrendingUp, color: "text-emerald-400", sub: "Completed calls" },
          { label: "Appointments", value: stats.appointmentsBooked, icon: Calendar, color: "text-purple-400", sub: "Last 30 days" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{s.label}</p>
                <p className="mt-2 text-3xl font-bold text-white">{s.value}</p>
                <p className="mt-1 text-xs text-zinc-600">{s.sub}</p>
              </div>
              <s.icon className={cn("h-5 w-5 mt-0.5", s.color)} />
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by contact name..."
            className="h-9 w-full rounded-lg border border-zinc-800 bg-zinc-900 pl-10 pr-4 text-sm text-zinc-300 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none" />
        </div>
        <select value={direction} onChange={(e) => setDirection(e.target.value as typeof direction)}
          className="h-9 rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-300 focus:border-indigo-500 focus:outline-none">
          <option value="all">All Calls</option>
          <option value="inbound">Inbound</option>
          <option value="outbound">Outbound</option>
        </select>
        <button onClick={refetch} className="flex h-9 items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-400 hover:text-white">
          <RefreshCw className="h-4 w-4" />Refresh
        </button>
      </div>

      <div className="flex gap-4">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden min-w-0 flex-1">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-800">
                  {["Contact", "Date & Time", "Direction", "Duration", "Status", "Sentiment", "Actions"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {loading ? (
                  <tr><td colSpan={7} className="px-4 py-16 text-center">
                    <div className="flex items-center justify-center gap-2 text-zinc-500">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-600 border-t-indigo-500" />Loading...
                    </div>
                  </td></tr>
                ) : calls.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-20 text-center">
                    <div className="flex flex-col items-center gap-3 text-zinc-600">
                      <Phone className="h-10 w-10" />
                      <p className="text-sm font-medium">No calls yet</p>
                      <p className="text-xs">Calls will appear here once contacts are called</p>
                    </div>
                  </td></tr>
                ) : (calls as CallWithContact[]).map((call) => {
                  const name = call.contacts
                    ? [call.contacts.first_name, call.contacts.last_name].filter(Boolean).join(" ") || "Unknown"
                    : "Unknown";
                  const isSelected = selectedCall?.id === call.id;
                  return (
                    <tr key={call.id} onClick={() => setSelectedCall(isSelected ? null : call)}
                      className={cn("cursor-pointer hover:bg-zinc-800/30 transition-colors", isSelected && "bg-indigo-600/5")}>
                      <td className="px-4 py-3 text-sm font-medium text-white">{name}</td>
                      <td className="px-4 py-3 text-sm text-zinc-400">{new Date(call.created_at).toLocaleString()}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 text-sm text-zinc-400">
                          {call.direction === "inbound"
                            ? <PhoneIncoming className="h-3.5 w-3.5 text-emerald-400" />
                            : <PhoneOutgoing className="h-3.5 w-3.5 text-indigo-400" />}
                          <span className="capitalize">{call.direction}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-zinc-400">{formatDuration(call.duration_seconds)}</td>
                      <td className="px-4 py-3"><CallStatusBadge status={call.status} /></td>
                      <td className="px-4 py-3"><SentimentBadge sentiment={call.sentiment} /></td>
                      <td className="px-4 py-3">
                        <button onClick={(e) => { e.stopPropagation(); setSelectedCall(isSelected ? null : call); }}
                          className="text-xs text-indigo-400 hover:text-indigo-300">
                          {isSelected ? "Close" : "View"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        {selectedCall && (
          <div className="w-96 shrink-0">
            <CallDetail call={selectedCall} onClose={() => setSelectedCall(null)} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────
const TABS = [
  { id: "calls", label: "Calls", icon: Phone },
  { id: "numbers", label: "Phone Numbers", icon: Hash },
] as const;
type TabId = typeof TABS[number]["id"];

export default function CommunicationsPage() {
  const [tab, setTab] = useState<TabId>("calls");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Communications</h1>
        <p className="text-zinc-400">Manage calls, recordings, and phone numbers</p>
      </div>

      <div className="flex gap-1 border-b border-zinc-800">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={cn("flex items-center gap-2 px-4 pb-3 text-sm font-medium transition-colors border-b-2 -mb-px",
              tab === id ? "border-indigo-500 text-white" : "border-transparent text-zinc-500 hover:text-zinc-300")}>
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </div>

      {tab === "calls" && <CallsTab />}
      {tab === "numbers" && <PhoneNumbersTab />}
    </div>
  );
}
