"use client";

import { useState, useRef, useEffect } from "react";
import { Plus, User, Target, CheckSquare, Phone, X, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { bulkAddContactTags } from "@/hooks/use-contact-tags";
import { cn } from "@/lib/utils";

/* ── tiny toast ── */
function Toast({ msg, ok }: { msg: string; ok: boolean }) {
  return (
    <div className={cn(
      "fixed bottom-6 right-6 z-[200] flex items-center gap-3 rounded-xl border px-4 py-3 text-sm shadow-xl",
      ok
        ? "border-emerald-500/30 bg-emerald-950/80 text-emerald-300"
        : "border-red-500/30 bg-red-950/80 text-red-300"
    )}>
      {msg}
    </div>
  );
}

/* ── modal shell ── */
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <h2 className="text-sm font-semibold text-white">{title}</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5 space-y-4">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-zinc-400">{label}</label>
      {children}
    </div>
  );
}

const inputCls = "h-9 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-300 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none";
const selectCls = "h-9 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-300 focus:border-indigo-500 focus:outline-none";

/* ── New Contact modal ── */
function NewContactModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({ first_name: "", last_name: "", email: "", phone: "", tags: "" });
  const [saving, setSaving] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    if (!form.first_name && !form.email) return;
    setSaving(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from("profiles").select("organization_id").eq("id", user.id).single();
      const tagList = form.tags
        ? form.tags.split(",").map(t => t.trim()).filter(Boolean)
        : [];
      // Insert the contact WITHOUT tags — they go through the RPC so
      // contact_tags stays in sync for the automation matcher.
      const { data: inserted, error } = await supabase.from("contacts").insert({
        organization_id: profile?.organization_id,
        first_name: form.first_name || null,
        last_name: form.last_name || null,
        email: form.email || null,
        phone: form.phone || null,
        status: "new",
      }).select("id").single();
      if (error || !inserted) throw error ?? new Error("Insert failed");
      if (tagList.length) {
        await bulkAddContactTags(
          tagList.map(tag => ({ contact_id: inserted.id, tag, source: "manual" as const })),
        );
      }
      onSuccess();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="New Contact" onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="First Name"><input className={inputCls} placeholder="Jane" value={form.first_name} onChange={set("first_name")} /></Field>
        <Field label="Last Name"><input className={inputCls} placeholder="Smith" value={form.last_name} onChange={set("last_name")} /></Field>
      </div>
      <Field label="Email"><input className={inputCls} type="email" placeholder="jane@example.com" value={form.email} onChange={set("email")} /></Field>
      <Field label="Phone"><input className={inputCls} type="tel" placeholder="+1 555 000 0000" value={form.phone} onChange={set("phone")} /></Field>
      <Field label="Tags (comma-separated)"><input className={inputCls} placeholder="lead, warm" value={form.tags} onChange={set("tags")} /></Field>
      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onClose} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-400 hover:bg-zinc-800">Cancel</button>
        <button onClick={submit} disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Save Contact
        </button>
      </div>
    </Modal>
  );
}

/* ── New Deal modal ── */
function NewDealModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({ name: "", value: "", stage: "lead", contact_id: "" });
  const [contacts, setContacts] = useState<{ id: string; label: string }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data } = await supabase.from("contacts").select("id, first_name, last_name, email").limit(100);
      setContacts((data || []).map(c => ({
        id: c.id,
        label: [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || c.id,
      })));
    };
    load();
  }, []);

  const submit = async () => {
    if (!form.name) return;
    setSaving(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from("profiles").select("organization_id").eq("id", user.id).single();
      await supabase.from("opportunities").insert({
        organization_id: profile?.organization_id,
        name: form.name,
        value: form.value ? parseFloat(form.value) : null,
        stage_id: form.stage,
        contact_id: form.contact_id || null,
      });
      onSuccess();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="New Deal" onClose={onClose}>
      <Field label="Deal Name"><input className={inputCls} placeholder="Acme Corp — Q2 Deal" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></Field>
      <Field label="Value ($)"><input className={inputCls} type="number" placeholder="5000" value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} /></Field>
      <Field label="Stage">
        <select className={selectCls} value={form.stage} onChange={e => setForm(f => ({ ...f, stage: e.target.value }))}>
          {["lead","qualified","proposal","negotiation","won","lost"].map(s => (
            <option key={s} value={s} className="capitalize">{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
      </Field>
      <Field label="Contact (optional)">
        <select className={selectCls} value={form.contact_id} onChange={e => setForm(f => ({ ...f, contact_id: e.target.value }))}>
          <option value="">— No contact —</option>
          {contacts.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </Field>
      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onClose} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-400 hover:bg-zinc-800">Cancel</button>
        <button onClick={submit} disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Save Deal
        </button>
      </div>
    </Modal>
  );
}

/* ── Log a Call modal ── */
function LogCallModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({ contact_id: "", duration: "", notes: "", outcome: "connected" });
  const [contacts, setContacts] = useState<{ id: string; label: string; phone: string }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data } = await supabase.from("contacts").select("id, first_name, last_name, email, phone").limit(100);
      setContacts((data || []).map(c => ({
        id: c.id,
        label: [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || c.id,
        phone: c.phone || "",
      })));
    };
    load();
  }, []);

  const submit = async () => {
    setSaving(true);
    try {
      const selectedContact = contacts.find(c => c.id === form.contact_id);
      const res = await fetch("/api/calls/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_id: form.contact_id || null,
          phone_number: selectedContact?.phone || "",
          duration_seconds: form.duration ? parseInt(form.duration) * 60 : 0,
          direction: "outbound",
          status: form.outcome,
          notes: form.notes,
        }),
      });
      if (res.ok) onSuccess();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Log a Call" onClose={onClose}>
      <Field label="Contact">
        <select className={selectCls} value={form.contact_id} onChange={e => setForm(f => ({ ...f, contact_id: e.target.value }))}>
          <option value="">— Select contact —</option>
          {contacts.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </Field>
      <Field label="Duration (minutes)"><input className={inputCls} type="number" placeholder="5" value={form.duration} onChange={e => setForm(f => ({ ...f, duration: e.target.value }))} /></Field>
      <Field label="Outcome">
        <select className={selectCls} value={form.outcome} onChange={e => setForm(f => ({ ...f, outcome: e.target.value }))}>
          <option value="connected">Connected</option>
          <option value="voicemail">Voicemail</option>
          <option value="no-answer">No Answer</option>
          <option value="busy">Busy</option>
        </select>
      </Field>
      <Field label="Notes">
        <textarea className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-300 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none resize-none" rows={3}
          placeholder="Call notes…" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
      </Field>
      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onClose} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-400 hover:bg-zinc-800">Cancel</button>
        <button onClick={submit} disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Log Call
        </button>
      </div>
    </Modal>
  );
}

/* ── New Task modal ── */
function NewTaskModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({ title: "", description: "", due_date: "", assigned_to: "", priority: "medium" });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!form.title) return;
    setSaving(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from("profiles").select("organization_id").eq("id", user.id).single();
      await supabase.from("tasks").insert({
        organization_id: profile?.organization_id,
        user_id: user.id,
        title: form.title,
        description: form.description || null,
        due_date: form.due_date || null,
        assigned_to: form.assigned_to || null,
        priority: form.priority,
        status: "pending",
      });
      onSuccess();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="New Task" onClose={onClose}>
      <Field label="Title"><input className={inputCls} placeholder="Follow up with lead" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></Field>
      <Field label="Description">
        <textarea className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-300 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none resize-none" rows={2}
          placeholder="Optional details…" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Due Date"><input className={inputCls} type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} /></Field>
        <Field label="Priority">
          <select className={selectCls} value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </Field>
      </div>
      <Field label="Assigned To"><input className={inputCls} placeholder="Team member name" value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))} /></Field>
      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onClose} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-400 hover:bg-zinc-800">Cancel</button>
        <button onClick={submit} disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Save Task
        </button>
      </div>
    </Modal>
  );
}

/* ── Main QuickAdd button ── */
type ModalType = "contact" | "deal" | "task" | "call" | null;

const MENU_ITEMS: { type: ModalType; label: string; icon: React.ElementType; desc: string }[] = [
  { type: "contact", label: "New Contact",  icon: User,          desc: "Add a lead or contact" },
  { type: "deal",    label: "New Deal",     icon: Target,        desc: "Track an opportunity" },
  { type: "task",    label: "New Task",     icon: CheckSquare,   desc: "Create a to-do" },
  { type: "call",    label: "Log a Call",   icon: Phone,         desc: "Record a call" },
];

export function QuickAdd() {
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState<ModalType>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  const openModal = (type: ModalType) => { setOpen(false); setModal(type); };
  const closeModal = () => setModal(null);
  const success = (label: string) => { closeModal(); showToast(`${label} saved!`); };

  return (
    <>
      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen(v => !v)}
          className="flex h-9 items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" />Quick Add
        </button>

        {open && (
          <div className="absolute right-0 top-11 z-50 w-52 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl">
            {MENU_ITEMS.map((item) => (
              <button
                key={item.type}
                onClick={() => openModal(item.type)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-zinc-800 transition-colors"
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-600/15">
                  <item.icon className="h-4 w-4 text-indigo-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">{item.label}</p>
                  <p className="text-xs text-zinc-500">{item.desc}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {modal === "contact" && <NewContactModal onClose={closeModal} onSuccess={() => success("Contact")} />}
      {modal === "deal"    && <NewDealModal    onClose={closeModal} onSuccess={() => success("Deal")} />}
      {modal === "task"    && <NewTaskModal    onClose={closeModal} onSuccess={() => success("Task")} />}
      {modal === "call"    && <LogCallModal    onClose={closeModal} onSuccess={() => success("Call")} />}
      {toast && <Toast msg={toast.msg} ok={toast.ok} />}
    </>
  );
}
