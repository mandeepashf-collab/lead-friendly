"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Save, Plus, X, Zap, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { createWorkflow } from "@/hooks/use-workflows";

const TRIGGERS = [
  { id: "contact_created", label: "Contact Created" },
  { id: "call_completed", label: "Call Completed" },
  { id: "appointment_booked", label: "Appointment Booked" },
  { id: "tag_added", label: "Tag Added" },
  { id: "form_submitted", label: "Form Submitted" },
  { id: "manual", label: "Manual Trigger" },
];

const ACTIONS = [
  { id: "send_sms", label: "Send SMS", icon: "💬" },
  { id: "send_email", label: "Send Email", icon: "📧" },
  { id: "wait", label: "Wait", icon: "⏳" },
  { id: "update_status", label: "Update Contact Status", icon: "🔄" },
  { id: "add_tag", label: "Add Tag", icon: "🏷️" },
  { id: "trigger_call", label: "Trigger AI Call", icon: "📞" },
  { id: "webhook", label: "Send Webhook", icon: "🔗" },
];

interface Step { id: string; type: string; config: Record<string, string> }

export default function NewWorkflowPage() {
  const router = useRouter();
  const [name, setName] = useState("New Workflow");
  const [trigger, setTrigger] = useState("contact_created");
  const [steps, setSteps] = useState<Step[]>([]);
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const addStep = (type: string) => {
    setSteps(s => [...s, { id: Date.now().toString(), type, config: {} }]);
    setShowActionMenu(false);
  };
  const removeStep = (id: string) => setSteps(s => s.filter(x => x.id !== id));
  const updateStep = (id: string, key: string, val: string) =>
    setSteps(s => s.map(x => x.id === id ? {...x, config: {...x.config, [key]: val}} : x));

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await createWorkflow({ name, description: null, status: "active", trigger_type: trigger, steps });
    setSaved(true);
    setTimeout(() => router.push("/automations"), 1000);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/automations")} className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white">
            <ArrowLeft className="h-4 w-4" />Back
          </button>
          <div className="h-4 w-px bg-zinc-700" />
          <input value={name} onChange={e => setName(e.target.value)}
            className="text-2xl font-bold text-white bg-transparent border-b border-transparent hover:border-zinc-700 focus:border-indigo-500 focus:outline-none px-1" />
        </div>
        <button onClick={handleSave} disabled={saving}
          className={cn("flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium",
            saved ? "bg-emerald-600 text-white" : "bg-indigo-600 text-white hover:bg-indigo-700")}>
          {saved ? <><CheckCircle2 className="h-4 w-4" />Saved!</> : <><Save className="h-4 w-4" />Save</>}
        </button>
      </div>

      {/* Trigger */}
      <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-white"><Zap className="h-4 w-4" /></div>
          <p className="text-sm font-semibold text-white">Trigger</p>
        </div>
        <select value={trigger} onChange={e => setTrigger(e.target.value)}
          className="h-10 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-300 focus:border-indigo-500 focus:outline-none">
          {TRIGGERS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </div>

      {/* Connector */}
      {steps.length > 0 || true ? <div className="flex justify-center"><div className="h-6 w-0.5 bg-zinc-700" /></div> : null}

      {/* Steps */}
      {steps.map((step, i) => {
        const action = ACTIONS.find(a => a.id === step.type);
        return (
          <div key={step.id}>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-700 text-xs font-semibold text-zinc-300">{i + 1}</span>
                  <span className="text-sm font-semibold text-white">{action?.icon} {action?.label}</span>
                </div>
                <button onClick={() => removeStep(step.id)} className="text-zinc-600 hover:text-red-400"><X className="h-4 w-4" /></button>
              </div>
              {step.type === "send_sms" && (
                <textarea value={step.config.message || ""} onChange={e => updateStep(step.id, "message", e.target.value)}
                  rows={3} placeholder="Hi {first_name}, following up on our conversation..."
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-300 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none resize-none" />
              )}
              {step.type === "send_email" && (
                <div className="space-y-2">
                  <input value={step.config.subject || ""} onChange={e => updateStep(step.id, "subject", e.target.value)}
                    placeholder="Email subject..." className="h-9 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-300 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none" />
                  <textarea value={step.config.body || ""} onChange={e => updateStep(step.id, "body", e.target.value)}
                    rows={4} placeholder="Email body..." className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-300 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none resize-none" />
                </div>
              )}
              {step.type === "wait" && (
                <div className="flex items-center gap-3">
                  <input type="number" value={step.config.amount || "1"} onChange={e => updateStep(step.id, "amount", e.target.value)}
                    min={1} className="h-9 w-24 rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-300 focus:border-indigo-500 focus:outline-none" />
                  <select value={step.config.unit || "hours"} onChange={e => updateStep(step.id, "unit", e.target.value)}
                    className="h-9 rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-300 focus:border-indigo-500 focus:outline-none">
                    <option value="minutes">Minutes</option>
                    <option value="hours">Hours</option>
                    <option value="days">Days</option>
                  </select>
                </div>
              )}
              {step.type === "update_status" && (
                <select value={step.config.status || "contacted"} onChange={e => updateStep(step.id, "status", e.target.value)}
                  className="h-9 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-300 focus:border-indigo-500 focus:outline-none">
                  {["new","contacted","qualified","proposal","won","lost"].map(s => <option key={s} value={s} className="capitalize">{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
                </select>
              )}
              {(step.type === "add_tag" || step.type === "trigger_call") && (
                <input value={step.config.value || ""} onChange={e => updateStep(step.id, "value", e.target.value)}
                  placeholder={step.type === "add_tag" ? "Tag name..." : "Agent ID or name..."}
                  className="h-9 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-300 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none" />
              )}
              {step.type === "webhook" && (
                <input value={step.config.url || ""} onChange={e => updateStep(step.id, "url", e.target.value)}
                  placeholder="https://your-webhook.com/endpoint"
                  className="h-9 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-300 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none" />
              )}
            </div>
            <div className="flex justify-center"><div className="h-4 w-0.5 bg-zinc-700" /></div>
          </div>
        );
      })}

      {/* Add Action */}
      <div className="relative">
        <button onClick={() => setShowActionMenu(!showActionMenu)}
          className="flex items-center gap-2 w-full rounded-xl border-2 border-dashed border-zinc-700 py-3 justify-center text-sm text-zinc-500 hover:border-indigo-500 hover:text-indigo-400 transition-colors">
          <Plus className="h-4 w-4" />Add Action
        </button>
        {showActionMenu && (
          <div className="absolute top-full left-0 right-0 mt-1 rounded-xl border border-zinc-800 bg-zinc-900 shadow-xl z-10 p-2">
            {ACTIONS.map(a => (
              <button key={a.id} onClick={() => addStep(a.id)}
                className="flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800 text-left">
                <span>{a.icon}</span>{a.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
