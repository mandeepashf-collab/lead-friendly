"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, CheckCircle2, Users, Bot, Clock, Rocket } from "lucide-react";
import { cn } from "@/lib/utils";
import { createCampaign, useAIAgents } from "@/hooks/use-campaigns";
import { getVoiceName } from "@/lib/voices";

const STEPS = [
  { id: 1, label: "Audience",   icon: Users },
  { id: 2, label: "AI Agent",   icon: Bot },
  { id: 3, label: "Schedule",   icon: Clock },
  { id: 4, label: "Launch",     icon: Rocket },
];

const DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const TIMEZONES = ["America/New_York","America/Chicago","America/Denver","America/Los_Angeles","America/Phoenix"];

export default function NewCampaignPage() {
  const router = useRouter();
  const { agents } = useAIAgents();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "", description: "", contact_filter: "all",
    ai_agent_id: "", start_date: new Date().toISOString().split("T")[0],
    call_from: "09:00", call_to: "17:00",
    days: ["Mon","Tue","Wed","Thu","Fri"],
    daily_limit: 100, timezone: "America/New_York", delay_secs: 5,
  });
  const set = (k: keyof typeof form) => (v: unknown) => setForm(f => ({...f,[k]:v}));
  const toggleDay = (d: string) => setForm(f => ({...f, days: f.days.includes(d) ? f.days.filter(x => x !== d) : [...f.days, d]}));

  const costPerMin = 0.047;
  const avgMins = 3;
  const estimatedCost = (form.daily_limit * avgMins * costPerMin).toFixed(2);
  const daysToComplete = Math.ceil(100 / form.daily_limit); // assume 100 contacts

  const handleLaunch = async (status: "active" | "draft") => {
    if (!form.name.trim()) { alert("Campaign name is required"); return; }
    setSaving(true);
    const { data: created } = await createCampaign({
      name: form.name, type: "outbound_call", status,
      ai_agent_id: form.ai_agent_id || null,
      daily_call_limit: form.daily_limit,
      total_contacted: 0, total_answered: 0, total_appointments: 0,
    });

    if (status === 'active' && form.ai_agent_id && created?.id) {
      try {
        await fetch('/api/automations/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'campaign_launch', campaign_id: created.id }),
        });
      } catch (err) {
        console.error('Failed to trigger campaign processing', err);
      }
    }

    router.push("/campaigns");
  };

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.push("/campaigns")} className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white">
          <ArrowLeft className="h-4 w-4" />Back
        </button>
        <div className="h-4 w-px bg-zinc-700" />
        <h1 className="text-2xl font-bold text-white">New Campaign</h1>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-0">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const done = step > s.id;
          const active = step === s.id;
          return (
            <div key={s.id} className="flex items-center flex-1">
              <div className={cn("flex flex-col items-center flex-1")}>
                <div className={cn("flex h-9 w-9 items-center justify-center rounded-full border-2 transition-all",
                  done ? "border-indigo-500 bg-indigo-500" : active ? "border-indigo-500 bg-zinc-900" : "border-zinc-700 bg-zinc-900")}>
                  {done ? <CheckCircle2 className="h-4 w-4 text-white" /> : <Icon className={cn("h-4 w-4", active ? "text-indigo-400" : "text-zinc-600")} />}
                </div>
                <p className={cn("text-xs mt-1 font-medium", active ? "text-white" : done ? "text-indigo-400" : "text-zinc-600")}>{s.label}</p>
              </div>
              {i < STEPS.length - 1 && <div className={cn("h-0.5 flex-1 mt-4", step > s.id ? "bg-indigo-500" : "bg-zinc-800")} />}
            </div>
          );
        })}
      </div>

      {/* Step content */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 space-y-5">
        {step === 1 && (
          <>
            <h2 className="text-lg font-semibold text-white">Select Audience</h2>
            <div><label className="block text-sm font-medium text-zinc-300 mb-1.5">Campaign Name *</label>
              <input value={form.name} onChange={e => set("name")(e.target.value)} placeholder="Q2 Outreach Campaign"
                className="h-10 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-300 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none" /></div>
            <div><label className="block text-sm font-medium text-zinc-300 mb-1.5">Contact Filter</label>
              <select value={form.contact_filter} onChange={e => set("contact_filter")(e.target.value)}
                className="h-10 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-300 focus:border-indigo-500 focus:outline-none">
                <option value="all">All Contacts</option>
                <option value="new">New Only</option>
                <option value="contacted">Contacted</option>
                <option value="qualified">Qualified</option>
              </select></div>
            <div><label className="block text-sm font-medium text-zinc-300 mb-1.5">Description</label>
              <textarea value={form.description} onChange={e => set("description")(e.target.value)} rows={3}
                placeholder="What is this campaign for?"
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-300 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none resize-none" /></div>
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="text-lg font-semibold text-white">Select AI Agent</h2>
            {agents.length === 0 ? (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-300">
                No AI agents yet. <button onClick={() => router.push("/ai-agents/new")} className="underline">Create one first</button>
              </div>
            ) : (
              <div className="space-y-2">
                {agents.map(a => (
                  <button key={a.id} onClick={() => set("ai_agent_id")(a.id)}
                    className={cn("w-full text-left rounded-xl border p-4 transition-all",
                      form.ai_agent_id === a.id ? "border-indigo-500 bg-indigo-500/10" : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-700")}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-white">{a.name}</p>
                        <p className="text-xs text-zinc-500 mt-0.5">{getVoiceName(a.voice_id)} · {a.total_calls || 0} calls made</p>
                      </div>
                      {form.ai_agent_id === a.id && <CheckCircle2 className="h-5 w-5 text-indigo-400" />}
                    </div>
                    {a.system_prompt && <p className="text-xs text-zinc-600 mt-2 line-clamp-2">{a.system_prompt}</p>}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {step === 3 && (
          <>
            <h2 className="text-lg font-semibold text-white">Set Schedule</h2>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-sm font-medium text-zinc-300 mb-1.5">Start Date</label>
                <input type="date" value={form.start_date} onChange={e => set("start_date")(e.target.value)}
                  className="h-10 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-300 focus:border-indigo-500 focus:outline-none" /></div>
              <div><label className="block text-sm font-medium text-zinc-300 mb-1.5">Timezone</label>
                <select value={form.timezone} onChange={e => set("timezone")(e.target.value)}
                  className="h-10 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-300 focus:border-indigo-500 focus:outline-none">
                  {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz.replace("America/","")}</option>)}
                </select></div>
              <div><label className="block text-sm font-medium text-zinc-300 mb-1.5">Call Hours From</label>
                <input type="time" value={form.call_from} onChange={e => set("call_from")(e.target.value)}
                  className="h-10 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-300 focus:border-indigo-500 focus:outline-none" /></div>
              <div><label className="block text-sm font-medium text-zinc-300 mb-1.5">Call Hours To</label>
                <input type="time" value={form.call_to} onChange={e => set("call_to")(e.target.value)}
                  className="h-10 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-300 focus:border-indigo-500 focus:outline-none" /></div>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">Calling Days</label>
              <div className="flex gap-2">{DAYS.map(d => (
                <button key={d} onClick={() => toggleDay(d)} type="button"
                  className={cn("flex-1 rounded-lg py-2 text-xs font-medium border transition-all",
                    form.days.includes(d) ? "border-indigo-500 bg-indigo-500/20 text-indigo-300" : "border-zinc-800 text-zinc-500 hover:border-zinc-700")}>
                  {d}
                </button>
              ))}</div>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                Daily Call Limit: <span className="text-indigo-400">{form.daily_limit} calls/day</span>
              </label>
              <input type="range" min={10} max={500} step={10} value={form.daily_limit}
                onChange={e => set("daily_limit")(Number(e.target.value))} className="w-full accent-indigo-500" />
              <div className="flex justify-between text-xs text-zinc-600 mt-1"><span>10</span><span>500</span></div>
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <h2 className="text-lg font-semibold text-white">Review & Launch</h2>
            <div className="space-y-3">
              {[
                { label: "Campaign Name", value: form.name || "—" },
                { label: "Contact Filter", value: form.contact_filter },
                { label: "AI Agent", value: agents.find(a => a.id === form.ai_agent_id)?.name || "None selected" },
                { label: "Start Date", value: form.start_date },
                { label: "Calling Hours", value: `${form.call_from} – ${form.call_to}` },
                { label: "Days", value: form.days.join(", ") },
                { label: "Daily Limit", value: `${form.daily_limit} calls/day` },
              ].map(r => (
                <div key={r.label} className="flex justify-between text-sm py-2 border-b border-zinc-800">
                  <span className="text-zinc-500">{r.label}</span>
                  <span className="text-white font-medium">{r.value}</span>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-4 pt-2">
              <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-center">
                <p className="text-2xl font-bold text-indigo-400">${estimatedCost}</p>
                <p className="text-xs text-zinc-500 mt-1">Est. daily cost @ $0.047/min</p>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-center">
                <p className="text-2xl font-bold text-indigo-400">{daysToComplete}d</p>
                <p className="text-xs text-zinc-500 mt-1">Est. completion (100 contacts)</p>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => handleLaunch("active")} disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-indigo-600 py-3 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
                <Rocket className="h-4 w-4" />Launch Campaign
              </button>
              <button onClick={() => handleLaunch("draft")} disabled={saving}
                className="flex-1 rounded-lg border border-zinc-700 py-3 text-sm font-medium text-zinc-300 hover:bg-zinc-800 disabled:opacity-50">
                Save as Draft
              </button>
            </div>
          </>
        )}
      </div>

      {/* Nav */}
      <div className="flex items-center justify-between">
        <button disabled={step === 1} onClick={() => setStep(s => s - 1)}
          className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-400 hover:bg-zinc-800 disabled:opacity-30">← Back</button>
        {step < 4 && (
          <button onClick={() => setStep(s => s + 1)}
            className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            Continue →
          </button>
        )}
      </div>
    </div>
  );
}
