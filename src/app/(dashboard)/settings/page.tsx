"use client";

import { useState, useEffect } from "react";
import { Settings, Building2, Users, Shield, ShieldCheck, Save, Eye, EyeOff, Zap, Plus, X, Loader2, ToggleLeft, ToggleRight, MessageSquare, Mail, Phone, Calendar, AlertCircle, Tag, Trash2, Palette } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useBrand } from "@/contexts/BrandContext";

const TABS = ["organization", "team", "automations", "tags", "security"] as const;
type Tab = typeof TABS[number];

const TAB_LABELS: Record<Tab, string> = {
  organization: "Organization",
  team: "Team",
  automations: "Automations",
  tags: "Tags",
  security: "Security",
};

const TAB_ICONS: Record<Tab, React.ElementType> = {
  organization: Building2,
  team: Users,
  automations: Zap,
  tags: Tag,
  security: Shield,
};

function InputField({ label, value, onChange, type = "text", placeholder, hint }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; hint?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-zinc-300">{label}</label>
      <div className="relative">
        <input
          type={type === "password" ? (show ? "text" : "password") : type}
          value={value} onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="h-10 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-300 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
        />
        {type === "password" && (
          <button type="button" onClick={() => setShow(!show)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>
      {hint && <p className="text-xs text-zinc-600">{hint}</p>}
    </div>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        {description && <p className="text-xs text-zinc-500 mt-0.5">{description}</p>}
      </div>
      {children}
    </div>
  );
}

// ─── Automations Tab ────────────────────────────────────────────────────────
interface Automation {
  id: string;
  name: string;
  trigger_type: string;
  action_type: string;
  delay_minutes: number;
  is_active: boolean;
  created_at: string;
  templates?: { name: string } | null;
}

const TRIGGER_LABELS: Record<string, string> = {
  appointment_booked:    "Appointment Booked",
  appointment_reminder:  "Appointment Reminder",
  appointment_completed: "Appointment Completed",
  appointment_cancelled: "Appointment Cancelled",
  missed_call:           "Missed Call",
  new_contact:           "New Contact",
};

const ACTION_ICONS: Record<string, React.ElementType> = {
  send_sms:   MessageSquare,
  send_email: Mail,
};

function delayLabel(minutes: number) {
  if (minutes === 0) return "Immediately";
  if (minutes < 0) return `${Math.abs(minutes / 60)}h before`;
  if (minutes < 60) return `${minutes}m after`;
  if (minutes % 60 === 0) return `${minutes / 60}h after`;
  return `${minutes}m after`;
}

function AutomationModal({
  automation,
  onClose,
  onSaved,
}: {
  automation?: Partial<Automation>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(automation?.name || "");
  const [triggerType, setTriggerType] = useState(automation?.trigger_type || "appointment_booked");
  const [actionType, setActionType] = useState(automation?.action_type || "send_sms");
  const [templateId, setTemplateId] = useState("");
  const [delayMinutes, setDelayMinutes] = useState(String(automation?.delay_minutes ?? 0));
  const [templates, setTemplates] = useState<{ id: string; name: string; type: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    createClient().from("templates").select("id, name, type").then(({ data }) => setTemplates(data || []));
  }, []);

  const save = async () => {
    if (!name.trim()) { setError("Name is required."); return; }
    setSaving(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const payload = {
        name,
        trigger_type: triggerType,
        action_type: actionType,
        template_id: templateId || null,
        delay_minutes: parseInt(delayMinutes) || 0,
        is_active: true,
        user_id: user.id,
      };
      if (automation?.id) {
        await supabase.from("automations").update(payload).eq("id", automation.id);
      } else {
        await supabase.from("automations").insert(payload);
      }
      onSaved();
    } catch (e: any) {
      setError(e.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
          <h2 className="text-lg font-semibold text-white">{automation?.id ? "Edit Automation" : "Add Automation"}</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {error && <p className="rounded-lg border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-400">{error}</p>}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Automation Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Appointment Reminder SMS"
              className="h-9 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-200 focus:border-indigo-500 focus:outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Trigger</label>
              <select value={triggerType} onChange={(e) => setTriggerType(e.target.value)}
                className="h-9 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-200 focus:border-indigo-500 focus:outline-none">
                {Object.entries(TRIGGER_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Action</label>
              <select value={actionType} onChange={(e) => setActionType(e.target.value)}
                className="h-9 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-200 focus:border-indigo-500 focus:outline-none">
                <option value="send_sms">Send SMS</option>
                <option value="send_email">Send Email</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Template</label>
            <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}
              className="h-9 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-200 focus:border-indigo-500 focus:outline-none">
              <option value="">-- Select a template --</option>
              {templates.filter((t) => actionType === "send_sms" ? t.type === "sms" : t.type === "email").map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Delay (minutes, use negative for "before")</label>
            <input type="number" value={delayMinutes} onChange={(e) => setDelayMinutes(e.target.value)}
              placeholder="0 = immediate, -1440 = 24h before, 120 = 2h after"
              className="h-9 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-200 focus:border-indigo-500 focus:outline-none" />
            <p className="mt-1 text-xs text-zinc-600">Negative = before event, positive = after event, 0 = immediate</p>
          </div>
        </div>
        <div className="flex justify-end gap-3 border-t border-zinc-800 px-6 py-4">
          <button onClick={onClose} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-400 hover:text-white">Cancel</button>
          <button onClick={save} disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {automation?.id ? "Save Changes" : "Add Automation"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AutomationsTab() {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editAutomation, setEditAutomation] = useState<Automation | null>(null);

  const load = async () => {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("automations")
      .select("*, templates(name)")
      .order("created_at");
    setAutomations((data as Automation[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const toggle = async (a: Automation) => {
    const supabase = createClient();
    await supabase.from("automations").update({ is_active: !a.is_active }).eq("id", a.id);
    setAutomations((prev) => prev.map((x) => x.id === a.id ? { ...x, is_active: !x.is_active } : x));
  };

  const deleteAutomation = async (id: string) => {
    if (!confirm("Delete this automation?")) return;
    const supabase = createClient();
    await supabase.from("automations").delete().eq("id", id);
    load();
  };

  const DEFAULT_AUTOMATIONS = [
    { name: "Appointment Confirmation SMS", trigger_type: "appointment_booked", action_type: "send_sms", delay_minutes: 0 },
    { name: "Appointment Reminder (24h before)", trigger_type: "appointment_reminder", action_type: "send_sms", delay_minutes: -1440 },
    { name: "Appointment Reminder (1h before)", trigger_type: "appointment_reminder", action_type: "send_sms", delay_minutes: -60 },
    { name: "Post-Appointment Follow-up", trigger_type: "appointment_completed", action_type: "send_sms", delay_minutes: 120 },
  ];

  return (
    <div className="max-w-3xl space-y-6">
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 flex items-start gap-3">
        <AlertCircle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
        <div className="text-xs text-amber-300/80">
          <strong className="text-amber-300">Automations</strong> send SMS and email messages automatically based on triggers.
          Configure your Telnyx (SMS) and Resend (email) keys in the Integrations tab to enable sending.
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white">Active Automations</h3>
          <p className="text-xs text-zinc-500 mt-0.5">Toggle automations on/off or add custom ones</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700">
          <Plus className="h-4 w-4" />Add Automation
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-zinc-500">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : automations.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-800 p-8 text-center">
          <Zap className="h-8 w-8 text-zinc-700 mx-auto mb-3" />
          <p className="text-sm font-medium text-zinc-400">No automations yet</p>
          <p className="text-xs text-zinc-600 mt-1 mb-4">Add the default appointment automation suite to get started</p>
          <button
            onClick={async () => {
              const supabase = createClient();
              const { data: { user } } = await supabase.auth.getUser();
              if (!user) return;
              await supabase.from("automations").insert(
                DEFAULT_AUTOMATIONS.map((a) => ({ ...a, is_active: true, user_id: user.id }))
              );
              load();
            }}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            Add Default Automations
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-800 overflow-hidden">
          {automations.map((a, i) => {
            const ActionIcon = ACTION_ICONS[a.action_type] || Zap;
            return (
              <div key={a.id} className={cn("flex items-center gap-4 px-5 py-4", i > 0 && "border-t border-zinc-800")}>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-800">
                  <ActionIcon className="h-4 w-4 text-indigo-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{a.name}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {TRIGGER_LABELS[a.trigger_type] || a.trigger_type} → {a.action_type === "send_sms" ? "SMS" : "Email"}
                    {a.templates?.name ? ` (${a.templates.name})` : ""}
                    <span className="ml-2 text-zinc-600">· {delayLabel(a.delay_minutes)}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => toggle(a)} className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-white">
                    {a.is_active
                      ? <ToggleRight className="h-6 w-6 text-indigo-500" />
                      : <ToggleLeft className="h-6 w-6 text-zinc-600" />}
                    <span className={a.is_active ? "text-indigo-400" : "text-zinc-600"}>{a.is_active ? "On" : "Off"}</span>
                  </button>
                  <button onClick={() => setEditAutomation(a)}
                    className="rounded-lg border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-400 hover:text-white hover:bg-zinc-800">Edit</button>
                  <button onClick={() => deleteAutomation(a.id)}
                    className="rounded-lg border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-400 hover:text-red-400 hover:bg-red-950/20">Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(showCreate || editAutomation) && (
        <AutomationModal
          automation={editAutomation || undefined}
          onClose={() => { setShowCreate(false); setEditAutomation(null); }}
          onSaved={() => { setShowCreate(false); setEditAutomation(null); load(); }}
        />
      )}
    </div>
  );
}

// ─── Tags Tab ────────────────────────────────────────────────────────────
interface TagRow {
  id: string;
  name: string;
  color: string | null;
  description: string | null;
  usage_count: number;
}

const SYSTEM_TAGS = new Set(["eval-failed"]);

const TAG_DEFAULT_COLORS = [
  "#6366f1", "#ef4444", "#10b981", "#f59e0b",
  "#ec4899", "#14b8a6", "#8b5cf6", "#06b6d4",
];

function TagsTab() {
  const [tags, setTags] = useState<TagRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(TAG_DEFAULT_COLORS[0]);

  const load = async () => {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("tags")
      .select("id, name, color, description, usage_count")
      .order("name", { ascending: true });
    if (error) setError(error.message);
    else setTags((data as TagRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setCreating(false); return; }
    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();
    if (!profile?.organization_id) { setCreating(false); return; }

    const { error } = await supabase.from("tags").insert({
      organization_id: profile.organization_id,
      name,
      color: newColor,
    });
    if (error) setError(error.message);
    else {
      setNewName("");
      setNewColor(TAG_DEFAULT_COLORS[0]);
      await load();
    }
    setCreating(false);
  };

  const handleRename = async (tagId: string, currentName: string) => {
    if (SYSTEM_TAGS.has(currentName.toLowerCase())) {
      setError(`"${currentName}" is a system tag and cannot be renamed.`);
      return;
    }
    const next = window.prompt(`Rename tag "${currentName}":`, currentName);
    if (!next || next.trim() === currentName) return;
    const supabase = createClient();
    const { error } = await supabase.from("tags").update({ name: next.trim() }).eq("id", tagId);
    if (error) setError(error.message);
    else await load();
  };

  const handleColor = async (tagId: string, color: string) => {
    const supabase = createClient();
    const { error } = await supabase.from("tags").update({ color }).eq("id", tagId);
    if (error) setError(error.message);
    else await load();
  };

  const handleDelete = async (tag: TagRow) => {
    if (SYSTEM_TAGS.has(tag.name.toLowerCase())) {
      setError(`"${tag.name}" is a system tag and cannot be deleted.`);
      return;
    }
    const used = tag.usage_count > 0
      ? `This tag is currently applied to ${tag.usage_count} contact${tag.usage_count === 1 ? "" : "s"}. Deleting will remove it from all of them.\n\n`
      : "";
    if (!window.confirm(`${used}Delete tag "${tag.name}"?`)) return;
    const supabase = createClient();
    const { error } = await supabase.from("tags").delete().eq("id", tag.id);
    if (error) setError(error.message);
    else await load();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 px-4 py-3 flex items-start gap-3">
        <AlertCircle className="h-4 w-4 text-indigo-400 mt-0.5 shrink-0" />
        <div className="text-xs text-indigo-300/80">
          <strong className="text-indigo-300">Tags</strong> drive automation. When a tag is added to a contact (manually, via CSV import, or by an AI agent mid-call), any campaign listening for that tag will enroll the contact automatically.
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          <X className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-red-400/60 hover:text-red-400">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Create new */}
      <Section title="Create Tag" description="New tags are available immediately across contacts, campaigns, and CSV imports">
        <div className="flex gap-2 items-center">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
            placeholder="e.g. hot-lead"
            className="flex-1 h-10 rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-300 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
          />
          <div className="flex gap-1">
            {TAG_DEFAULT_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setNewColor(c)}
                className={cn(
                  "h-7 w-7 rounded-full border-2 transition-all",
                  newColor === c ? "border-white scale-110" : "border-transparent hover:scale-105",
                )}
                style={{ backgroundColor: c }}
                aria-label={`Pick color ${c}`}
              />
            ))}
          </div>
          <button
            onClick={handleCreate}
            disabled={!newName.trim() || creating}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 px-3 py-2 text-sm font-medium text-white transition-colors"
          >
            {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Create
          </button>
        </div>
      </Section>

      {/* Tag list */}
      <div className="rounded-xl border border-zinc-800 overflow-hidden">
        {tags.length === 0 ? (
          <div className="p-8 text-center text-sm text-zinc-500">
            No tags yet. Create your first tag above.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/60 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-2 text-left font-semibold">Tag</th>
                <th className="px-4 py-2 text-left font-semibold">Color</th>
                <th className="px-4 py-2 text-right font-semibold">Contacts</th>
                <th className="px-4 py-2 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {tags.map((t) => {
                const isSystem = SYSTEM_TAGS.has(t.name.toLowerCase());
                return (
                  <tr key={t.id} className="hover:bg-zinc-900/30">
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleRename(t.id, t.name)}
                        disabled={isSystem}
                        className={cn(
                          "inline-flex items-center gap-2 rounded-full border px-2.5 py-0.5 text-xs font-medium",
                          isSystem ? "cursor-not-allowed" : "hover:opacity-80",
                        )}
                        style={{
                          borderColor: (t.color ?? "#6366f1") + "55",
                          backgroundColor: (t.color ?? "#6366f1") + "15",
                          color: t.color ?? "#6366f1",
                        }}
                        title={isSystem ? "System tag — cannot be renamed" : "Click to rename"}
                      >
                        {t.name}
                        {isSystem && <span className="text-[10px] opacity-60">(system)</span>}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        {TAG_DEFAULT_COLORS.map((c) => (
                          <button
                            key={c}
                            onClick={() => handleColor(t.id, c)}
                            className={cn(
                              "h-5 w-5 rounded-full border-2 transition-all",
                              (t.color ?? "") === c ? "border-white" : "border-transparent hover:scale-110",
                            )}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-400">{t.usage_count}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleDelete(t)}
                        disabled={isSystem}
                        className="inline-flex items-center gap-1 text-xs text-red-400/80 hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("organization");
  const [orgName, setOrgName] = useState("");
  const [saved, setSaved] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [repPhone, setRepPhone] = useState("");
  const [repPhoneSaving, setRepPhoneSaving] = useState(false);
  const [repPhoneError, setRepPhoneError] = useState("");
  const brand = useBrand();

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      setUserId(user.id);
      supabase.from("profiles").select("organization_id, phone, organizations(name)")
        .eq("id", user.id).single()
        .then(({ data }) => {
          const d = (data as Record<string, unknown>) ?? {};
          const org = d.organizations as { name?: string } | null;
          if (org?.name) setOrgName(org.name);
          const phone = d.phone as string | null;
          if (phone) setRepPhone(phone);
        });
    });
  }, []);

  // Jump to phone section if URL hash is #phone
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash === "#phone") {
      setTab("organization");
      // Wait for tab render, then scroll
      setTimeout(() => {
        document.getElementById("your-phone")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    }
  }, []);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleSaveRepPhone = async () => {
    if (!userId) return;
    setRepPhoneError("");
    const trimmed = repPhone.trim();
    // Accept empty (clears) or +E.164 format (+ then 10-15 digits)
    if (trimmed && !/^\+[1-9]\d{9,14}$/.test(trimmed)) {
      setRepPhoneError("Use E.164 format, e.g. +12534026951");
      return;
    }
    setRepPhoneSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ phone: trimmed || null })
      .eq("id", userId);
    setRepPhoneSaving(false);
    if (error) {
      setRepPhoneError(error.message);
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  return (
    <div className="space-y-6 min-w-0">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-zinc-400">Manage your organization and account settings</p>
      </div>

      {/* Tab nav — horizontal scroll on narrow viewports so "Security" is never cut off */}
      <div className="border-b border-zinc-800 -mx-2 px-2 overflow-x-auto scrollbar-none">
        <div className="flex gap-1 min-w-max">
          {TABS.map((t) => {
            const Icon = TAB_ICONS[t];
            return (
              <button key={t} onClick={() => setTab(t)}
                className={cn("flex items-center gap-2 px-4 pb-3 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap flex-shrink-0",
                  tab === t ? "border-indigo-500 text-white" : "border-transparent text-zinc-500 hover:text-zinc-300")}>
                <Icon className="h-4 w-4" />{TAB_LABELS[t]}
              </button>
            );
          })}
          {/* Compliance lives on its own route (/settings/compliance) so the
              tab links out rather than switching an inline panel. Matches how
              Branding and Billing are reached elsewhere in the app. */}
          <Link
            href="/settings/compliance"
            className="flex items-center gap-2 px-4 pb-3 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap flex-shrink-0 border-transparent text-zinc-500 hover:text-zinc-300"
          >
            <ShieldCheck className="h-4 w-4" />Compliance
          </Link>
          <Link
            href="/settings/branding"
            className="flex items-center gap-2 px-4 pb-3 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap flex-shrink-0 border-transparent text-zinc-500 hover:text-zinc-300"
          >
            <Palette className="h-4 w-4" />Branding
          </Link>
        </div>
      </div>

      {/* Organization */}
      {tab === "organization" && (
        <div className="space-y-4 max-w-2xl">
          <Section title="Organization Details" description="Update your organization name and branding">
            <InputField label="Organization Name" value={orgName} onChange={setOrgName} placeholder="Lead Friendly Agency" />
            <InputField label="Website" value="" onChange={() => {}} placeholder="https://yourwebsite.com" />
            <InputField label="Support Email" value="" onChange={() => {}} placeholder="support@yourcompany.com" type="email" />
          </Section>
          <div id="your-phone" />
          <Section
            title="Your Phone Number"
            description="Used when you initiate a manual call — we ring this number first, then bridge in the contact."
          >
            <InputField
              label="Your Mobile / Desk Phone"
              value={repPhone}
              onChange={setRepPhone}
              placeholder="+12534026951"
              hint="E.164 format (+country + digits). Leave blank to clear."
            />
            {repPhoneError && <p className="text-xs text-red-400">{repPhoneError}</p>}
            <button
              onClick={handleSaveRepPhone}
              disabled={repPhoneSaving}
              className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {repPhoneSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Phone
            </button>
          </Section>
          <Section title="Business Hours" description="Set when your team is available">
            <div className="grid grid-cols-2 gap-4">
              <InputField label="Opening Time" value="09:00" onChange={() => {}} type="time" />
              <InputField label="Closing Time" value="17:00" onChange={() => {}} type="time" />
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-zinc-300">Timezone</label>
              <select className="h-10 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-300 focus:border-indigo-500 focus:outline-none">
                <option>America/New_York</option>
                <option>America/Los_Angeles</option>
                <option>America/Chicago</option>
                <option>America/Denver</option>
                <option>Europe/London</option>
              </select>
            </div>
          </Section>
          <button onClick={handleSave}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            <Save className="h-4 w-4" />
            {saved ? "Saved!" : "Save Changes"}
          </button>
        </div>
      )}

      {/* Team */}
      {tab === "team" && (
        <div className="max-w-2xl">
          <Section title="Team Members" description="Manage who has access to your organization">
            <div className="space-y-3">
              {[
                { name: "Mandeep Rao", email: "mandeep@leadfriendly.com", role: "Owner" },
              ].map((member) => (
                <div key={member.email} className="flex items-center justify-between rounded-lg border border-zinc-800 p-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600/20 text-xs font-semibold text-indigo-400">
                      {member.name[0]}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">{member.name}</p>
                      <p className="text-xs text-zinc-500">{member.email}</p>
                    </div>
                  </div>
                  <span className="rounded-full border border-indigo-500/20 bg-indigo-500/10 px-2.5 py-0.5 text-xs font-medium text-indigo-400">
                    {member.role}
                  </span>
                </div>
              ))}
            </div>
            <button className="flex items-center gap-2 rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800">
              <Users className="h-4 w-4" />Invite Team Member
            </button>
          </Section>
        </div>
      )}

      {/* Automations */}
      {tab === "automations" && <AutomationsTab />}

      {/* Tags */}
      {tab === "tags" && <TagsTab />}

      {/* Security */}
      {tab === "security" && (
        <div className="max-w-2xl space-y-4">
          <Section title="Change Password" description="Update your account password">
            <InputField label="Current Password" value="" onChange={() => {}} type="password" />
            <InputField label="New Password" value="" onChange={() => {}} type="password"
              hint="Must be at least 8 characters" />
            <InputField label="Confirm New Password" value="" onChange={() => {}} type="password" />
            <button className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
              <Save className="h-4 w-4" />Update Password
            </button>
          </Section>
        </div>
      )}
    </div>
  );
}
