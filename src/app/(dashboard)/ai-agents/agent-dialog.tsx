"use client";

import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { createAIAgent, updateAIAgent } from "@/hooks/use-ai-agents";
import { ALL_VOICES, getVoiceDisplayLabel } from "@/lib/voices";
import type { AIAgent } from "@/types/database";

interface Props {
  agent: AIAgent | null;
  onClose: () => void;
  onSaved: () => void;
}

// Build the voice option list from the central ElevenLabs voice catalog.
// Previously this dialog hardcoded OpenAI TTS voices (Alloy, Echo, Fable,
// Onyx, Nova, Shimmer) which is the wrong provider — we use ElevenLabs.
// Only show ElevenLabs voices here to keep the dropdown selection UX
// aligned with what the backend TTS can actually render.
const VOICE_OPTIONS = ALL_VOICES
  .filter(v => v.provider === "elevenlabs")
  .map(v => ({ value: v.id, label: getVoiceDisplayLabel(v.id) }));

// Safer default voice id: Rachel (a real ElevenLabs voice) instead of "alloy".
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";

const TYPE_OPTIONS = [
  { value: "inbound", label: "Inbound" },
  { value: "outbound", label: "Outbound" },
  { value: "sms", label: "SMS" },
  { value: "chat", label: "Chat" },
];

export function AgentDialog({ agent, onClose, onSaved }: Props) {
  const isEdit = !!agent;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: agent?.name || "",
    type: agent?.type || "outbound",
    voice_id: agent?.voice_id || DEFAULT_VOICE_ID,
    system_prompt: agent?.system_prompt || "",
    greeting_message: agent?.greeting_message || "",
    cost_per_minute: agent ? parseFloat((agent as any).cost_per_minute || "0") : 0,
    response_latency: agent ? parseFloat((agent as any).response_latency || "0") : 0,
  });

  const update = (field: string, value: string | number) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    if (!form.name.trim()) {
      setError("Agent name is required");
      setSaving(false);
      return;
    }

    if (isEdit && agent) {
      const { error } = await updateAIAgent(agent.id, {
        name: form.name,
        type: form.type as any,
        voice_id: form.voice_id,
        system_prompt: form.system_prompt,
        greeting_message: form.greeting_message,
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
        className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4 sticky top-0 bg-zinc-950">
          <h2 className="text-lg font-semibold text-white">
            {isEdit ? "Edit Agent" : "Create Agent"}
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

          {/* Name */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-zinc-400">Agent Name *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              required
              className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-white placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
              placeholder="e.g., Lead Qualifier Bot"
            />
          </div>

          {/* Type & Voice */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">Agent Type</label>
              <select
                value={form.type}
                onChange={(e) => update("type", e.target.value)}
                className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-white focus:border-indigo-500 focus:outline-none"
              >
                {TYPE_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">Voice</label>
              <select
                value={form.voice_id}
                onChange={(e) => update("voice_id", e.target.value)}
                className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-white focus:border-indigo-500 focus:outline-none"
              >
                {VOICE_OPTIONS.map((v) => (
                  <option key={v.value} value={v.value}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* System Prompt */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-zinc-400">System Prompt</label>
            <textarea
              value={form.system_prompt}
              onChange={(e) => update("system_prompt", e.target.value)}
              className="h-24 w-full rounded-lg border border-zinc-700 bg-zinc-800 p-3 text-sm text-white placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none resize-none"
              placeholder="Define the agent's behavior and role..."
            />
          </div>

          {/* Greeting Message */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-zinc-400">Greeting Message</label>
            <textarea
              value={form.greeting_message}
              onChange={(e) => update("greeting_message", e.target.value)}
              className="h-20 w-full rounded-lg border border-zinc-700 bg-zinc-800 p-3 text-sm text-white placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none resize-none"
              placeholder="How should the agent greet callers?"
            />
          </div>


          {/* Cost & Latency */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">Cost per Minute</label>
              <input
                type="number"
                step="0.01"
                value={form.cost_per_minute}
                onChange={(e) => update("cost_per_minute", parseFloat(e.target.value))}
                className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-white placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">Response Latency (ms)</label>
              <input
                type="number"
                step="10"
                value={form.response_latency}
                onChange={(e) => update("response_latency", parseFloat(e.target.value))}
                className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-white placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
                placeholder="0"
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
              {isEdit ? "Save Agent" : "Create Agent"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
