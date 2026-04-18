"use client";

import { useState } from "react";
import {
  X,
  Loader2,
  Plus,
  Trash2,
  FileText,
  User,
  DollarSign,
  Calendar,
} from "lucide-react";
import { createInvoice, updateInvoice, useContacts } from "@/hooks/use-payments";
import type { Invoice } from "@/types/database";

interface LineItem {
  id: string;
  description: string;
  quantity: number;
  rate: number;
}

interface Props {
  invoice: Invoice | null;
  onClose: () => void;
  onSaved: () => void;
}

const STATUS_OPTIONS = ["draft", "sent", "paid", "overdue", "cancelled"];

export function InvoiceDialog({ invoice, onClose, onSaved }: Props) {
  const isEdit = !!invoice;
  const { contacts } = useContacts();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    contact_id: invoice?.contact_id || "",
    invoice_number: invoice?.invoice_number || "",
    status: invoice?.status || "draft",
    due_date: invoice?.due_date || "",
    notes: "",
  });
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { id: "1", description: "", quantity: 1, rate: 0 },
  ]);

  const update = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const updateLineItem = (id: string, field: string, value: string | number) => {
    setLineItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      )
    );
  };

  const addLineItem = () => {
    setLineItems((prev) => [
      ...prev,
      { id: Date.now().toString(), description: "", quantity: 1, rate: 0 },
    ]);
  };

  const removeLineItem = (id: string) => {
    if (lineItems.length > 1) {
      setLineItems((prev) => prev.filter((item) => item.id !== id));
    }
  };

  // Calculate totals
  const subtotal = lineItems.reduce(
    (sum, item) => sum + item.quantity * item.rate,
    0
  );
  const tax = Math.round(subtotal * 0.1 * 100) / 100; // 10% tax
  const total = subtotal + tax;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    if (!form.contact_id || !form.invoice_number) {
      setError("Please fill in all required fields");
      setSaving(false);
      return;
    }

    const payload = {
      contact_id: form.contact_id,
      invoice_number: form.invoice_number,
      status: form.status,
      due_date: form.due_date,
      total,
    };

    if (isEdit && invoice) {
      const { error: err } = await updateInvoice(invoice.id, payload);
      if (err) {
        setError(err);
        setSaving(false);
        return;
      }
    } else {
      const { error: err } = await createInvoice(payload);
      if (err) {
        setError(err);
        setSaving(false);
        return;
      }
    }

    onSaved();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4 sticky top-0 bg-zinc-900">
          <h2 className="text-lg font-semibold text-white">
            {isEdit ? "Edit Invoice" : "Create Invoice"}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Invoice Header */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">
                Client *
              </label>
              <select
                value={form.contact_id}
                onChange={(e) => update("contact_id", e.target.value)}
                required
                className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-white focus:border-indigo-500 focus:outline-none"
              >
                <option value="">Select client</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {[c.first_name, c.last_name].filter(Boolean).join(" ")} ({c.email || "no email"})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">
                Invoice Number *
              </label>
              <div className="relative">
                <FileText className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
                <input
                  type="text"
                  value={form.invoice_number}
                  onChange={(e) => update("invoice_number", e.target.value)}
                  required
                  className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 pl-10 pr-3 text-sm text-white placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
                  placeholder="INV-001"
                />
              </div>
            </div>
          </div>

          {/* Line Items */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <label className="text-xs font-medium text-zinc-400">
                Line Items
              </label>
              <button
                type="button"
                onClick={addLineItem}
                className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Item
              </button>
            </div>

            <div className="space-y-2">
              {lineItems.map((item) => (
                <div key={item.id} className="flex items-end gap-2">
                  <div className="flex-1">
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) =>
                        updateLineItem(item.id, "description", e.target.value)
                      }
                      placeholder="Description"
                      className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-white placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div className="w-20">
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={(e) =>
                        updateLineItem(
                          item.id,
                          "quantity",
                          parseInt(e.target.value) || 0
                        )
                      }
                      placeholder="Qty"
                      min="1"
                      className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2 text-sm text-white text-center placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div className="w-28">
                    <div className="relative">
                      <DollarSign className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
                      <input
                        type="number"
                        value={item.rate}
                        onChange={(e) =>
                          updateLineItem(
                            item.id,
                            "rate",
                            parseFloat(e.target.value) || 0
                          )
                        }
                        placeholder="Rate"
                        step="0.01"
                        min="0"
                        className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 pl-7 pr-2 text-sm text-white text-right placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="w-28 text-right">
                    <p className="text-sm font-medium text-zinc-300">
                      ${(item.quantity * item.rate).toFixed(2)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeLineItem(item.id)}
                    disabled={lineItems.length === 1}
                    className="rounded-lg p-1.5 text-zinc-500 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-30"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Totals */}
          <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-4">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-zinc-400">Subtotal:</span>
                <span className="font-medium text-zinc-300">${subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Tax (10%):</span>
                <span className="font-medium text-zinc-300">${tax.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-t border-zinc-700 pt-2">
                <span className="font-semibold text-white">Total:</span>
                <span className="text-lg font-bold text-indigo-400">
                  ${total.toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Status & Due Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">
                Status
              </label>
              <select
                value={form.status}
                onChange={(e) => update("status", e.target.value)}
                className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-white focus:border-indigo-500 focus:outline-none"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">
                Due Date
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
                <input
                  type="date"
                  value={form.due_date}
                  onChange={(e) => update("due_date", e.target.value)}
                  className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 pl-10 pr-3 text-sm text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-zinc-400">
              Notes
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => update("notes", e.target.value)}
              className="h-20 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none resize-none"
              placeholder="Add any additional notes for this invoice"
            />
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
              {isEdit ? "Save Invoice" : "Create Invoice"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
