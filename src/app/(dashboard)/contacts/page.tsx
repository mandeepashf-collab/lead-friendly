"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Plus,
  Upload,
  Download,
  Phone,
  Mail,
  Building2,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Edit2,
  Eye,
  X,
  ArrowUpDown,
  UserPlus,
  FileSpreadsheet,
  PhoneCall,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useContacts, deleteContact } from "@/hooks/use-contacts";
import { ContactDialog } from "./contact-dialog";
import { ContactDetail } from "./contact-detail";
import { ImportDialog } from "./import-dialog";
import type { Contact } from "@/types/database";
import InitiateCallModal from "@/components/calls/InitiateCallModal";
import { useSoftphone } from "@/components/softphone/SoftphoneContext";

const STATUS_OPTIONS = [
  { value: "all", label: "All", color: "" },
  { value: "new", label: "New", color: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  { value: "contacted", label: "Contacted", color: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  { value: "qualified", label: "Qualified", color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  { value: "proposal", label: "Proposal", color: "bg-purple-500/10 text-purple-400 border-purple-500/20" },
  { value: "won", label: "Won", color: "bg-green-500/10 text-green-400 border-green-500/20" },
  { value: "lost", label: "Lost", color: "bg-red-500/10 text-red-400 border-red-500/20" },
];

function StatusBadge({ status }: { status: string }) {
  const opt = STATUS_OPTIONS.find((s) => s.value === status) || STATUS_OPTIONS[1];
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", opt.color)}>
      {opt.label}
    </span>
  );
}

export default function ContactsPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [sortBy, setSortBy] = useState("created_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [callModalContact, setCallModalContact] = useState<Contact | null>(null);
  const [callToast, setCallToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const { openWith: openSoftphone } = useSoftphone();
  const PAGE_SIZE = 25;

  const openCallModal = useCallback((contact: Contact) => {
    if (!contact.phone) {
      setCallToast({ msg: "No phone number on this contact", ok: false });
      setTimeout(() => setCallToast(null), 4000);
      return;
    }
    openSoftphone({
      id: contact.id,
      firstName: contact.first_name ?? null,
      lastName: contact.last_name ?? null,
      phone: contact.phone,
      company: contact.company_name ?? null,
    });
  }, [openSoftphone]);

  const { contacts, count, loading, refetch } = useContacts({
    search: search || undefined,
    status: statusFilter,
    sortBy,
    sortOrder,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const totalPages = Math.ceil(count / PAGE_SIZE);

  const toggleSort = (field: string) => {
    if (sortBy === field) setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    else { setSortBy(field); setSortOrder("asc"); }
  };

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm("Delete this contact? This cannot be undone.")) return;
    await deleteContact(id);
    refetch();
  }, [refetch]);

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

  const formatName = (c: Contact) => {
    const parts = [c.first_name, c.last_name].filter(Boolean);
    return parts.length > 0 ? parts.join(" ") : "Unnamed Contact";
  };

  const getInitials = (c: Contact) => {
    const f = c.first_name?.[0] || "";
    const l = c.last_name?.[0] || "";
    return (f + l).toUpperCase() || "?";
  };

  return (
    <div className="space-y-4">
      {/* Call Toast */}
      {callToast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg ${
          callToast.ok
            ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
            : "border-red-500/20 bg-red-500/10 text-red-400"
        }`}>
          <PhoneCall className="h-4 w-4 shrink-0" />
          {callToast.msg}
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Contacts</h1>
          <p className="text-sm text-zinc-400">{count} total contact{count !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowImport(true)} className="flex h-9 items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-zinc-300 hover:bg-zinc-700">
            <Upload className="h-4 w-4" />Import CSV
          </button>
          <button className="flex h-9 items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-zinc-300 hover:bg-zinc-700">
            <Download className="h-4 w-4" />Export
          </button>
          <button onClick={() => { setEditContact(null); setShowAddDialog(true); }} className="flex h-9 items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700">
            <Plus className="h-4 w-4" />Add Contact
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder="Search contacts..." className="h-9 w-full rounded-lg border border-zinc-800 bg-zinc-900 pl-10 pr-8 text-sm text-zinc-300 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none" />
          {search && <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"><X className="h-3.5 w-3.5" /></button>}
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900 p-0.5">
          {STATUS_OPTIONS.map((opt) => (
            <button key={opt.value} onClick={() => { setStatusFilter(opt.value); setPage(0); }}
              className={cn("rounded-md px-3 py-1.5 text-xs font-medium transition-colors", statusFilter === opt.value ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-200")}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Bulk Actions */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-indigo-500/20 bg-indigo-500/5 px-4 py-2">
          <span className="text-sm text-indigo-400">{selectedIds.size} selected</span>
          <button className="text-xs text-zinc-400 hover:text-white">Change Status</button>
          <button className="text-xs text-zinc-400 hover:text-white">Add Tag</button>
          <button className="text-xs text-red-400 hover:text-red-300">Delete</button>
          <button onClick={() => setSelectedIds(new Set())} className="ml-auto text-xs text-zinc-500 hover:text-zinc-300">Clear</button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="w-10 px-4 py-3">
                  <input type="checkbox" checked={contacts.length > 0 && selectedIds.size === contacts.length} onChange={() => { if (selectedIds.size === contacts.length) setSelectedIds(new Set()); else setSelectedIds(new Set(contacts.map(c => c.id))); }}
                    className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 accent-indigo-600" />
                </th>
                {[
                  { key: "first_name", label: "Contact", sortable: true },
                  { key: "email", label: "Email", sortable: true },
                  { key: "phone", label: "Phone", sortable: false },
                  { key: "company_name", label: "Company", sortable: false },
                  { key: "status", label: "Status", sortable: true },
                  { key: "source", label: "Source", sortable: false },
                  { key: "created_at", label: "Added", sortable: true },
                ].map((col) => (
                  <th key={col.key} className="px-4 py-3 text-left">
                    {col.sortable ? (
                      <button onClick={() => toggleSort(col.key)} className="flex items-center gap-1 text-xs font-medium uppercase text-zinc-500 hover:text-zinc-300">
                        {col.label}<ArrowUpDown className="h-3 w-3" />
                      </button>
                    ) : (
                      <span className="text-xs font-medium uppercase text-zinc-500">{col.label}</span>
                    )}
                  </th>
                ))}
                <th className="w-10 px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-16 text-center">
                  <div className="flex items-center justify-center gap-2 text-zinc-500">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-600 border-t-indigo-500" />Loading...
                  </div>
                </td></tr>
              ) : contacts.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-16 text-center">
                  <div className="flex flex-col items-center gap-3 text-zinc-600">
                    <UserPlus className="h-10 w-10" />
                    <p className="text-sm font-medium">{search || statusFilter !== "all" ? "No contacts match your filters" : "No contacts yet"}</p>
                    <div className="flex gap-2 mt-2">
                      <button onClick={() => setShowAddDialog(true)} className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700">
                        <Plus className="h-3.5 w-3.5" />Add Contact
                      </button>
                      <button onClick={() => setShowImport(true)} className="flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800">
                        <FileSpreadsheet className="h-3.5 w-3.5" />Import CSV
                      </button>
                    </div>
                  </div>
                </td></tr>
              ) : contacts.map((contact) => {
                const goToContact = () => router.push(`/people/${contact.id}`);
                return (
                <tr key={contact.id} className="group hover:bg-zinc-800/30">
                  {/* Checkbox — does NOT navigate */}
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selectedIds.has(contact.id)} onChange={() => toggleSelect(contact.id)}
                      className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 accent-indigo-600" />
                  </td>
                  {/* Name cell — explicit navigate */}
                  <td className="px-4 py-3 cursor-pointer" onClick={goToContact}>
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-600/20 text-xs font-medium text-indigo-400">{getInitials(contact)}</div>
                      <span className="text-sm font-medium text-white group-hover:text-indigo-300 transition-colors">{formatName(contact)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 cursor-pointer" onClick={goToContact}>
                    {contact.email ? (
                      <span className="flex items-center gap-1.5 text-sm text-zinc-400"><Mail className="h-3.5 w-3.5 shrink-0" /><span className="truncate max-w-[180px]">{contact.email}</span></span>
                    ) : <span className="text-sm text-zinc-600">—</span>}
                  </td>
                  <td className="px-4 py-3 cursor-pointer" onClick={goToContact}>
                    {contact.phone ? (
                      <span className="flex items-center gap-1.5 text-sm text-zinc-400"><Phone className="h-3.5 w-3.5 shrink-0" />{contact.phone}</span>
                    ) : <span className="text-sm text-zinc-600">—</span>}
                  </td>
                  <td className="px-4 py-3 cursor-pointer" onClick={goToContact}>
                    {contact.company_name ? (
                      <span className="flex items-center gap-1.5 text-sm text-zinc-400"><Building2 className="h-3.5 w-3.5 shrink-0" /><span className="truncate max-w-[140px]">{contact.company_name}</span></span>
                    ) : <span className="text-sm text-zinc-600">—</span>}
                  </td>
                  <td className="px-4 py-3 cursor-pointer" onClick={goToContact}><StatusBadge status={contact.status} /></td>
                  <td className="px-4 py-3 cursor-pointer" onClick={goToContact}><span className="text-sm capitalize text-zinc-500">{contact.source?.replace(/_/g, " ") || "—"}</span></td>
                  <td className="px-4 py-3 cursor-pointer" onClick={goToContact}><span className="text-sm text-zinc-500">{new Date(contact.created_at).toLocaleDateString()}</span></td>
                  {/* Actions — does NOT navigate (stopPropagation on the cell) */}
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => openCallModal(contact)}
                        className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium bg-indigo-600/10 text-indigo-400 hover:bg-indigo-600/20"
                        title="Call (manual or AI — choose inside)"
                      >
                        <PhoneCall className="h-3.5 w-3.5" />
                        Call
                      </button>
                      <button onClick={goToContact} className="rounded p-1 text-zinc-500 hover:bg-zinc-700 hover:text-white" title="View"><Eye className="h-4 w-4" /></button>
                      <button onClick={() => { setEditContact(contact); setShowAddDialog(true); }} className="rounded p-1 text-zinc-500 hover:bg-zinc-700 hover:text-white" title="Edit"><Edit2 className="h-4 w-4" /></button>
                      <button onClick={() => handleDelete(contact.id)} className="rounded p-1 text-zinc-500 hover:bg-red-500/10 hover:text-red-400" title="Delete"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-zinc-800 px-4 py-3">
            <p className="text-sm text-zinc-500">Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, count)} of {count}</p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
              {Array.from({ length: Math.min(totalPages, 5) }).map((_, i) => (
                <button key={i} onClick={() => setPage(i)} className={cn("h-8 w-8 rounded-lg text-sm", page === i ? "bg-indigo-600 text-white" : "text-zinc-400 hover:bg-zinc-800")}>{i + 1}</button>
              ))}
              <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
        )}
      </div>

      {/* Dialogs */}
      {showAddDialog && <ContactDialog contact={editContact} onClose={() => { setShowAddDialog(false); setEditContact(null); }} onSaved={() => { setShowAddDialog(false); setEditContact(null); refetch(); }} />}
      {showDetail && selectedContact && <ContactDetail contact={selectedContact} onClose={() => { setShowDetail(false); setSelectedContact(null); }} onEdit={() => { setShowDetail(false); setEditContact(selectedContact); setShowAddDialog(true); }} onDeleted={() => { setShowDetail(false); setSelectedContact(null); refetch(); }} />}
      {showImport && <ImportDialog onClose={() => setShowImport(false)} onImported={() => { setShowImport(false); refetch(); }} />}
      {callModalContact && callModalContact.phone && (
        <InitiateCallModal
          contactName={[callModalContact.first_name, callModalContact.last_name].filter(Boolean).join(" ") || "Unnamed"}
          contactPhone={callModalContact.phone}
          contactId={callModalContact.id}
          onClose={() => setCallModalContact(null)}
          onCallStarted={() => {
            setCallModalContact(null);
            setCallToast({ msg: "✓ Call initiated", ok: true });
            setTimeout(() => setCallToast(null), 5000);
          }}
        />
      )}
    </div>
  );
}
