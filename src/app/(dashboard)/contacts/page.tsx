"use client";

import { useState, useEffect, useCallback } from "react";
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
import { createClient } from "@/lib/supabase/client";
import { ContactDialog } from "./contact-dialog";
import { ContactDetail } from "./contact-detail";
import { ImportDialog } from "./import-dialog";
import type { Contact } from "@/types/database";
import { useSoftphone } from "@/components/softphone/SoftphoneContext";
import { InlineCallTrigger } from "@/components/softphone/InlineCallTrigger";
import { Settings as SettingsIcon } from "lucide-react";
import { ManageFieldsDrawer } from "@/components/contacts/ManageFieldsDrawer";
import { CustomFieldCell } from "@/components/contacts/CustomFieldCell";
import {
  listCustomFields,
  type CustomFieldDefinition,
} from "@/lib/contacts/custom-fields";
import {
  getTablePreferences,
  CONTACTS_DEFAULT_COLUMNS,
  type ColumnPref,
} from "@/lib/contacts/table-preferences";

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
  const [callToast, setCallToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const { openWith: openSoftphone } = useSoftphone();
  const PAGE_SIZE = 25;

  // ── Phase 2b: column prefs + custom field defs ──
  const [showFieldsDrawer, setShowFieldsDrawer] = useState(false);
  const [columnPrefs, setColumnPrefs] = useState<ColumnPref[]>(CONTACTS_DEFAULT_COLUMNS);
  const [customFieldDefs, setCustomFieldDefs] = useState<CustomFieldDefinition[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [prefs, defs] = await Promise.all([
        getTablePreferences("contacts"),
        listCustomFields(),
      ]);
      if (cancelled) return;
      if (prefs && prefs.length > 0) setColumnPrefs(prefs);
      setCustomFieldDefs(defs);
    })();
    return () => { cancelled = true; };
  }, []);

  // Visible custom-field columns to render in the table, in pref order.
  const visibleCustomColumns = columnPrefs
    .filter((c) => c.visible && c.field_key.startsWith("custom:"))
    .map((c) => {
      const slug = c.field_key.slice(7);
      return customFieldDefs.find((d) => d.field_key === slug);
    })
    .filter((d): d is CustomFieldDefinition => d !== undefined);

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

  // ── Bulk delete (Stage 1.6.1) ────────────────────────────────────
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setDeleting(true);
    try {
      const ids = Array.from(selectedIds);
      const supabase = createClient();
      const { data, error } = await supabase.rpc("bulk_delete_contacts", {
        p_contact_ids: ids,
      });
      if (error) {
        console.error("[bulk_delete] RPC error:", error);
        setCallToast({ msg: `Delete failed: ${error.message}`, ok: false });
        setTimeout(() => setCallToast(null), 4000);
        return;
      }
      const deletedCount = (data as { deleted_count: number }[] | null)?.[0]?.deleted_count ?? 0;
      setSelectedIds(new Set());
      setConfirmDeleteOpen(false);
      await refetch();
      setCallToast({
        msg: `Deleted ${deletedCount} contact${deletedCount === 1 ? "" : "s"}`,
        ok: true,
      });
      setTimeout(() => setCallToast(null), 3000);
    } finally {
      setDeleting(false);
    }
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
          <button
            onClick={() => setShowFieldsDrawer(true)}
            className="flex h-9 items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-zinc-300 hover:bg-zinc-700"
            title="Manage fields"
          >
            <SettingsIcon className="h-4 w-4" />Manage fields
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
          <button onClick={() => setConfirmDeleteOpen(true)} className="text-xs text-red-400 hover:text-red-300">Delete</button>
          <button onClick={() => setSelectedIds(new Set())} className="ml-auto text-xs text-zinc-500 hover:text-zinc-300">Clear</button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="w-12 px-3 py-3">
                  {/* Stage 1.6.3: widen column + appearance-none so the checkbox
                      renders as a visible dark-theme pill instead of a near-invisible
                      native control on the zinc background. */}
                  <input
                    type="checkbox"
                    checked={contacts.length > 0 && selectedIds.size === contacts.length}
                    onChange={() => { if (selectedIds.size === contacts.length) setSelectedIds(new Set()); else setSelectedIds(new Set(contacts.map(c => c.id))); }}
                    aria-label="Select all contacts"
                    className="h-4 w-4 appearance-none rounded border border-zinc-500 bg-zinc-800 cursor-pointer hover:border-indigo-400 checked:border-indigo-500 checked:bg-indigo-600 checked:bg-[url('data:image/svg+xml;utf8,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%2016%2016%22%3E%3Cpath%20fill=%22none%22%20stroke=%22white%22%20stroke-width=%222%22%20stroke-linecap=%22round%22%20stroke-linejoin=%22round%22%20d=%22M3.5%208.5l3%203%206-7%22/%3E%3C/svg%3E')] checked:bg-center checked:bg-no-repeat"
                  />
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
                {/* Phase 2b: dynamic custom-field columns */}
                {visibleCustomColumns.map((def) => (
                  <th key={`custom-${def.id}`} className="px-4 py-3 text-left">
                    <span className="text-xs font-medium uppercase text-zinc-500">{def.name}</span>
                  </th>
                ))}
                <th className="w-10 px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {loading ? (
                <tr><td colSpan={9 + visibleCustomColumns.length} className="px-4 py-16 text-center">
                  <div className="flex items-center justify-center gap-2 text-zinc-500">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-600 border-t-indigo-500" />Loading...
                  </div>
                </td></tr>
              ) : contacts.length === 0 ? (
                <tr><td colSpan={9 + visibleCustomColumns.length} className="px-4 py-16 text-center">
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
                  <td className="w-12 px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(contact.id)}
                      onChange={() => toggleSelect(contact.id)}
                      aria-label={`Select ${formatName(contact)}`}
                      className="h-4 w-4 appearance-none rounded border border-zinc-500 bg-zinc-800 cursor-pointer hover:border-indigo-400 checked:border-indigo-500 checked:bg-indigo-600 checked:bg-[url('data:image/svg+xml;utf8,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%2016%2016%22%3E%3Cpath%20fill=%22none%22%20stroke=%22white%22%20stroke-width=%222%22%20stroke-linecap=%22round%22%20stroke-linejoin=%22round%22%20d=%22M3.5%208.5l3%203%206-7%22/%3E%3C/svg%3E')] checked:bg-center checked:bg-no-repeat"
                    />
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
                  {/* Phase 2b: custom-field columns */}
                  {visibleCustomColumns.map((def) => {
                    const blob = (contact as Contact & { custom_fields?: Record<string, unknown> | null }).custom_fields;
                    const rawValue = blob?.[def.field_key];
                    return (
                      <td key={`cell-${def.id}`} className="px-4 py-3 cursor-pointer" onClick={goToContact}>
                        <CustomFieldCell fieldKey={def.field_key} fieldType={def.field_type} rawValue={rawValue} />
                      </td>
                    );
                  })}
                  {/* Actions — does NOT navigate (stopPropagation on the cell) */}
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <InlineCallTrigger contact={contact}>
                        <button
                          onClick={() => openCallModal(contact)}
                          className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium bg-indigo-600/10 text-indigo-400 hover:bg-indigo-600/20"
                          title="Call (manual or AI — choose inside)"
                        >
                          <PhoneCall className="h-3.5 w-3.5" />
                          Call
                        </button>
                      </InlineCallTrigger>
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

      {/* Phase 2b: Manage Fields drawer */}
      {showFieldsDrawer && (
        <ManageFieldsDrawer
          currentColumns={columnPrefs}
          onClose={() => setShowFieldsDrawer(false)}
          onApplied={(next) => { setColumnPrefs(next); setShowFieldsDrawer(false); }}
        />
      )}

      {/* Bulk delete confirmation (Stage 1.6.1) */}
      {confirmDeleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
             onClick={() => !deleting && setConfirmDeleteOpen(false)}>
          <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl p-6"
               onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-white mb-2">
              Delete {selectedIds.size} contact{selectedIds.size === 1 ? "" : "s"}?
            </h3>
            <p className="text-sm text-zinc-400 mb-4">
              This will permanently delete the selected contacts and their associated
              tags, calls, and activity. This cannot be undone.
            </p>
            <ul className="text-sm text-zinc-300 mb-4 max-h-32 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2">
              {contacts
                .filter((c) => selectedIds.has(c.id))
                .slice(0, 20)
                .map((c) => (
                  <li key={c.id}>
                    {formatName(c)}
                    {c.email ? ` · ${c.email}` : ""}
                  </li>
                ))}
              {selectedIds.size > 20 && (
                <li className="italic text-zinc-500">
                  ...and {selectedIds.size - 20} more
                </li>
              )}
            </ul>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteOpen(false)}
                disabled={deleting}
                className="h-9 rounded-lg border border-zinc-700 px-4 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBulkDelete}
                disabled={deleting}
                className="h-9 rounded-lg bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
