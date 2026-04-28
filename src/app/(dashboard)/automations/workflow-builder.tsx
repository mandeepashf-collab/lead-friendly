"use client";

import { useState } from "react";
import {
  X,
  Loader2,
  ArrowDown,
  Plus,
  Trash2,
  MessageSquare,
  Mail,
  Clock,
  User,
  MoreVertical,
} from "lucide-react";
import { createWorkflow, updateWorkflow } from "@/hooks/use-workflows";
import type { Workflow } from "@/types/database";

interface WorkflowStep {
  id: string;
  type: "send_sms" | "send_email" | "wait" | "update_status" | "assign_agent" | "condition";
  message?: string;
  subject?: string;
  body?: string;
  duration?: number;
  unit?: "minutes" | "hours" | "days";
  status?: string;
  field?: string;
  operator?: string;
  value?: string;
}

interface Props {
  workflow: Workflow | null;
  onClose: () => void;
  onSaved: () => void;
}

// F19: Event-based triggers have no execution engine yet — see post-launch
// roadmap. Pre-launch we expose only `manual` so users don't build workflows
// that silently never run. Existing rows with other trigger_type values still
// load fine (the UI just falls back to displaying the stored value).
const TRIGGER_OPTIONS = [
  { value: "manual", label: "Manual" },
];

const ACTION_TYPES = [
  { value: "send_sms", label: "Send SMS", icon: MessageSquare },
  { value: "send_email", label: "Send Email", icon: Mail },
  { value: "wait", label: "Wait/Delay", icon: Clock },
  { value: "update_status", label: "Update Status", icon: User },
  { value: "assign_agent", label: "Assign to Agent", icon: User },
  { value: "condition", label: "IF/THEN Condition", icon: MoreVertical },
];

const STATUS_OPTIONS = ["new", "contacted", "qualified", "proposal", "won", "lost"];

function ActionCard({ step, onUpdate, onDelete }: {
  step: WorkflowStep;
  onUpdate: (updates: Partial<WorkflowStep>) => void;
  onDelete: () => void;
}) {
  const actionType = ACTION_TYPES.find((a) => a.value === step.type);
  const Icon = actionType?.icon || Plus;

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <select
          value={step.type}
          onChange={(e) => onUpdate({ type: e.target.value as WorkflowStep["type"] })}
          className="h-9 rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-white focus:border-indigo-500 focus:outline-none"
        >
          {ACTION_TYPES.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </select>
        <button
          onClick={onDelete}
          className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-red-400"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {step.type === "send_sms" && (
        <textarea
          value={step.message || ""}
          onChange={(e) => onUpdate({ message: e.target.value })}
          placeholder="Enter SMS message..."
          className="h-24 w-full rounded-lg border border-zinc-700 bg-zinc-800 p-3 text-sm text-white placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none resize-none"
        />
      )}

      {step.type === "send_email" && (
        <>
          <input
            type="text"
            value={step.subject || ""}
            onChange={(e) => onUpdate({ subject: e.target.value })}
            placeholder="Email subject..."
            className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-white placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
          />
          <textarea
            value={step.body || ""}
            onChange={(e) => onUpdate({ body: e.target.value })}
            placeholder="Email body..."
            className="h-24 w-full rounded-lg border border-zinc-700 bg-zinc-800 p-3 text-sm text-white placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none resize-none"
          />
        </>
      )}

      {step.type === "wait" && (
        <div className="grid grid-cols-2 gap-3">
          <input
            type="number"
            value={step.duration || 1}
            onChange={(e) => onUpdate({ duration: parseInt(e.target.value) })}
            placeholder="Duration"
            className="h-9 rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-white placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
          />
          <select
            value={step.unit || "hours"}
            onChange={(e) => onUpdate({ unit: e.target.value as "minutes" | "hours" | "days" })}
            className="h-9 rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-white focus:border-indigo-500 focus:outline-none"
          >
            <option value="minutes">Minutes</option>
            <option value="hours">Hours</option>
            <option value="days">Days</option>
          </select>
        </div>
      )}

      {step.type === "update_status" && (
        <select
          value={step.status || ""}
          onChange={(e) => onUpdate({ status: e.target.value })}
          className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-white focus:border-indigo-500 focus:outline-none"
        >
          <option value="">Select status</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
            </option>
          ))}
        </select>
      )}

      {step.type === "condition" && (
        <div className="space-y-3">
          <input
            type="text"
            value={step.field || ""}
            onChange={(e) => onUpdate({ field: e.target.value })}
            placeholder="Field name..."
            className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-white placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
          />
          <select
            value={step.operator || ""}
            onChange={(e) => onUpdate({ operator: e.target.value })}
            className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-white focus:border-indigo-500 focus:outline-none"
          >
            <option value="">Select operator</option>
            <option value="equals">Equals</option>
            <option value="not_equals">Not Equals</option>
            <option value="contains">Contains</option>
            <option value="greater_than">Greater Than</option>
            <option value="less_than">Less Than</option>
          </select>
          <input
            type="text"
            value={step.value || ""}
            onChange={(e) => onUpdate({ value: e.target.value })}
            placeholder="Value..."
            className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-white placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
          />
        </div>
      )}
    </div>
  );
}

export function WorkflowBuilder({ workflow, onClose, onSaved }: Props) {
  const isEdit = !!workflow;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState(workflow?.name || "");
  const [description, setDescription] = useState(workflow?.description || "");
  const [triggerType, setTriggerType] = useState(workflow?.trigger_type || "contact_created");
  const [steps, setSteps] = useState<WorkflowStep[]>(
    workflow?.steps
      ? (workflow.steps as WorkflowStep[]).map((s, i) => ({ ...s, id: `${i}` }))
      : []
  );

  const addStep = () => {
    setSteps([
      ...steps,
      {
        id: Date.now().toString(),
        type: "send_sms",
      },
    ]);
  };

  const updateStep = (stepId: string, updates: Partial<WorkflowStep>) => {
    setSteps(steps.map((s) => (s.id === stepId ? { ...s, ...updates } : s)));
  };

  const deleteStep = (stepId: string) => {
    setSteps(steps.filter((s) => s.id !== stepId));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    if (!name.trim()) {
      setError("Workflow name is required");
      setSaving(false);
      return;
    }

    const cleanSteps = steps.map(({ id, ...rest }) => rest) as any[];

    if (isEdit && workflow) {
      const { error } = await updateWorkflow(workflow.id, {
        name,
        description,
        trigger_type: triggerType,
        steps: cleanSteps,
      });
      if (error) {
        setError(error);
        setSaving(false);
        return;
      }
    } else {
      const { error } = await createWorkflow({
        name,
        description,
        status: "paused",
        trigger_type: triggerType,
        steps: cleanSteps,
      });
      if (error) {
        setError(error);
        setSaving(false);
        return;
      }
    }

    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4 sticky top-0 bg-zinc-950">
          <h2 className="text-lg font-semibold text-white">
            {isEdit ? "Edit Workflow" : "Create Workflow"}
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

          {/* Workflow Info */}
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">Workflow Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-white placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
                placeholder="e.g., Speed to Lead"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="h-20 w-full rounded-lg border border-zinc-700 bg-zinc-800 p-3 text-sm text-white placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none resize-none"
                placeholder="Describe what this workflow does..."
              />
            </div>
          </div>

          {/* Trigger */}
          <div className="space-y-2">
            <label className="mb-1.5 block text-xs font-medium text-zinc-400 uppercase">Trigger</label>
            <select
              value={triggerType}
              onChange={(e) => setTriggerType(e.target.value)}
              className="h-10 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-white focus:border-indigo-500 focus:outline-none"
            >
              {TRIGGER_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
              {/* Render legacy trigger value as a disabled fallback so editing
                  an old workflow doesn't silently change its trigger. */}
              {!TRIGGER_OPTIONS.some((t) => t.value === triggerType) && triggerType && (
                <option value={triggerType} disabled>
                  {triggerType} (legacy — switch to Manual)
                </option>
              )}
            </select>
            <p className="mt-1 text-[11px] text-zinc-500">
              Event-based triggers (Contact Created, Call Completed, etc.) coming soon. Workflows currently run on manual trigger only.
            </p>
          </div>

          {/* Steps */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-zinc-400 uppercase">Actions</label>
            <div className="space-y-2">
              {steps.map((step, idx) => (
                <div key={step.id}>
                  {idx > 0 && (
                    <div className="flex justify-center py-2">
                      <ArrowDown className="h-4 w-4 text-zinc-600" />
                    </div>
                  )}
                  <ActionCard
                    step={step}
                    onUpdate={(updates) => updateStep(step.id, updates)}
                    onDelete={() => deleteStep(step.id)}
                  />
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={addStep}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-700 py-3 text-sm text-zinc-400 hover:border-indigo-500 hover:text-indigo-400"
            >
              <Plus className="h-4 w-4" />
              Add Action Step
            </button>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="h-9 rounded-lg border border-zinc-700 px-4 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex h-9 items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {isEdit ? "Save Workflow" : "Create Workflow"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
