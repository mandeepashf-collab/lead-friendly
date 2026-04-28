"use client";

import { useState } from "react";
import { X, Loader2, Calendar, Clock, User, FileText } from "lucide-react";
import { createAppointment, updateAppointment } from "@/hooks/use-appointments";
import { useContacts } from "@/hooks/use-contacts";
import type { Appointment } from "@/types/database";
import { localDateKey } from "@/lib/dashboard/format";

interface Props {
  appointment: Appointment | null;
  selectedDate?: string;
  onClose: () => void;
  onSaved: () => void;
}

const STATUS_OPTIONS = ["scheduled", "completed", "cancelled", "no_show"];

export function AppointmentDialog({ appointment, selectedDate, onClose, onSaved }: Props) {
  const isEdit = !!appointment;
  const { contacts } = useContacts({ limit: 500 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    title: appointment?.title || "",
    contact_id: appointment?.contact_id || "",
    appointment_date: appointment?.appointment_date || selectedDate || localDateKey(),
    start_time: appointment?.start_time || "09:00",
    end_time: appointment?.end_time || "10:00",
    assigned_to: appointment?.assigned_to || "",
    status: appointment?.status || "scheduled",
    notes: "",
  });

  const update = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    if (!form.title || !form.appointment_date || !form.start_time || !form.end_time) {
      setError("Please fill in all required fields");
      setSaving(false);
      return;
    }

    if (isEdit && appointment) {
      const { error: err } = await updateAppointment(appointment.id, form);
      if (err) { setError(err); setSaving(false); return; }
    } else {
      const { error: err } = await createAppointment(form);
      if (err) { setError(err); setSaving(false); return; }
    }

    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
          <h2 className="text-lg font-semibold text-white">
            {isEdit ? "Edit Appointment" : "New Appointment"}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">{error}</div>
          )}

          {/* Title */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-zinc-400">Title *</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => update("title", e.target.value)}
              required
              className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-white placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
              placeholder="Meeting with client"
            />
          </div>

          {/* Contact */}
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
                  {[c.first_name, c.last_name].filter(Boolean).join(" ")} {c.email ? `(${c.email})` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">Date *</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
                <input
                  type="date"
                  value={form.appointment_date}
                  onChange={(e) => update("appointment_date", e.target.value)}
                  required
                  className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 pl-10 pr-3 text-sm text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">Status</label>
              <select
                value={form.status}
                onChange={(e) => update("status", e.target.value)}
                className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-white focus:border-indigo-500 focus:outline-none"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Start & End Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">Start Time *</label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
                <input
                  type="time"
                  value={form.start_time}
                  onChange={(e) => update("start_time", e.target.value)}
                  required
                  className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 pl-10 pr-3 text-sm text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">End Time *</label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
                <input
                  type="time"
                  value={form.end_time}
                  onChange={(e) => update("end_time", e.target.value)}
                  required
                  className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 pl-10 pr-3 text-sm text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Assigned To */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-zinc-400">Assigned To</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
              <input
                type="text"
                value={form.assigned_to}
                onChange={(e) => update("assigned_to", e.target.value)}
                className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 pl-10 pr-3 text-sm text-white placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
                placeholder="Team member name"
              />
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
                className="h-20 w-full rounded-lg border border-zinc-700 bg-zinc-800 pl-10 pr-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none resize-none"
                placeholder="Add any notes about this appointment"
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
              {isEdit ? "Save Changes" : "Create Appointment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
