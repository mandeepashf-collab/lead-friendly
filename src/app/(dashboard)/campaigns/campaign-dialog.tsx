"use client";

import { useState } from "react";
import {
  X,
  Loader2,
  Megaphone,
  Clock,
  Users,
  Calendar,
} from "lucide-react";
import { createCampaign, updateCampaign, useAIAgents } from "@/hooks/use-campaigns";
import type { Campaign } from "@/types/database";

interface Props {
  campaign: Campaign | null;
  onClose: () => void;
  onSaved: () => void;
}

const CAMPAIGN_TYPES = [
  { value: "outbound_call", label: "Outbound Call" },
  { value: "sms", label: "SMS" },
  { value: "email", label: "Email" },
];

export function CampaignDialog({ campaign, onClose, onSaved }: Props) {
  const isEdit = !!campaign;
  const { agents } = useAIAgents();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: campaign?.name || "",
    type: campaign?.type || "outbound_call",
    ai_agent_id: campaign?.ai_agent_id || "",
    daily_call_limit: campaign?.daily_call_limit || 50,
    calls_per_batch: 10,
    cooldown_seconds: 30,
    number_rotation: false,
    schedule_start: "",
    schedule_end: "",
    active_hours_start: "09:00",
    active_hours_end: "17:00",
    active_days: ["monday", "tuesday", "wednesday", "thursday", "friday"],
  });

  const update = (field: string, value: unknown) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const toggleDay = (day: string) => {
    const days = form.active_days as string[];
    if (days.includes(day)) {
      update("active_days", days.filter((d) => d !== day));
    } else {
      update("active_days", [...days, day]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    if (!form.name || !form.type || !form.ai_agent_id) {
      setError("Please fill in all required fields");
      setSaving(false);
      return;
    }

    const payload = {
      name: form.name,
      type: form.type,
      ai_agent_id: form.ai_agent_id,
      daily_call_limit: form.daily_call_limit,
      status: isEdit ? campaign?.status : "draft",
    };

    if (isEdit && campaign) {
      const { error: err } = await updateCampaign(campaign.id, payload);
      if (err) {
        setError(err);
        setSaving(false);
        return;
      }
    } else {
      const { error: err } = await createCampaign(payload);
      if (err) {
        setError(err);
        setSaving(false);
        return;
      }
    }

    onSaved();
  };

  const DAYS = [
    { value: "monday", label: "Mon" },
    { value: "tuesday", label: "Tue" },
    { value: "wednesday", label: "Wed" },
    { value: "thursday", label: "Thu" },
    { value: "friday", label: "Fri" },
    { value: "saturday", label: "Sat" },
    { value: "sunday", label: "Sun" },
  ];

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
            {isEdit ? "Edit Campaign" : "Create Campaign"}
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
            <label className="mb-1.5 block text-xs font-medium text-zinc-400">
              Campaign Name *
            </label>
            <div className="relative">
              <Megaphone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
              <input
                type="text"
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                required
                className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 pl-10 pr-3 text-sm text-white placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
                placeholder="Q1 Sales Outreach"
              />
            </div>
          </div>

          {/* Type & AI Agent */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">
                Campaign Type *
              </label>
              <select
                value={form.type}
                onChange={(e) => update("type", e.target.value)}
                required
                className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-white focus:border-indigo-500 focus:outline-none"
              >
                {CAMPAIGN_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">
                AI Agent *
              </label>
              <select
                value={form.ai_agent_id}
                onChange={(e) => update("ai_agent_id", e.target.value)}
                required
                className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-white focus:border-indigo-500 focus:outline-none"
              >
                <option value="">Select agent</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Daily Call Limit & Calls Per Batch */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">
                Daily Call Limit
              </label>
              <div className="relative">
                <Users className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
                <input
                  type="number"
                  value={form.daily_call_limit}
                  onChange={(e) =>
                    update("daily_call_limit", parseInt(e.target.value) || 0)
                  }
                  min="1"
                  className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 pl-10 pr-3 text-sm text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">
                Calls Per Batch
              </label>
              <input
                type="number"
                value={form.calls_per_batch}
                onChange={(e) =>
                  update("calls_per_batch", parseInt(e.target.value) || 0)
                }
                min="1"
                className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-white focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Cooldown & Number Rotation */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">
                Cooldown (seconds)
              </label>
              <input
                type="number"
                value={form.cooldown_seconds}
                onChange={(e) =>
                  update("cooldown_seconds", parseInt(e.target.value) || 0)
                }
                min="0"
                className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-white focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-zinc-400">
                <input
                  type="checkbox"
                  checked={form.number_rotation}
                  onChange={(e) => update("number_rotation", e.target.checked)}
                  className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 accent-indigo-600"
                />
                Number Rotation
              </label>
            </div>
          </div>

          {/* Schedule Start/End */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">
                Schedule Start
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
                <input
                  type="date"
                  value={form.schedule_start}
                  onChange={(e) => update("schedule_start", e.target.value)}
                  className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 pl-10 pr-3 text-sm text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">
                Schedule End
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
                <input
                  type="date"
                  value={form.schedule_end}
                  onChange={(e) => update("schedule_end", e.target.value)}
                  className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 pl-10 pr-3 text-sm text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Active Hours */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">
                Active Hours Start
              </label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
                <input
                  type="time"
                  value={form.active_hours_start}
                  onChange={(e) => update("active_hours_start", e.target.value)}
                  className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 pl-10 pr-3 text-sm text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">
                Active Hours End
              </label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
                <input
                  type="time"
                  value={form.active_hours_end}
                  onChange={(e) => update("active_hours_end", e.target.value)}
                  className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800 pl-10 pr-3 text-sm text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Active Days */}
          <div>
            <label className="mb-2 block text-xs font-medium text-zinc-400">
              Active Days
            </label>
            <div className="flex items-center gap-2">
              {DAYS.map((day) => (
                <button
                  key={day.value}
                  type="button"
                  onClick={() => toggleDay(day.value)}
                  className={`h-8 w-8 rounded-lg border text-xs font-medium transition-colors ${
                    form.active_days.includes(day.value)
                      ? "border-indigo-500 bg-indigo-600/20 text-indigo-400"
                      : "border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-600"
                  }`}
                >
                  {day.label}
                </button>
              ))}
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
              {isEdit ? "Save Changes" : "Create Campaign"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
