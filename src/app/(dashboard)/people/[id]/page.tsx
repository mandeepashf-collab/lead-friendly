"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRealtimeCalls } from "@/hooks/useRealtimeCalls";
import {
  ArrowLeft, Mail, Phone, Calendar, Trash2, Loader2,
  ChevronDown, Tag, Plus, PhoneCall, MessageSquare, TrendingUp,
  Pencil, Bot, Volume2, FileText, X, Play,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useContact, updateContact as updateContactApi, deleteContact } from "@/hooks/use-contacts";
import InitiateCallModal from "@/components/calls/InitiateCallModal";
import ActiveCallPanel from "@/components/calls/ActiveCallPanel";
import PostCallDisposition from "@/components/calls/PostCallDisposition";
import { useSoftphone } from "@/components/softphone/SoftphoneContext";
import type { Call, Conversation, Opportunity } from "@/types/database";

const STATUS_OPTIONS = [
  { value: "new", label: "New", color: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  { value: "contacted", label: "Contacted", color: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  { value: "qualified", label: "Qualified", color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  { value: "proposal", label: "Proposal", color: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
  { value: "won", label: "Won", color: "bg-green-500/10 text-green-400 border-green-500/20" },
  { value: "lost", label: "Lost", color: "bg-red-500/10 text-red-400 border-red-500/20" },
];

function getAvatarColor(name: string): string {
  const colors = ["indigo", "teal", "emerald", "amber", "rose", "cyan", "violet", "orange"];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash) + name.charCodeAt(i);
  const colorMap: Record<string, string> = {
    indigo: "bg-indigo-600/30 text-indigo-400", teal: "bg-teal-600/30 text-teal-400",
    emerald: "bg-emerald-600/30 text-emerald-400", amber: "bg-amber-600/30 text-amber-400",
    rose: "bg-rose-600/30 text-rose-400", cyan: "bg-cyan-600/30 text-cyan-400",
    violet: "bg-violet-600/30 text-violet-400", orange: "bg-orange-600/30 text-orange-400",
  };
  return colorMap[colors[Math.abs(hash) % colors.length]] || colorMap.indigo;
}

// ── Inline editable field ─────────────────────────────────────────
function ContactField({ label, value, type = "text", onSave }: {
  label: string; value?: string | null; type?: string; onSave: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value || "");

  useEffect(() => { setVal(value || ""); }, [value]);

  return (
    <div>
      <p className="text-xs text-zinc-600 mb-1">{label}</p>
      {editing ? (
        <div className="flex gap-1">
          <input type={type} value={val} onChange={e => setVal(e.target.value)} autoFocus
            className="flex-1 bg-zinc-800 border border-indigo-500 rounded-lg px-3 py-1.5 text-sm text-white outline-none" />
          <button onClick={() => { onSave(val); setEditing(false); }}
            className="text-xs px-2 py-1 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500">&#10003;</button>
          <button onClick={() => { setVal(value || ""); setEditing(false); }}
            className="text-xs px-2 py-1 border border-zinc-700 text-zinc-500 rounded-lg hover:bg-zinc-800">&#10005;</button>
        </div>
      ) : (
        <button onClick={() => setEditing(true)}
          className="w-full text-left px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm hover:border-zinc-600 transition-colors flex items-center justify-between group">
          <span className={value ? "text-white" : "text-zinc-600 italic"}>
            {value || `Add ${label.toLowerCase()}...`}
          </span>
          <Pencil size={11} className="text-zinc-700 group-hover:text-zinc-500 flex-shrink-0" />
        </button>
      )}
    </div>
  );
}

// ── Inline Audio Player ───────────────────────────────────────────
function InlineAudioPlayer({ url, duration }: { url: string; duration: number }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [dur, setDur] = useState(duration || 0);
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.ontimeupdate = () => setCurrent(a.currentTime);
    a.onloadedmetadata = () => setDur(a.duration);
    a.onended = () => setPlaying(false);
  }, []);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else { a.play(); setPlaying(true); }
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = audioRef.current;
    if (!a || !dur) return;
    const rect = e.currentTarget.getBoundingClientRect();
    a.currentTime = ((e.clientX - rect.left) / rect.width) * dur;
  };

  const cycleSpeed = () => {
    const speeds = [1, 1.25, 1.5, 2, 0.75];
    const next = speeds[(speeds.indexOf(speed) + 1) % speeds.length];
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  const fmt = (s: number) => `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;

  return (
    <div>
      <audio ref={audioRef} src={url} preload="none" />
      <div className="flex items-center gap-3">
        <button onClick={toggle}
          className="w-8 h-8 rounded-full bg-zinc-800 hover:bg-indigo-600 flex items-center justify-center flex-shrink-0 transition-colors">
          {playing
            ? <Volume2 size={13} className="text-white" />
            : <Play size={13} className="text-white ml-0.5" />}
        </button>
        <div className="flex-1 space-y-1">
          <div className="relative h-1 bg-zinc-800 rounded-full cursor-pointer" onClick={seek}>
            <div className="absolute inset-y-0 left-0 bg-indigo-500 rounded-full"
              style={{ width: dur ? `${(current/dur)*100}%` : '0%' }} />
          </div>
          <div className="flex justify-between text-[10px] font-mono text-zinc-600">
            <span>{fmt(current)}</span><span>{fmt(dur)}</span>
          </div>
        </div>
        <button onClick={cycleSpeed}
          className="text-[10px] font-mono text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded w-7 text-center hover:text-white">
          {speed}×
        </button>
        <a href={url} download className="p-1.5 text-zinc-600 hover:text-zinc-400 transition-colors">
          <FileText size={12} />
        </a>
      </div>
    </div>
  );
}

// ── Call Activity Card ────────────────────────────────────────────
function CallActivityCard({ call }: { call: Call }) {
  const [expanded, setExpanded] = useState(false);

  function fmtDur(secs: number) {
    if (!secs) return "0:00";
    return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  }

  const isAI = !!call.ai_agent_id;
  const hasExtra = call.recording_url || call.transcript || call.call_summary;

  const statusColor: Record<string, string> = {
    completed: "text-emerald-400", initiated: "text-zinc-500",
    failed: "text-red-400", "no-answer": "text-amber-400",
  };

  const sentimentStyle: Record<string, string> = {
    positive: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    negative: "bg-red-500/10 text-red-400 border-red-500/20",
    neutral: "bg-zinc-700 text-zinc-400 border-zinc-600",
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden hover:border-zinc-700 transition-colors">
      <div className={cn("flex items-center justify-between px-4 py-3", hasExtra && "cursor-pointer")}
        onClick={() => hasExtra && setExpanded(!expanded)}>
        <div className="flex items-center gap-3">
          <div className={cn("w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
            isAI ? "bg-indigo-500/10 border border-indigo-500/20" : "bg-blue-500/10 border border-blue-500/20")}>
            {isAI ? <Bot size={13} className="text-indigo-400" /> : <Phone size={13} className="text-blue-400" />}
          </div>
          <div>
            <p className="text-sm font-medium text-white">
              {isAI ? "AI Call" : "Manual Call"} · <span className="capitalize text-zinc-400">{call.direction}</span>
            </p>
            <p className="text-xs text-zinc-500">
              {new Date(call.created_at).toLocaleString()} · {fmtDur(call.duration_seconds)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {call.sentiment && (
            <span className={cn("text-xs px-2 py-0.5 rounded-full border", sentimentStyle[call.sentiment] || sentimentStyle.neutral)}>
              {call.sentiment}
            </span>
          )}
          <span className={cn("text-xs font-medium", statusColor[call.status] || "text-zinc-500")}>
            {call.status}
          </span>
          {hasExtra && (
            <ChevronDown size={14} className={cn("text-zinc-600 transition-transform", expanded && "rotate-180")} />
          )}
        </div>
      </div>

      {expanded && hasExtra && (
        <div className="border-t border-zinc-800 px-4 py-4 space-y-4">
          {call.recording_url && (
            <InlineAudioPlayer url={call.recording_url} duration={call.duration_seconds} />
          )}
          {call.call_summary && (
            <div>
              <p className="text-xs font-medium text-zinc-500 mb-1.5 flex items-center gap-1.5">
                <FileText size={11} /> Summary
              </p>
              <p className="text-sm text-zinc-300 leading-relaxed bg-zinc-800 rounded-lg px-3 py-2">
                {call.call_summary}
              </p>
            </div>
          )}
          {call.transcript && (
            <div>
              <p className="text-xs font-medium text-zinc-500 mb-1.5 flex items-center gap-1.5">
                <MessageSquare size={11} /> Transcript
              </p>
              <div className="bg-zinc-800 rounded-lg px-3 py-2 max-h-48 overflow-y-auto">
                {(() => {
                  const t = call.transcript as unknown;
                  let lines: { speaker: string; text: string }[] | null = null;
                  if (Array.isArray(t)) {
                    lines = t as { speaker: string; text: string }[];
                  } else if (typeof t === 'string') {
                    try {
                      const parsed = JSON.parse(t);
                      if (Array.isArray(parsed)) lines = parsed;
                    } catch { /* not JSON, render as plain text */ }
                  }
                  if (lines) {
                    return (
                      <div className="space-y-1.5">
                        {lines.map((line, i) => (
                          <div key={i} className={`flex gap-2 ${line.speaker === 'agent' ? '' : 'flex-row-reverse'}`}>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 mt-0.5 ${line.speaker === 'agent' ? 'bg-indigo-500/10 text-indigo-400' : 'bg-zinc-700 text-zinc-400'}`}>
                              {line.speaker === 'agent' ? 'AI' : 'Lead'}
                            </span>
                            <p className={`text-xs leading-relaxed px-2.5 py-1.5 rounded-lg max-w-[80%] ${line.speaker === 'agent' ? 'bg-indigo-500/10 text-indigo-100' : 'bg-zinc-700 text-zinc-300'}`}>
                              {line.text}
                            </p>
                          </div>
                        ))}
                      </div>
                    );
                  }
                  return (
                    <p className="text-xs text-zinc-400 leading-relaxed font-mono whitespace-pre-wrap">
                      {String(call.transcript)}
                    </p>
                  );
                })()}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────
export default function ContactDetailPage() {
  const params = useParams();
  const router = useRouter();
  const contactId = params.id as string;
  const { contact: rawContact, loading: contactLoading } = useContact(contactId);
  const { openWith: openSoftphone, isInCall } = useSoftphone();
  // Call modal state
  const [showCallModal, setShowCallModal] = useState(false);
  const [activeCallId, setActiveCallId] = useState<string | null>(null);
  const [completedCallId, setCompletedCallId] = useState<string | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const [showDisposition, setShowDisposition] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [contact, setContact] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<"activity" | "conversations" | "deals">("activity");
  const [calls, setCalls] = useState<Call[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const statusDropdownRef = useRef<HTMLDivElement>(null);

  // Close status dropdown on click outside
  useEffect(() => {
    if (!statusDropdownOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(e.target as Node)) {
        setStatusDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [statusDropdownOpen]);
  const [tagInput, setTagInput] = useState("");

  const supabase = createClient();

  // Live call updates — ringing → in_progress → completed without page refresh
  const handleCallUpdate = useCallback((updatedCall: Parameters<typeof useRealtimeCalls>[1] extends (c: infer C) => void ? C : never) => {
    setCalls(prev => {
      const exists = prev.find(c => c.id === updatedCall.id);
      if (exists) {
        return prev.map(c => c.id === updatedCall.id ? { ...c, ...updatedCall } : c);
      }
      return [updatedCall as unknown as Call, ...prev];
    });
  }, []);
  useRealtimeCalls(contactId, handleCallUpdate);

  useEffect(() => {
    if (rawContact) setContact({ ...rawContact });
  }, [rawContact]);

  // Load activity data when contact ID is available (not tied to rawContact reference)
  const loadActivityData = useCallback(() => {
    if (!contactId) return;
    setDataLoading(true);
    const sb = createClient();
    Promise.all([
      sb.from("calls").select("*").eq("contact_id", contactId)
        .order("created_at", { ascending: false }).limit(50),
      sb.from("conversations").select("*").eq("contact_id", contactId)
        .order("last_message_at", { ascending: false }),
      sb.from("opportunities").select("*").eq("contact_id", contactId)
        .order("created_at", { ascending: false }),
    ]).then(([callsRes, convsRes, oppsRes]) => {
      if (callsRes.data) setCalls(callsRes.data);
      if (convsRes.data) setConversations(convsRes.data);
      if (oppsRes.data) setOpportunities(oppsRes.data);
      setDataLoading(false);
    });
  }, [contactId]);

  // Initial load — runs on mount and whenever contactId changes
  useEffect(() => {
    if (contact) loadActivityData();
  }, [contact, loadActivityData]);

  // Realtime subscription — new calls appear instantly without navigation
  useEffect(() => {
    if (!contactId) return;
    const sb = createClient();
    const channel = sb
      .channel(`contact-activity:${contactId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "calls", filter: `contact_id=eq.${contactId}` },
        (payload) => {
          setCalls(prev => [payload.new as Call, ...prev]);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "calls", filter: `contact_id=eq.${contactId}` },
        (payload) => {
          setCalls(prev => prev.map(c => c.id === (payload.new as Call).id ? (payload.new as Call) : c));
        }
      )
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [contactId]);

  async function saveField(updates: Record<string, unknown>) {
    await updateContactApi(contactId, updates);
    setContact((prev: Record<string, unknown>) => ({ ...prev, ...updates }));
  }

  async function handleStatusChange(newStatus: string) {
    setStatusDropdownOpen(false);
    await saveField({ status: newStatus });
  }

  async function handleDeleteContact() {
    if (!confirm("Delete this contact permanently?")) return;
    await deleteContact(contactId);
    router.push("/people");
  }

  function handleAddTag(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter" || !tagInput.trim()) return;
    const newTags = [...(contact.tags || []), tagInput.trim()];
    saveField({ tags: newTags });
    setTagInput("");
  }

  function removeTag(tag: string) {
    const newTags = (contact.tags || []).filter((t: string) => t !== tag);
    saveField({ tags: newTags });
  }

  if (contactLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="space-y-6">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="text-center text-zinc-400">Contact not found</div>
      </div>
    );
  }

  const displayName = [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "Unknown";
  const avatarColor = getAvatarColor(displayName);
  const statusOption = STATUS_OPTIONS.find(s => s.value === contact.status) || STATUS_OPTIONS[0];

  return (
    <div>
      <button onClick={() => router.back()} className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors mb-4">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <div className="flex gap-0 h-[calc(100vh-120px)]">
        {/* ── LEFT PANEL ── */}
        <div className="w-80 flex-shrink-0 border-r border-zinc-800 flex flex-col">
          {/* Avatar + Name + Status */}
          <div className="p-6 border-b border-zinc-800">
            <div className="flex items-start gap-4 mb-4">
              <div className={cn("w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold flex-shrink-0 border-2 border-opacity-30", avatarColor)}>
                {(displayName?.[0] || "?").toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-semibold text-white truncate">{displayName}</h2>
                <p className="text-sm text-zinc-500">{contact.company_name || contact.job_title || "No company"}</p>
              </div>
            </div>

            {/* Quick actions — above status so dropdown never overlaps them */}
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => {
                  if (!contact.phone) return;
                  openSoftphone({
                    id: contact.id,
                    firstName: contact.first_name ?? null,
                    lastName: contact.last_name ?? null,
                    phone: contact.phone,
                    company: contact.company_name ?? null,
                  });
                }}
                disabled={!contact.phone || isInCall}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg transition-colors">
                <Phone size={12} /> Call
              </button>
              <button className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-zinc-700 hover:border-zinc-500 text-zinc-400 text-xs rounded-lg transition-colors">
                <MessageSquare size={12} /> SMS
              </button>
              <button className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-zinc-700 hover:border-zinc-500 text-zinc-400 text-xs rounded-lg transition-colors">
                <Mail size={12} /> Email
              </button>
            </div>

            {/* Status dropdown — below buttons so its menu opens downward without covering them */}
            <div ref={statusDropdownRef} className="relative">
              <button
                onClick={() => setStatusDropdownOpen(prev => !prev)}
                className={cn("w-full px-3 py-2 rounded-lg border text-sm font-medium flex items-center justify-between", statusOption.color)}
              >
                <span>{statusOption.label}</span>
                <ChevronDown className={cn("h-4 w-4 transition-transform", statusDropdownOpen && "rotate-180")} />
              </button>
              {statusDropdownOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-50">
                  {STATUS_OPTIONS.map(opt => (
                    <button key={opt.value} onClick={() => handleStatusChange(opt.value)}
                      className={cn("w-full px-3 py-2 text-left text-sm hover:bg-zinc-700 first:rounded-t-lg last:rounded-b-lg",
                        contact.status === opt.value && "bg-zinc-700")}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Scrollable fields */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div>
              <p className="text-xs font-semibold text-zinc-600 uppercase tracking-wide mb-2">Contact Info</p>
              <div className="space-y-3">
                <ContactField label="First Name" value={contact.first_name}
                  onSave={v => saveField({ first_name: v })} />
                <ContactField label="Last Name" value={contact.last_name}
                  onSave={v => saveField({ last_name: v })} />
                <ContactField label="Email" value={contact.email} type="email"
                  onSave={v => saveField({ email: v })} />
                <ContactField label="Phone" value={contact.phone} type="tel"
                  onSave={v => saveField({ phone: v })} />
                <ContactField label="Alternate Phone" value={contact.cell_phone}
                  onSave={v => saveField({ cell_phone: v })} />
                <ContactField label="Company" value={contact.company_name}
                  onSave={v => saveField({ company_name: v })} />
                <ContactField label="Job Title" value={contact.job_title}
                  onSave={v => saveField({ job_title: v })} />

                {/* AI Special Instructions */}
                <div>
                  <p className="text-xs text-zinc-600 mb-1 flex items-center gap-1">
                    <Bot size={10} className="text-indigo-400" />
                    AI Special Instructions
                  </p>
                  <textarea
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:border-indigo-500 focus:outline-none resize-none h-20 placeholder:text-zinc-600"
                    placeholder="Any unique context for the AI when calling this contact... e.g. 'Very price-sensitive. Has 3 kids, mention family protection angle.'"
                    value={(contact as Record<string,unknown>).ai_special_instructions as string || ""}
                    onChange={async (e) => {
                      const val = e.target.value;
                      await saveField({ ai_special_instructions: val } as Record<string, unknown>);
                    }}
                  />
                </div>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-zinc-600 uppercase tracking-wide mb-2">Details</p>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-zinc-600 mb-1">Contact Source</p>
                  <select value={contact.source || ""} onChange={e => saveField({ source: e.target.value })}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500">
                    <option value="">Select source</option>
                    {["Website", "Referral", "Social Media", "Cold Call", "Email Campaign", "Event", "Other"].map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <p className="text-xs text-zinc-600 mb-1">Contact Type</p>
                  <select value={contact.crm_status || "new_lead"} onChange={e => saveField({ crm_status: e.target.value })}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500">
                    {["new_lead", "prospect", "customer", "partner", "vendor"].map(t => (
                      <option key={t} value={t}>{t.replace("_", " ").replace(/\b\w/g, c => c.toUpperCase())}</option>
                    ))}
                  </select>
                </div>
                <ContactField label="City" value={contact.city} onSave={v => saveField({ city: v })} />
                <ContactField label="State" value={contact.state} onSave={v => saveField({ state: v })} />
              </div>
            </div>

            {/* Tags */}
            <div>
              <p className="text-xs font-semibold text-zinc-600 uppercase tracking-wide mb-2">Tags</p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {(contact.tags || []).map((tag: string) => (
                  <span key={tag} className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-400">
                    {tag}
                    <button onClick={() => removeTag(tag)} className="text-zinc-600 hover:text-red-400"><X size={10} /></button>
                  </span>
                ))}
              </div>
              <input value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={handleAddTag}
                placeholder="Add tag + Enter"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-indigo-500 placeholder:text-zinc-600" />
            </div>

            {/* AI Instructions */}
            <div>
              <p className="text-xs font-semibold text-zinc-600 uppercase tracking-wide mb-2">AI Instructions</p>
              <textarea
                value={contact.custom_fields?.ai_instructions || ""}
                onChange={e => saveField({ custom_fields: { ...contact.custom_fields, ai_instructions: e.target.value } })}
                placeholder="Special instructions for the AI agent..."
                rows={3}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-300 resize-none outline-none focus:border-indigo-500 placeholder:text-zinc-600" />
            </div>

            {/* Danger zone */}
            <div className="pt-2 border-t border-zinc-800">
              <button onClick={handleDeleteContact}
                className="w-full py-2 text-xs text-red-500 border border-red-500/20 rounded-lg hover:bg-red-500/10 transition-colors">
                Delete Contact
              </button>
            </div>
          </div>
        </div>

        {/* ── RIGHT PANEL ── */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Tabs */}
          <div className="flex border-b border-zinc-800 px-6 pt-4">
            {(
              [
                { id: "activity", label: "Activity", icon: PhoneCall },
                { id: "conversations", label: "Conversations", icon: MessageSquare },
                { id: "deals", label: "Deals", icon: TrendingUp },
              ] as const
            ).map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setActiveTab(id)}
                className={cn("flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px",
                  activeTab === id ? "border-indigo-500 text-indigo-400" : "border-transparent text-zinc-500 hover:text-zinc-300")}>
                <Icon size={13} /> {label}
              </button>
            ))}
          </div>

          {/* Activity Tab */}
          {activeTab === "activity" && (
            <div className="flex-1 overflow-y-auto p-6 space-y-3">
              {dataLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
                </div>
              ) : calls.length === 0 ? (
                <div className="text-center py-12 text-zinc-600">
                  <Phone size={24} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No activity yet</p>
                </div>
              ) : (
                calls.map(c => <CallActivityCard key={c.id} call={c} />)
              )}
            </div>
          )}

          {/* Conversations Tab */}
          {activeTab === "conversations" && (
            <div className="flex-1 overflow-y-auto p-6">
              {dataLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
                </div>
              ) : conversations.length === 0 ? (
                <div className="py-12 text-center text-zinc-500">
                  <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No conversations</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {conversations.map(conv => (
                    <div key={conv.id} className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 hover:bg-zinc-800/50 transition-colors cursor-pointer">
                      <div className="flex items-start justify-between mb-2">
                        <p className="text-sm font-medium text-white capitalize">{conv.channel}</p>
                        <span className="text-xs text-zinc-500">{new Date(conv.last_message_at || "").toLocaleDateString()}</span>
                      </div>
                      <p className="text-sm text-zinc-300 line-clamp-2">{conv.last_message || "No messages yet"}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Deals Tab */}
          {activeTab === "deals" && (
            <div className="flex-1 overflow-y-auto p-6">
              {dataLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
                </div>
              ) : opportunities.length === 0 ? (
                <div className="py-12 text-center text-zinc-500 space-y-3">
                  <TrendingUp className="h-10 w-10 mx-auto opacity-30" />
                  <div>
                    <p className="text-sm">No deals linked</p>
                    <a href="/opportunities" className="text-xs text-indigo-400 hover:text-indigo-300 mt-2 inline-block">Go to Opportunities</a>
                  </div>
                </div>
              ) : (
                <div className="grid gap-4">
                  {opportunities.map(opp => {
                    const oppStatus = STATUS_OPTIONS.find(s => s.value === opp.status) || STATUS_OPTIONS[0];
                    return (
                      <div key={opp.id} className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 hover:bg-zinc-800/50 transition-colors">
                        <div className="flex items-start justify-between mb-2">
                          <h3 className="text-sm font-medium text-white">{opp.name}</h3>
                          <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", oppStatus.color)}>{oppStatus.label}</span>
                        </div>
                        <p className="text-sm text-indigo-400 font-semibold">${(opp.value || 0).toLocaleString()}</p>
                        {opp.expected_close_date && (
                          <p className="text-xs text-zinc-500 mt-2">Expected close: {new Date(opp.expected_close_date).toLocaleDateString()}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Call Modals ── */}
      {showCallModal && (
        <InitiateCallModal
          contactName={`${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim()}
          contactPhone={contact.phone ?? ''}
          contactId={contact.id}
          onClose={() => setShowCallModal(false)}
          onCallStarted={(callRecordId) => {
            setActiveCallId(callRecordId);
            setCallDuration(0);
            setShowCallModal(false);
          }}
        />
      )}

      {activeCallId && (
        <ActiveCallPanel
          callRecordId={activeCallId}
          contactName={`${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim()}
          contactPhone={contact?.phone ?? ''}
          onCallEnded={(duration) => {
            setCallDuration(duration ?? 0);
            setCompletedCallId(activeCallId);
            setActiveCallId(null);
            setShowDisposition(true);
          }}
        />
      )}

      {showDisposition && (
        <PostCallDisposition
          callRecordId={completedCallId ?? ''}
          contactName={`${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim()}
          duration={callDuration}
          onDone={() => {
            setShowDisposition(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
