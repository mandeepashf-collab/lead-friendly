"use client";

import { useState } from "react";
import { X, Loader2, User, Mail, Phone, Building2, MapPin, Globe, Tag } from "lucide-react";
import { createContact, updateContact } from "@/hooks/use-contacts";
import { setContactTags } from "@/hooks/use-contact-tags";
import type { Contact } from "@/types/database";
import { CONTACT_STATUS_VALUES } from "@/lib/contacts/statuses";

interface Props {
  contact: Contact | null;
  onClose: () => void;
  onSaved: () => void;
}

const STATUS_OPTIONS = CONTACT_STATUS_VALUES;

const SOURCE_OPTIONS = [
  "website", "referral", "cold_call", "csv_import", "facebook", "google", "linkedin", "other",
];

export function ContactDialog({ contact, onClose, onSaved }: Props) {
  const isEdit = !!contact;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    first_name: contact?.first_name || "",
    last_name: contact?.last_name || "",
    email: contact?.email || "",
    phone: contact?.phone || "",
    company_name: contact?.company_name || "",
    lender_name: contact?.lender_name || "",
    job_title: contact?.job_title || "",
    website: contact?.website || "",
    address_line1: contact?.address_line1 || "",
    city: contact?.city || "",
    state: contact?.state || "",
    zip_code: contact?.zip_code || "",
    country: contact?.country || "US",
    status: contact?.status || "new",
    source: contact?.source || "",
    tags: contact?.tags?.join(", ") || "",
  });

  const update = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    const nextTags = form.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    // Write every field EXCEPT tags through the normal contact writer.
    // Tags go through the RPC so contact_tags stays in sync.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { tags: _formTags, ...rest } = form;
    const payload = rest;

    let savedContactId: string;
    if (isEdit && contact) {
      const { error } = await updateContact(contact.id, payload);
      if (error) { setError(error); setSaving(false); return; }
      savedContactId = contact.id;
    } else {
      const { data, error } = await createContact(payload);
      if (error || !data) {
        setError(error || "Failed to create contact");
        setSaving(false);
        return;
      }
      savedContactId = data.id;
    }

    // Sync tags via RPC. For edit: diff against current. For create: pure add.
    const currentTags = contact?.tags ?? [];
    await setContactTags(savedContactId, currentTags, nextTags, "manual");

    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
          <h2 className="text-lg font-semibold text-white">
            {isEdit ? "Edit Contact" : "Add New Contact"}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">{error}</div>
          )}

          {/* Name Row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">First Name *</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
                <input type="text" value={form.first_name} onChange={(e) => update("first_name", e.target.value)} required
                  className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 pl-10 pr-3 text-sm text-white placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none" placeholder="John" />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">Last Name</label>
              <input type="text" value={form.last_name} onChange={(e) => update("last_name", e.target.value)}
                className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-white placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none" placeholder="Doe" />
            </div>
          </div>

          {/* Email & Phone */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
                <input type="email" value={form.email} onChange={(e) => update("email", e.target.value)}
                  className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 pl-10 pr-3 text-sm text-white placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none" placeholder="john@example.com" />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">Phone</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
                <input type="tel" value={form.phone} onChange={(e) => update("phone", e.target.value)}
                  className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 pl-10 pr-3 text-sm text-white placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none" placeholder="+1 (555) 000-0000" />
              </div>
            </div>
          </div>

          {/* Company & Title */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">Company</label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
                <input type="text" value={form.company_name} onChange={(e) => update("company_name", e.target.value)}
                  className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 pl-10 pr-3 text-sm text-white placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none" placeholder="Acme Corp" />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">Job Title</label>
              <input type="text" value={form.job_title} onChange={(e) => update("job_title", e.target.value)}
                className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-white placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none" placeholder="Marketing Manager" />
            </div>
          </div>

          {/* Lender (mortgage-specific) — feeds the {{contact.lender_name}} template variable */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-zinc-400">Lender</label>
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
              <input type="text" value={form.lender_name} onChange={(e) => update("lender_name", e.target.value)}
                className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 pl-10 pr-3 text-sm text-white placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none" placeholder="Rocket Mortgage, Wells Fargo, etc." />
            </div>
            <p className="mt-1 text-[11px] text-zinc-600">Used in voice agent scripts via <span className="font-mono text-zinc-500">{"{{contact.lender_name}}"}</span>.</p>
          </div>

          {/* Address */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-zinc-400">Address</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-2.5 h-4 w-4 text-zinc-600" />
              <input type="text" value={form.address_line1} onChange={(e) => update("address_line1", e.target.value)}
                className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 pl-10 pr-3 text-sm text-white placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none" placeholder="123 Main St" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <input type="text" value={form.city} onChange={(e) => update("city", e.target.value)} placeholder="City"
              className="h-9 rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-white placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none" />
            <input type="text" value={form.state} onChange={(e) => update("state", e.target.value)} placeholder="State"
              className="h-9 rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-white placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none" />
            <input type="text" value={form.zip_code} onChange={(e) => update("zip_code", e.target.value)} placeholder="ZIP"
              className="h-9 rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-white placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none" />
          </div>

          {/* Status & Source */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">Status</label>
              <select value={form.status} onChange={(e) => update("status", e.target.value)}
                className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-white focus:border-indigo-500 focus:outline-none">
                {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">Source</label>
              <select value={form.source} onChange={(e) => update("source", e.target.value)}
                className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-white focus:border-indigo-500 focus:outline-none">
                <option value="">Select source</option>
                {SOURCE_OPTIONS.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</option>)}
              </select>
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-zinc-400">Tags (comma-separated)</label>
            <div className="relative">
              <Tag className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
              <input type="text" value={form.tags} onChange={(e) => update("tags", e.target.value)}
                className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 pl-10 pr-3 text-sm text-white placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none" placeholder="vip, insurance, warm" />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-zinc-800">
            <button type="button" onClick={onClose} className="h-9 rounded-lg border border-zinc-700 px-4 text-sm text-zinc-300 hover:bg-zinc-800">Cancel</button>
            <button type="submit" disabled={saving} className="flex h-9 items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {isEdit ? "Save Changes" : "Add Contact"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
