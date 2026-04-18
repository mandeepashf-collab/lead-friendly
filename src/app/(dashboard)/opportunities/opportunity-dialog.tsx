"use client";

import { useState, useEffect } from "react";
import { X, Loader2, DollarSign, Calendar, User, FileText } from "lucide-react";
import { createOpportunity, updateOpportunity, usePipelineStages } from "@/hooks/use-opportunities";
import { useContacts } from "@/hooks/use-contacts";
import type { Opportunity, Contact, Profile } from "@/types/database";

interface Props {
  opportunity: Opportunity | null;
  pipelineId: string;
  onClose: () => void;
  onSaved: () => void;
  teamMembers?: Profile[];
}

export function OpportunityDialog({
  opportunity,
  pipelineId,
  onClose,
  onSaved,
  teamMembers = [],
}: Props) {
  const isEdit = !!opportunity;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const { contacts } = useContacts({ limit: 999 });
  const { stages } = usePipelineStages(pipelineId);

  const [form, setForm] = useState({
    name: opportunity?.name || "",
    contact_id: opportunity?.contact_id || "",
    value: opportunity?.value?.toString() || "",
    stage_id: opportunity?.stage_id || (stages?.[0]?.id || ""),
    expected_close_date: opportunity?.expected_close_date || "",
    assigned_to: opportunity?.assigned_to || "",
    notes: opportunity?.notes || "",
  });

  useEffect(() => {
    if (stages.length > 0 && !form.stage_id) {
      setForm((prev) => ({ ...prev, stage_id: stages[0].id }));
    }
  }, [stages]);

  const update = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    if (!form.name.trim()) {
      setError("Opportunity name is required");
      setSaving(false);
      return;
    }

    if (!form.stage_id) {
      setError("Stage is required");
      setSaving(false);
      return;
    }

    const payload: Partial<Opportunity> = {
      name: form.name,
      value: form.value ? parseFloat(form.value) : 0,
      stage_id: form.stage_id,
      pipeline_id: pipelineId,
      contact_id: form.contact_id || null,
      expected_close_date: form.expected_close_date || null,
      assigned_to: form.assigned_to || null,
      notes: form.notes || null,
    };

    let result;
    if (isEdit && opportunity) {
      result = await updateOpportunity(opportunity.id, payload);
    } else {
      result = await createOpportunity(payload);
    }

    if (result.error) {
      setError(result.error);
      setSaving(false);
      return;
    }

    onSaved();
  };

  const getContactName = (contact: Contact) => {
    const parts = [contact.first_name, contact.last_name].filter(Boolean);
    return parts.length > 0 ? parts.join(" ") : contact.email || "Unknown";
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
          <h2 className="text-lg font-semibold text-white">
            {isEdit ? "Edit Opportunity" : "Add New Opportunity"}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Opportunity Name */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-zinc-400">
              Opportunity Name *
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="e.g., Acme Corp - Website Redesign"
              className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-white placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          {/* Contact & Value */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">Contact</label>
              <select
                value={form.contact_id}
                onChange={(e) => update("contact_id", e.target.value)}
                className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-white focus:border-indigo-500 focus:outline-none"
              >
                <option value="">Select contact</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {getContactName(c)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">Value ($) *</label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
                <input
                  type="number"
                  step="0.01"
                  value={form.value}
                  onChange={(e) => update("value", e.target.value)}
                  placeholder="0.00"
                  className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 pl-10 pr-3 text-sm text-white placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Stage */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-zinc-400">Stage *</label>
            <select
              value={form.stage_id}
              onChange={(e) => update("stage_id", e.target.value)}
              className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-white focus:border-indigo-500 focus:outline-none"
            >
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Expected Close Date & Assigned To */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">
                Expected Close Date
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
                <input
                  type="date"
                  value={form.expected_close_date}
                  onChange={(e) => update("expected_close_date", e.target.value)}
                  className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 pl-10 pr-3 text-sm text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">Assigned To</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
                <select
                  value={form.assigned_to}
                  onChange={(e) => update("assigned_to", e.target.value)}
                  className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 pl-10 pr-3 text-sm text-white focus:border-indigo-500 focus:outline-none"
                >
                  <option value="">Unassigned</option>
                  {teamMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.full_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-zinc-400">Notes</label>
            <div className="relative">
              <FileText className="absolute left-3 top-2.5 h-4 w-4 text-zinc-600" />
              <textarea
                value={form.notes}
                onChange={(e) => update("notes", e.target.value)}
                placeholder="Add any additional notes..."
                rows={3}
                className="h-auto w-full rounded-lg border border-zinc-700 bg-zinc-800 pl-10 pr-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none resize-none"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="h-9 rounded-lg border border-zinc-700 px-4 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex h-9 items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {isEdit ? "Save Changes" : "Create Opportunity"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
