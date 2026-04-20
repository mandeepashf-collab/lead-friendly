"use client";

import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Users, MessageSquare, Phone, Hash } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Contacts imports ──────────────────────────────────────────────
import {
  Search, Plus, Upload, Download, Filter, Mail, Building2,
  ChevronLeft, ChevronRight, Trash2, Edit2, Eye, X, ArrowUpDown,
  UserPlus, FileSpreadsheet, PhoneCall, Loader2,
} from "lucide-react";
import { useContacts, deleteContact } from "@/hooks/use-contacts";
import { ContactDialog } from "../contacts/contact-dialog";
import { ContactDetail } from "../contacts/contact-detail";
import { ImportDialog } from "../contacts/import-dialog";
import type { Contact } from "@/types/database";

// ── Conversations imports ─────────────────────────────────────────
import { useConversations, useMessages } from "@/hooks/use-conversations";
import { ConversationList } from "../conversations/conversation-list";
import { MessageThread } from "../conversations/message-thread";
import { ContactPanel } from "../conversations/contact-panel";

// ── Calls imports ─────────────────────────────────────────────────
import { PhoneIncoming, PhoneOutgoing, Clock, TrendingUp, Calendar, RefreshCw } from "lucide-react";
import { useCalls, getCallStats } from "@/hooks/use-calls";
import { CallDetail } from "../calls/call-detail";
import type { Call } from "@/types/database";

// ── Phone Numbers ─────────────────────────────────────────────────
import { PhoneNumbersTab } from "../communications/PhoneNumbersTab";

// ── Templates imports ─────────────────────────────────────────────
import { FileText, MessageCircle, AtSign, Mic, Copy, CheckCircle, ChevronDown } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// ─────────────────────────────────────────────────────────────────
// Contacts Tab
// ─────────────────────────────────────────────────────────────────
const STATUS_OPTIONS = [
  { value: "all", label: "All", color: "" },
  { value: "new", label: "New", color: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  { value: "contacted", label: "Contacted", color: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  { value: "qualified", label: "Qualified", color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  { value: "proposal", label: "Proposal", color: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
  { value: "won", label: "Won", color: "bg-green-500/10 text-green-400 border-green-500/20" },
  { value: "lost", label: "Lost", color: "bg-red-500/10 text-red-400 border-red-500/20" },
];

function ContactStatusBadge({ status }: { status: string }) {
  const opt = STATUS_OPTIONS.find((s) => s.value === status) || STATUS_OPTIONS[1];
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", opt.color)}>
      {opt.label}
    </span>
  );
}

function ContactsTab() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [showDialog, setShowDialog] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [viewContact, setViewContact] = useState<Contact | null>(null);
  const [sortBy, setSortBy] = useState<"first_name" | "created_at">("created_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const limit = 20;
  const offset = (page - 1) * limit;

  const { contacts, count: total, loading, refetch } = useContacts({
    search, status: statusFilter === "all" ? undefined : statusFilter,
    limit, offset, sortBy, sortOrder,
  });

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this contact?")) return;
    await deleteContact(id);
    refetch();
  };

  const toggleSort = (field: "first_name" | "created_at") => {
    if (sortBy === field) setSortOrder(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(field); setSortOrder("asc"); }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search contacts…"
            className="h-9 w-full rounded-lg border border-zinc-800 bg-zinc-900 pl-9 pr-3 text-sm text-zinc-300 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none" />
        </div>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          className="h-9 rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-300 focus:border-indigo-500 focus:outline-none">
          {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button onClick={() => setShowImport(true)}
          className="flex items-center gap-2 rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-800">
          <Upload className="h-4 w-4" />Import
        </button>
        <button onClick={() => { setEditContact(null); setShowDialog(true); }}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
          <Plus className="h-4 w-4" />Add Contact
        </button>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-left">
              <th className="px-4 py-3 text-xs font-medium text-zinc-500">
                <button onClick={() => toggleSort("first_name")} className="flex items-center gap-1 hover:text-zinc-300">
                  Name <ArrowUpDown className="h-3 w-3" />
                </button>
              </th>
              <th className="px-4 py-3 text-xs font-medium text-zinc-500">Contact</th>
              <th className="px-4 py-3 text-xs font-medium text-zinc-500">Company</th>
              <th className="px-4 py-3 text-xs font-medium text-zinc-500">Status</th>
              <th className="px-4 py-3 text-xs font-medium text-zinc-500">
                <button onClick={() => toggleSort("created_at")} className="flex items-center gap-1 hover:text-zinc-300">
                  Added <ArrowUpDown className="h-3 w-3" />
                </button>
              </th>
              <th className="px-4 py-3 text-xs font-medium text-zinc-500">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="py-12 text-center text-zinc-500"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></td></tr>
            ) : contacts.length === 0 ? (
              <tr><td colSpan={6} className="py-12 text-center text-zinc-500">No contacts found</td></tr>
            ) : contacts.map(c => (
              <tr key={c.id} className="border-t border-zinc-800/50 hover:bg-zinc-800/30 transition-colors cursor-pointer" onClick={() => window.location.href = '/people/' + c.id}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600/20 text-xs font-semibold text-indigo-400 shrink-0">
                      {(c.first_name?.[0] || c.email?.[0] || "?").toUpperCase()}
                    </div>
                    <span className="font-medium text-white">{[c.first_name, c.last_name].filter(Boolean).join(" ") || "—"}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-zinc-400">
                  <div className="flex flex-col gap-0.5">
                    {c.email && <span className="flex items-center gap-1.5"><Mail className="h-3 w-3 shrink-0" />{c.email}</span>}
                    {c.phone && <span className="flex items-center gap-1.5"><Phone className="h-3 w-3 shrink-0" />{c.phone}</span>}
                  </div>
                </td>
                <td className="px-4 py-3 text-zinc-400">{c.company_name || "—"}</td>
                <td className="px-4 py-3"><ContactStatusBadge status={c.status || "new"} /></td>
                <td className="px-4 py-3 text-zinc-500 text-xs">{new Date(c.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button onClick={(e) => { e.stopPropagation(); setViewContact(c); }} className="rounded p-1.5 text-zinc-500 hover:bg-zinc-700 hover:text-white"><Eye className="h-4 w-4" /></button>
                    <button onClick={(e) => { e.stopPropagation(); setEditContact(c); setShowDialog(true); }} className="rounded p-1.5 text-zinc-500 hover:bg-zinc-700 hover:text-white"><Edit2 className="h-4 w-4" /></button>
                    <button onClick={(e) => { e.stopPropagation(); handleDelete(c.id); }} className="rounded p-1.5 text-zinc-500 hover:bg-red-900/40 hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-zinc-500">
          <span>Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}</span>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="rounded-lg border border-zinc-800 px-3 py-1.5 hover:bg-zinc-800 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="rounded-lg border border-zinc-800 px-3 py-1.5 hover:bg-zinc-800 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      )}

      {showDialog && <ContactDialog contact={editContact} onClose={() => setShowDialog(false)} onSaved={() => { setShowDialog(false); refetch(); }} />}
      {showImport && <ImportDialog onClose={() => setShowImport(false)} onImported={() => { setShowImport(false); refetch(); }} />}
      {viewContact && <ContactDetail contact={viewContact} onClose={() => setViewContact(null)} onEdit={() => { setViewContact(null); setEditContact(viewContact); setShowDialog(true); }} onDeleted={() => { setViewContact(null); refetch(); }} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Conversations Tab
// ─────────────────────────────────────────────────────────────────
function ConversationsTab() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { conversations, loading } = useConversations();
  const { messages, loading: msgLoading, refetch } = useMessages(selectedId);
  const { contacts: contactList } = useContacts({ limit: 500 });

  const contactsMap = useMemo(() => {
    const map = new Map<string, Contact>();
    contactList.forEach((c) => map.set(c.id, c));
    return map;
  }, [contactList]);

  const selected = conversations.find((c) => c.id === selectedId) ?? null;
  const selectedContact = selected?.contact_id ? (contactsMap.get(selected.contact_id) ?? null) : null;

  return (
    <div className="flex h-[calc(100vh-280px)] min-h-96 rounded-xl border border-zinc-800 overflow-hidden">
      <ConversationList
        conversations={conversations}
        contacts={contactsMap}
        selectedId={selectedId}
        onSelect={setSelectedId}
        loading={loading}
      />
      {selectedId ? (
        <>
          <MessageThread
            conversation={selected}
            contact={selectedContact}
            messages={messages}
            loading={msgLoading}
            onMessageSent={refetch}
          />
          <ContactPanel contact={selectedContact} />
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center text-zinc-600">
          <div className="text-center">
            <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Select a conversation to view messages</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Call Logs Tab
// ─────────────────────────────────────────────────────────────────
type CallWithContact = Call & {
  contacts?: { first_name: string | null; last_name: string | null } | null;
  ai_agents?: { name: string | null } | null;
};

/**
 * Build a display label for a call row. Handles WebRTC test calls and
 * callback-bridge calls that have NULL contact_id but DO have other context.
 */
function callDisplayName(call: CallWithContact): string {
  if (call.contacts) {
    const n = [call.contacts.first_name, call.contacts.last_name].filter(Boolean).join(" ");
    if (n) return n;
  }
  const c = call as unknown as {
    call_type?: string;
    call_mode?: string;
    to_number?: string;
    from_number?: string;
  };
  if (c.call_type === "webrtc") {
    return call.ai_agents?.name ? `WebRTC Test — ${call.ai_agents.name}` : "WebRTC Test";
  }
  if (c.call_mode === "callback_bridge") {
    return c.to_number || c.from_number || "Bridged call";
  }
  return c.to_number || c.from_number || "Unknown";
}

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

function CallLogsTab() {
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
                  const name = callDisplayName(call);
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
            <CallDetail
              call={{ ...selectedCall, contacts: selectedCall.contacts ?? undefined }}
              onClose={() => setSelectedCall(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Templates Tab
// ─────────────────────────────────────────────────────────────────
interface Template {
  id: string;
  name: string;
  type: "sms" | "email" | "call_script";
  category?: string | null;
  subject?: string | null;
  body: string;
  variables?: string[] | null;
  industry?: string | null;
  is_system: boolean;
  created_at: string;
}

const SYSTEM_TEMPLATES: Omit<Template, "id" | "created_at">[] = [
  // SMS
  { name: "Appointment Confirmation", type: "sms", body: "Hi {{first_name}}, your appointment is confirmed for {{appointment_date}} at {{appointment_time}}. Reply C to confirm or R to reschedule.", variables: ["first_name", "appointment_date", "appointment_time"], is_system: true, industry: "general" },
  { name: "Appointment Reminder (24h)", type: "sms", body: "Hi {{first_name}}, reminder: you have an appointment tomorrow at {{appointment_time}}. See you then! Reply R to reschedule.", variables: ["first_name", "appointment_time"], is_system: true, industry: "general" },
  { name: "Appointment Reminder (1h)", type: "sms", body: "Hi {{first_name}}, your appointment is in 1 hour at {{appointment_time}}. We look forward to seeing you!", variables: ["first_name", "appointment_time"], is_system: true, industry: "general" },
  { name: "Follow-Up After Appointment", type: "sms", body: "Hi {{first_name}}, thanks for coming in today! If you have any questions, reply to this message. We'd also appreciate a quick review: {{review_link}}", variables: ["first_name", "review_link"], is_system: true, industry: "general" },
  { name: "Missed Call Follow-Up", type: "sms", body: "Hi {{first_name}}, sorry we missed your call! When's a good time to call you back?", variables: ["first_name"], is_system: true, industry: "general" },
  { name: "New Lead Welcome", type: "sms", body: "Hi {{first_name}}, thanks for your interest in {{company}}! One of our team members will reach out shortly.", variables: ["first_name", "company"], is_system: true, industry: "general" },
  { name: "Quote Follow-Up", type: "sms", body: "Hi {{first_name}}, following up on the quote we sent. Any questions? Happy to hop on a quick call.", variables: ["first_name"], is_system: true, industry: "general" },
  { name: "Re-engagement", type: "sms", body: "Hi {{first_name}}, it's been a while! We'd love to help you with {{service}}. Reply YES to learn about our latest offers.", variables: ["first_name", "service"], is_system: true, industry: "general" },
  // Email
  { name: "Appointment Confirmation", type: "email", subject: "Your Appointment is Confirmed", body: "Hi {{first_name}},\n\nYour appointment has been confirmed for {{appointment_date}} at {{appointment_time}}.\n\nLocation: {{location}}\n\nPlease bring: {{what_to_bring}}\n\nNeed to reschedule? Click here: {{reschedule_link}}\n\nWe look forward to seeing you!\n\n{{company}}", variables: ["first_name", "appointment_date", "appointment_time", "location", "what_to_bring", "reschedule_link", "company"], is_system: true, industry: "general" },
  { name: "Welcome New Lead", type: "email", subject: "Welcome to {{company}}", body: "Hi {{first_name}},\n\nWelcome! We're thrilled to have you interested in {{company}}.\n\nHere's what you can expect:\n• A team member will reach out within 1 business day\n• We'll learn about your needs and how we can help\n• No pressure — just a friendly conversation\n\nReady to get started? Book a call: {{booking_link}}\n\nBest,\n{{sender_name}}\n{{company}}", variables: ["first_name", "company", "booking_link", "sender_name"], is_system: true, industry: "general" },
  { name: "Quote Follow-Up", type: "email", subject: "Following Up on Your Quote", body: "Hi {{first_name}},\n\nI wanted to follow up on the quote we sent over. Do you have any questions or need clarification on anything?\n\nKey highlights:\n• {{benefit_1}}\n• {{benefit_2}}\n• {{benefit_3}}\n\nI'd love to hop on a quick call to walk you through everything. Book a time that works for you: {{booking_link}}\n\nBest,\n{{sender_name}}", variables: ["first_name", "benefit_1", "benefit_2", "benefit_3", "booking_link", "sender_name"], is_system: true, industry: "general" },
  { name: "Post-Appointment Follow-Up", type: "email", subject: "Great Meeting You, {{first_name}}", body: "Hi {{first_name}},\n\nThank you for coming in today! It was great to meet you.\n\nNext steps:\n{{next_steps}}\n\nIf you have any questions, just reply to this email.\n\nWe'd really appreciate it if you left us a review: {{review_link}}\n\nBest,\n{{sender_name}}\n{{company}}", variables: ["first_name", "next_steps", "review_link", "sender_name", "company"], is_system: true, industry: "general" },
  { name: "Re-engagement", type: "email", subject: "We Miss You, {{first_name}}", body: "Hi {{first_name}},\n\nIt's been a while since we last connected, and we wanted to reach out!\n\nAs a valued past customer, we'd like to offer you: {{special_offer}}\n\nThis offer expires {{expiry_date}}.\n\nReady to reconnect? Book a call: {{booking_link}}\n\nBest,\n{{sender_name}}\n{{company}}", variables: ["first_name", "special_offer", "expiry_date", "booking_link", "sender_name", "company"], is_system: true, industry: "general" },
  // Call Scripts
  { name: "Cold Call Intro", type: "call_script", body: "Hi, may I speak with {{first_name}}?\n\n[If yes]: Hi {{first_name}}, my name is {{sender_name}} from {{company}}. I'm reaching out because we help {{industry}} businesses with {{value_prop}}. I was wondering if that's something you're currently looking at?\n\n[If interested]: Great! I'd love to set up a quick 15-minute call to learn more about your situation. Are you free {{day_option_1}} or {{day_option_2}}?\n\n[Objection - Too busy]: I completely understand. Could I send you some info and follow up next week?\n\n[Objection - Not interested]: No problem at all! Would you mind if I stayed in touch in case things change down the road?", variables: ["first_name", "sender_name", "company", "industry", "value_prop", "day_option_1", "day_option_2"], is_system: true, industry: "general" },
  { name: "Appointment Setting", type: "call_script", body: "Hi {{first_name}}, this is {{sender_name}} from {{company}}.\n\nI'm calling because {{reason_for_call}}.\n\nI'd love to schedule a quick {{duration}}-minute call to {{call_purpose}}. Does {{time_option_1}} or {{time_option_2}} work for you?\n\n[If yes]: Perfect! I'll send you a calendar invite right away. Is {{email}} the best email to reach you?\n\n[If no]: No problem! What time works best for you this week?", variables: ["first_name", "sender_name", "company", "reason_for_call", "duration", "call_purpose", "time_option_1", "time_option_2", "email"], is_system: true, industry: "general" },
  { name: "Follow-Up Call", type: "call_script", body: "Hi {{first_name}}, this is {{sender_name}} from {{company}}. I'm following up from our conversation on {{previous_date}}.\n\nAt that point you mentioned {{previous_interest}}. I wanted to check in and see if you've had a chance to think it over?\n\n[If still interested]: Great! The next step would be {{next_step}}. Would you be open to moving forward?\n\n[If not ready]: I understand. When would be a better time to reconnect — next week or the week after?", variables: ["first_name", "sender_name", "company", "previous_date", "previous_interest", "next_step"], is_system: true, industry: "general" },
  { name: "Service Inquiry", type: "call_script", body: "Hi {{first_name}}, thank you for reaching out to {{company}}! My name is {{sender_name}}.\n\nI see you're interested in {{service}}. Could you tell me a bit more about what you're looking for?\n\n[Listen and take notes]\n\nBased on what you've told me, I think {{recommended_service}} might be a great fit. Here's what that includes: {{service_details}}.\n\nThe investment for this is {{price}}. Does that sound like something that would work for you?", variables: ["first_name", "company", "sender_name", "service", "recommended_service", "service_details", "price"], is_system: true, industry: "general" },
];

const TYPE_CONFIG = {
  sms: { label: "SMS", color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", icon: MessageCircle },
  email: { label: "Email", color: "bg-blue-500/10 text-blue-400 border-blue-500/20", icon: AtSign },
  call_script: { label: "Call Script", color: "bg-orange-500/10 text-orange-400 border-orange-500/20", icon: Mic },
};

function TemplateTypeBadge({ type }: { type: Template["type"] }) {
  const cfg = TYPE_CONFIG[type];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", cfg.color)}>
      <cfg.icon className="h-3 w-3" />{cfg.label}
    </span>
  );
}

function TemplateModal({
  template,
  onClose,
  onSaved,
}: {
  template?: Partial<Template>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(template?.name || "");
  const [type, setType] = useState<Template["type"]>(template?.type || "sms");
  const [subject, setSubject] = useState(template?.subject || "");
  const [body, setBody] = useState(template?.body || "");
  const [industry, setIndustry] = useState(template?.industry || "general");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const VARS = ["first_name", "last_name", "company", "appointment_date", "appointment_time", "review_link", "booking_link", "sender_name", "service", "phone"];

  const insertVar = (v: string) => setBody((b) => b + `{{${v}}}`);

  const save = async () => {
    if (!name.trim() || !body.trim()) { setError("Name and body are required."); return; }
    setSaving(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const payload = { name, type, subject: type === "email" ? subject : null, body, industry, is_system: false, user_id: user.id };
      if (template?.id) {
        await supabase.from("templates").update(payload).eq("id", template.id);
      } else {
        await supabase.from("templates").insert(payload);
      }
      onSaved();
    } catch (e: any) {
      setError(e.message || "Failed to save template.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-2xl rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
          <h2 className="text-lg font-semibold text-white">{template?.id ? "Edit Template" : "Create Template"}</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {error && <p className="rounded-lg border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-400">{error}</p>}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Template Name *</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Appointment Reminder"
                className="h-9 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Type *</label>
              <select value={type} onChange={(e) => setType(e.target.value as Template["type"])}
                className="h-9 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-200 focus:border-indigo-500 focus:outline-none">
                <option value="sms">SMS</option>
                <option value="email">Email</option>
                <option value="call_script">Call Script</option>
              </select>
            </div>
          </div>
          {type === "email" && (
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Subject Line</label>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Your Appointment is Confirmed"
                className="h-9 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none" />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Industry</label>
            <select value={industry} onChange={(e) => setIndustry(e.target.value)}
              className="h-9 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-200 focus:border-indigo-500 focus:outline-none">
              {["general","real_estate","insurance","hvac","dental","solar","saas","legal","fitness"].map((i) => (
                <option key={i} value={i}>{i.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}</option>
              ))}
            </select>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-zinc-400">Body *</label>
              <div className="flex flex-wrap gap-1">
                {VARS.map((v) => (
                  <button key={v} onClick={() => insertVar(v)}
                    className="rounded px-1.5 py-0.5 text-[10px] font-mono bg-indigo-600/10 text-indigo-400 hover:bg-indigo-600/20 border border-indigo-600/20">
                    {`{{${v}}}`}
                  </button>
                ))}
              </div>
            </div>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} placeholder="Write your template body here. Use {{variable}} for dynamic content."
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none resize-none font-mono" />
          </div>
        </div>
        <div className="flex justify-end gap-3 border-t border-zinc-800 px-6 py-4">
          <button onClick={onClose} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-400 hover:text-white">Cancel</button>
          <button onClick={save} disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {template?.id ? "Save Changes" : "Create Template"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TemplatesTab() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<"all" | Template["type"]>("all");
  const [industryFilter, setIndustryFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editTemplate, setEditTemplate] = useState<Template | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<Template | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data } = await supabase.from("templates").select("*").order("is_system", { ascending: false }).order("name");
      if (data && data.length > 0) {
        setTemplates(data as Template[]);
      } else {
        // Use local system templates if table is empty or doesn't exist
        const sys = SYSTEM_TEMPLATES.map((t, i) => ({ ...t, id: `sys-${i}`, created_at: new Date().toISOString() }));
        setTemplates(sys as Template[]);
      }
    } catch {
      const sys = SYSTEM_TEMPLATES.map((t, i) => ({ ...t, id: `sys-${i}`, created_at: new Date().toISOString() }));
      setTemplates(sys as Template[]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const copyToClipboard = (t: Template) => {
    navigator.clipboard.writeText(t.body).then(() => {
      setCopiedId(t.id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const deleteTemplate = async (id: string) => {
    if (!confirm("Delete this template?")) return;
    const supabase = createClient();
    await supabase.from("templates").delete().eq("id", id);
    load();
  };

  const duplicate = async (t: Template) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("templates").insert({ name: `${t.name} (copy)`, type: t.type, subject: t.subject, body: t.body, industry: t.industry, is_system: false, user_id: user.id });
    load();
  };

  const filtered = templates.filter((t) => {
    if (typeFilter !== "all" && t.type !== typeFilter) return false;
    if (industryFilter !== "all" && t.industry !== industryFilter) return false;
    if (search && !t.name.toLowerCase().includes(search.toLowerCase()) && !t.body.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const grouped = {
    sms: filtered.filter((t) => t.type === "sms"),
    email: filtered.filter((t) => t.type === "email"),
    call_script: filtered.filter((t) => t.type === "call_script"),
  };

  const industries: string[] = ["all", ...Array.from(new Set(templates.map((t) => t.industry).filter((x): x is string => !!x)))];

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search templates…"
            className="h-9 w-full rounded-lg border border-zinc-800 bg-zinc-900 pl-9 pr-3 text-sm text-zinc-300 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none" />
        </div>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
          className="h-9 rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-300 focus:border-indigo-500 focus:outline-none">
          <option value="all">All Types</option>
          <option value="sms">SMS</option>
          <option value="email">Email</option>
          <option value="call_script">Call Script</option>
        </select>
        <select value={industryFilter} onChange={(e) => setIndustryFilter(e.target.value)}
          className="h-9 rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-300 focus:border-indigo-500 focus:outline-none">
          {industries.map((i) => (
            <option key={i} value={i}>{i === "all" ? "All Industries" : (i || "").replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}</option>
          ))}
        </select>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
          <Plus className="h-4 w-4" />Create Template
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-zinc-500">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <div className="space-y-8">
          {(["sms", "email", "call_script"] as const).map((type) => {
            const group = grouped[type];
            if (typeFilter !== "all" && type !== typeFilter) return null;
            if (group.length === 0) return null;
            const cfg = TYPE_CONFIG[type];
            return (
              <div key={type}>
                <div className="flex items-center gap-2 mb-3">
                  <cfg.icon className={cn("h-4 w-4", cfg.color.split(" ")[1])} />
                  <h3 className="text-sm font-semibold text-white">{cfg.label} Templates</h3>
                  <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-500">{group.length}</span>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {group.map((t) => (
                    <div key={t.id} className={cn("rounded-xl border bg-zinc-900/50 p-4 flex flex-col gap-3 hover:border-zinc-700 transition-colors", preview?.id === t.id ? "border-indigo-500/40 bg-indigo-950/10" : "border-zinc-800")}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <TemplateTypeBadge type={t.type} />
                            {t.is_system && <span className="rounded-full bg-zinc-800 border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-500 font-medium">System</span>}
                            {t.industry && t.industry !== "general" && (
                              <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-500 capitalize">{t.industry.replace("_", " ")}</span>
                            )}
                          </div>
                          <p className="mt-1.5 text-sm font-medium text-white">{t.name}</p>
                          {t.type === "email" && t.subject && <p className="text-xs text-zinc-500 mt-0.5">Subject: {t.subject}</p>}
                        </div>
                      </div>
                      <p className="text-xs text-zinc-500 line-clamp-3 leading-relaxed">{t.body}</p>
                      <div className="flex items-center gap-1.5 mt-auto pt-1 border-t border-zinc-800">
                        <button onClick={() => copyToClipboard(t)}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-zinc-700 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors">
                          {copiedId === t.id ? <CheckCircle className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                          {copiedId === t.id ? "Copied!" : "Copy"}
                        </button>
                        <button onClick={() => setPreview(preview?.id === t.id ? null : t)}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-zinc-700 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors">
                          <Eye className="h-3.5 w-3.5" />Preview
                        </button>
                        {t.is_system ? (
                          <button onClick={() => duplicate(t)}
                            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-zinc-700 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors">
                            <FileText className="h-3.5 w-3.5" />Duplicate
                          </button>
                        ) : (
                          <>
                            <button onClick={() => setEditTemplate(t)}
                              className="flex items-center justify-center rounded-lg border border-zinc-700 p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors">
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => deleteTemplate(t.id)}
                              className="flex items-center justify-center rounded-lg border border-zinc-700 p-1.5 text-zinc-400 hover:bg-red-900/40 hover:text-red-400 transition-colors">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Preview Drawer */}
      {preview && (
        <div className="fixed inset-y-0 right-0 z-[150] w-96 border-l border-zinc-800 bg-zinc-950 shadow-2xl flex flex-col">
          <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
            <div>
              <h3 className="text-sm font-semibold text-white">{preview.name}</h3>
              <TemplateTypeBadge type={preview.type} />
            </div>
            <button onClick={() => setPreview(null)} className="text-zinc-500 hover:text-white"><X className="h-5 w-5" /></button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {preview.type === "email" && preview.subject && (
              <div>
                <p className="text-xs font-medium text-zinc-500 mb-1">Subject</p>
                <p className="text-sm text-zinc-200 font-medium">{preview.subject}</p>
              </div>
            )}
            <div>
              <p className="text-xs font-medium text-zinc-500 mb-1">Body</p>
              <pre className="whitespace-pre-wrap text-sm text-zinc-300 leading-relaxed font-sans">{preview.body}</pre>
            </div>
            {preview.variables && preview.variables.length > 0 && (
              <div>
                <p className="text-xs font-medium text-zinc-500 mb-2">Variables</p>
                <div className="flex flex-wrap gap-1.5">
                  {preview.variables.map((v) => (
                    <span key={v} className="rounded-full bg-indigo-600/10 border border-indigo-600/20 px-2 py-0.5 text-xs font-mono text-indigo-400">{`{{${v}}}`}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="border-t border-zinc-800 p-4">
            <button onClick={() => copyToClipboard(preview)}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700">
              {copiedId === preview.id ? <CheckCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copiedId === preview.id ? "Copied to clipboard!" : "Copy to Clipboard"}
            </button>
          </div>
        </div>
      )}

      {(showCreate || editTemplate) && (
        <TemplateModal
          template={editTemplate || undefined}
          onClose={() => { setShowCreate(false); setEditTemplate(null); }}
          onSaved={() => { setShowCreate(false); setEditTemplate(null); load(); }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────
const TABS = [
  { id: "contacts",      label: "People",        icon: Users },
  { id: "conversations", label: "Conversations",  icon: MessageSquare },
  { id: "calls",         label: "Call Logs",      icon: PhoneCall },
  { id: "numbers",       label: "Phone Numbers",  icon: Hash },
  { id: "templates",     label: "Templates",      icon: FileText },
] as const;
type TabId = typeof TABS[number]["id"];

export default function PeoplePage() {
  const searchParams = useSearchParams();
  const initialTab = (TABS.find((t) => t.id === searchParams.get("tab"))?.id) as TabId | undefined;
  const [tab, setTab] = useState<TabId>(initialTab ?? "contacts");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Contacts</h1>
        <p className="text-zinc-400">Manage your contacts, conversations, and message templates</p>
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

      {tab === "contacts"      && <ContactsTab />}
      {tab === "conversations" && <ConversationsTab />}
      {tab === "calls"         && <CallLogsTab />}
      {tab === "numbers"       && <PhoneNumbersTab />}
      {tab === "templates"     && <TemplatesTab />}
    </div>
  );
}
