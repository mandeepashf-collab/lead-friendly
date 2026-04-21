"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  X, Edit2, Trash2, Phone, Mail, Building2, MapPin,
  MessageSquare, Target, User, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { deleteContact } from "@/hooks/use-contacts";
import type { Contact } from "@/types/database";
import { useSoftphone } from "@/components/softphone/SoftphoneContext";

interface Props {
  contact: Contact;
  onClose: () => void;
  onEdit: () => void;
  onDeleted: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  new: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  contacted: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  qualified: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  proposal: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  negotiation: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  won: "bg-green-500/10 text-green-400 border-green-500/20",
  lost: "bg-red-500/10 text-red-400 border-red-500/20",
  do_not_contact: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
};

// ── Call History sub-component ────────────────────────────────────
function ContactCallHistory({ contactId }: { contactId: string }) {
  const [calls, setCalls] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase.from("calls")
      .select("id, status, duration_seconds, outcome, created_at, ai_agent_id, ai_agents(name)")
      .eq("contact_id", contactId)
      .order("created_at", { ascending: false })
      .limit(10)
      .then(({ data }) => {
        setCalls(data || []);
        setLoading(false);
      });
  }, [contactId]);

  if (loading) return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold uppercase text-zinc-500">Call History</h4>
      <div className="flex items-center gap-2 text-zinc-600 text-xs py-3"><Loader2 className="h-3 w-3 animate-spin" /> Loading…</div>
    </div>
  );

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold uppercase text-zinc-500">Call History ({calls.length})</h4>
      {calls.length === 0 ? (
        <div className="flex items-center justify-center rounded-lg border border-zinc-800 bg-zinc-800/50 py-6 text-zinc-600">
          <div className="text-center"><Phone className="mx-auto h-6 w-6" /><p className="mt-2 text-xs">No calls recorded yet</p></div>
        </div>
      ) : (
        <div className="space-y-1.5">
          {calls.map(c => {
            const agentObj = c.ai_agents as Record<string, string> | null;
            const dur = c.duration_seconds as number;
            const mins = Math.floor(dur / 60);
            const secs = dur % 60;
            return (
              <Link key={c.id as string} href={`/calls/${c.id}`}
                className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-800/50 p-2.5 hover:border-zinc-700 transition-colors">
                <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                  c.outcome === "appointment_booked" ? "bg-emerald-600/20" : c.status === "completed" ? "bg-indigo-600/20" : "bg-zinc-700/50")}>
                  <Phone className={cn("h-3 w-3",
                    c.outcome === "appointment_booked" ? "text-emerald-400" : c.status === "completed" ? "text-indigo-400" : "text-zinc-500")} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-zinc-300 truncate">
                      {agentObj?.name || "Unknown Agent"}
                    </p>
                    {typeof c.outcome === "string" && c.outcome && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-700 text-zinc-400">
                        {c.outcome.replace(/_/g, " ")}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-zinc-500">
                    {new Date(c.created_at as string).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    {dur > 0 && ` · ${mins}:${String(secs).padStart(2, "0")}`}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Activity Timeline sub-component ──────────────────────────────
function ContactActivityTimeline({ contact }: { contact: Contact }) {
  const [activities, setActivities] = useState<{ type: string; label: string; detail: string; date: string }[]>([]);

  useEffect(() => {
    const items: typeof activities = [];
    items.push({ type: "created", label: "Contact created", detail: "", date: contact.created_at });
    if (contact.updated_at !== contact.created_at) {
      items.push({ type: "updated", label: "Contact updated", detail: "", date: contact.updated_at });
    }
    if (contact.tags?.length > 0) {
      items.push({ type: "tagged", label: `Tagged: ${contact.tags.join(", ")}`, detail: "", date: contact.updated_at });
    }
    if (contact.status === "do_not_contact") {
      items.push({ type: "dnc", label: "Marked Do Not Contact", detail: "", date: contact.updated_at });
    }
    items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setActivities(items);
  }, [contact]);

  const iconFor = (type: string) => {
    if (type === "created") return <User className="h-3 w-3 text-indigo-400" />;
    if (type === "tagged") return <Target className="h-3 w-3 text-amber-400" />;
    if (type === "dnc") return <Phone className="h-3 w-3 text-red-400" />;
    return <Edit2 className="h-3 w-3 text-zinc-400" />;
  };

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold uppercase text-zinc-500">Activity</h4>
      <div className="space-y-3">
        {activities.map((a, i) => (
          <div key={i} className="flex gap-3">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-800">
              {iconFor(a.type)}
            </div>
            <div>
              <p className="text-sm text-zinc-300">{a.label}</p>
              <p className="text-xs text-zinc-500">{new Date(a.date).toLocaleString()}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ContactDetail({ contact, onClose, onEdit, onDeleted }: Props) {
  const name = [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "Unnamed";
  const initials = ((contact.first_name?.[0] || "") + (contact.last_name?.[0] || "")).toUpperCase() || "?";
  const { openWith: openSoftphone, isInCall } = useSoftphone();

  const handleDelete = async () => {
    if (!confirm("Delete this contact permanently?")) return;
    await deleteContact(contact.id);
    onDeleted();
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md overflow-y-auto border-l border-zinc-800 bg-zinc-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-800 bg-zinc-900 px-6 py-4">
          <h2 className="text-lg font-semibold text-white">Contact Details</h2>
          <div className="flex items-center gap-1">
            <button onClick={onEdit} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white" title="Edit"><Edit2 className="h-4 w-4" /></button>
            <button onClick={handleDelete} className="rounded-lg p-1.5 text-zinc-400 hover:bg-red-500/10 hover:text-red-400" title="Delete"><Trash2 className="h-4 w-4" /></button>
            <button onClick={onClose} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white"><X className="h-5 w-5" /></button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Profile Card */}
          <div className="text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-indigo-600/20 text-xl font-bold text-indigo-400">
              {initials}
            </div>
            <h3 className="mt-3 text-xl font-semibold text-white">{name}</h3>
            {contact.job_title && <p className="text-sm text-zinc-400">{contact.job_title}</p>}
            {contact.company_name && (
              <p className="flex items-center justify-center gap-1 text-sm text-zinc-500">
                <Building2 className="h-3.5 w-3.5" />{contact.company_name}
              </p>
            )}
            {contact.lender_name && (
              <p className="flex items-center justify-center gap-1 text-sm text-zinc-500">
                <Building2 className="h-3.5 w-3.5" />
                <span>
                  <span className="text-zinc-600">Lender: </span>
                  {contact.lender_name}
                </span>
              </p>
            )}
            <div className="mt-3">
              <span className={cn("inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium", STATUS_COLORS[contact.status || "new"] || STATUS_COLORS.new)}>
               {(contact.status || "new").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
              </span>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-4 gap-2">
            {contact.phone && (
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
                title="Call this contact"
                className="flex flex-col items-center gap-1 rounded-lg border border-indigo-500/30 bg-indigo-500/10 p-3 text-indigo-400 hover:bg-indigo-500/20 disabled:opacity-40 disabled:cursor-not-allowed">
                <Phone className="h-5 w-5" />
                <span className="text-xs">Call</span>
              </button>
            )}
            {contact.email && (
              <a href={`mailto:${contact.email}`} className="flex flex-col items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-800 p-3 text-zinc-400 hover:bg-zinc-700 hover:text-white">
                <Mail className="h-5 w-5" /><span className="text-xs">Email</span>
              </a>
            )}
            <button className="flex flex-col items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-800 p-3 text-zinc-400 hover:bg-zinc-700 hover:text-white">
              <MessageSquare className="h-5 w-5" /><span className="text-xs">SMS</span>
            </button>
          </div>

          {/* Contact Info */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase text-zinc-500">Contact Information</h4>

            {contact.email && (
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 shrink-0 text-zinc-500" />
                <div>
                  <p className="text-xs text-zinc-500">Email</p>
                  <p className="text-sm text-white">{contact.email}</p>
                </div>
              </div>
            )}

            {contact.phone && (
              <div className="flex items-center gap-3">
                <Phone className="h-4 w-4 shrink-0 text-zinc-500" />
                <div>
                  <p className="text-xs text-zinc-500">Phone</p>
                  <p className="text-sm text-white">{contact.phone}</p>
                </div>
              </div>
            )}

            {(contact.address_line1 || contact.city) && (
              <div className="flex items-center gap-3">
                <MapPin className="h-4 w-4 shrink-0 text-zinc-500" />
                <div>
                  <p className="text-xs text-zinc-500">Address</p>
                  <p className="text-sm text-white">
                    {[contact.address_line1, contact.city, contact.state, contact.zip_code].filter(Boolean).join(", ")}
                  </p>
                </div>
              </div>
            )}

            {contact.source && (
              <div className="flex items-center gap-3">
                <Target className="h-4 w-4 shrink-0 text-zinc-500" />
                <div>
                  <p className="text-xs text-zinc-500">Source</p>
                  <p className="text-sm capitalize text-white">{contact.source.replace(/_/g, " ")}</p>
                </div>
              </div>
            )}
          </div>

          {/* Tags */}
          {contact.tags && contact.tags.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase text-zinc-500">Tags</h4>
              <div className="flex flex-wrap gap-1.5">
                {contact.tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-zinc-800 border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Call History — real data */}
          <ContactCallHistory contactId={contact.id} />

          {/* Activity Timeline — real data */}
          <ContactActivityTimeline contact={contact} />

          {/* Metadata */}
          <div className="rounded-lg bg-zinc-800/50 p-3 text-xs text-zinc-500 space-y-1">
            <p>Lead Score: <span className="text-zinc-300">{contact.lead_score}</span></p>
            <p>Created: <span className="text-zinc-300">{new Date(contact.created_at).toLocaleString()}</span></p>
            <p>Updated: <span className="text-zinc-300">{new Date(contact.updated_at).toLocaleString()}</span></p>
            <p className="text-[10px] text-zinc-600 font-mono">ID: {contact.id}</p>
          </div>
        </div>
      </div>
    </div>
  );
}