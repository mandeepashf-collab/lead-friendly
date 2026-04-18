"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Phone, PhoneIncoming, PhoneOutgoing, Clock, TrendingUp, Calendar, Search, RefreshCw, Wifi } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCalls, getCallStats } from "@/hooks/use-calls";
import type { Call } from "@/types/database";

type CallWithContact = Call & { contacts?: { first_name: string | null; last_name: string | null } };

function formatDuration(s: number) {
  if (!s) return "0:00";
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    completed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    answered:  "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    missed:    "bg-red-500/10 text-red-400 border-red-500/20",
    voicemail: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    busy:      "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
    failed:    "bg-red-500/10 text-red-400 border-red-500/20",
    "no-answer": "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  };
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize", map[status] || "bg-zinc-500/10 text-zinc-400 border-zinc-500/20")}>
      {status.replace(/-/g, " ")}
    </span>
  );
}

function CallTypeBadge({ callType }: { callType: string | null }) {
  if (!callType || callType === "telnyx") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-zinc-500/20 bg-zinc-500/10 px-2 py-0.5 text-xs font-medium text-zinc-400">
        <Phone className="h-3 w-3" />Phone
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2 py-0.5 text-xs font-medium text-cyan-400">
      <Wifi className="h-3 w-3" />WebRTC
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

export default function CallsPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [direction, setDirection] = useState<"all" | "inbound" | "outbound">("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [stats, setStats] = useState({ totalCalls: 0, avgDuration: 0, answerRate: 0, appointmentsBooked: 0 });

  const { calls: rawCalls, loading, refetch } = useCalls({ search: search || undefined, direction });

  // Client-side status filtering
  const calls = statusFilter === "all"
    ? rawCalls
    : rawCalls.filter(c => c.status === statusFilter || c.outcome === statusFilter);

  useEffect(() => {
    getCallStats().then(setStats);
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Call Management</h1>
        <p className="text-zinc-400">View call history, recordings, and transcripts</p>
      </div>

      {/* Stats */}
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

      {/* Filters */}
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

      {/* Status Filter Pills */}
      <div className="flex flex-wrap gap-2">
        {[
          { value: "all", label: "All" },
          { value: "completed", label: "Answered" },
          { value: "voicemail", label: "Voicemail" },
          { value: "no-answer", label: "No Answer" },
          { value: "appointment_booked", label: "Appointment Booked" },
          { value: "failed", label: "Failed" },
        ].map(f => (
          <button key={f.value} onClick={() => setStatusFilter(f.value)}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
              statusFilter === f.value
                ? "bg-indigo-600/20 border-indigo-500/40 text-indigo-300"
                : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
            )}>
            {f.label}
            {f.value !== "all" && (
              <span className="ml-1.5 text-[10px] opacity-60">
                {rawCalls.filter(c => c.status === f.value || c.outcome === f.value).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="flex gap-4">
        <div className={cn("rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden min-w-0 flex-1")}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-800">
                  {["Contact", "Date & Time", "Type", "Direction", "Duration", "Status", "Sentiment", "Actions"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {loading ? (
                  <tr><td colSpan={8} className="px-4 py-16 text-center">
                    <div className="flex items-center justify-center gap-2 text-zinc-500">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-600 border-t-indigo-500" />Loading...
                    </div>
                  </td></tr>
                ) : calls.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-20 text-center">
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
                  return (
                    <tr key={call.id} onClick={() => router.push(`/calls/${call.id}`)}
                      className={cn("cursor-pointer hover:bg-zinc-800/30 transition-colors")}>
                      <td className="px-4 py-3 text-sm font-medium text-white">{name}</td>
                      <td className="px-4 py-3 text-sm text-zinc-400">{new Date(call.created_at).toLocaleString()}</td>
                      <td className="px-4 py-3"><CallTypeBadge callType={call.call_type ?? null} /></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 text-sm text-zinc-400">
                          {call.direction === "inbound"
                            ? <PhoneIncoming className="h-3.5 w-3.5 text-emerald-400" />
                            : <PhoneOutgoing className="h-3.5 w-3.5 text-indigo-400" />}
                          <span className="capitalize">{call.direction}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-zinc-400">{formatDuration(call.duration_seconds)}</td>
                      <td className="px-4 py-3"><StatusBadge status={call.status} /></td>
                      <td className="px-4 py-3"><SentimentBadge sentiment={call.sentiment} /></td>
                      <td className="px-4 py-3">
                        <button onClick={(e) => { e.stopPropagation(); router.push(`/calls/${call.id}`); }}
                          className="text-xs text-indigo-400 hover:text-indigo-300">
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
