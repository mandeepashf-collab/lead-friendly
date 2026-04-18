"use client";

import { useState } from "react";
import { FileText, Plus, Copy, Edit2, Trash2, MessageSquare, Mail, Phone, Search, Check } from "lucide-react";
import { cn } from "@/lib/utils";

type TemplateType = "sms" | "email" | "call_script";

interface Template {
  id: string;
  type: TemplateType;
  name: string;
  subject?: string;
  body: string;
  tags: string[];
}

const SAMPLE_TEMPLATES: Template[] = [
  { id: "1", type: "sms", name: "Initial Outreach",
    body: "Hi {first_name}, this is {agent_name} from {company_name}. I'm reaching out about your {loan_type} — I'd love to connect for 5 minutes. Reply STOP to opt out.",
    tags: ["outbound", "intro"] },
  { id: "2", type: "sms", name: "Appointment Reminder",
    body: "Hi {first_name}! Just a reminder about your appointment tomorrow at {time}. Reply 'YES' to confirm or 'NO' to reschedule.",
    tags: ["appointment", "reminder"] },
  { id: "3", type: "email", name: "Follow-up After Call",
    subject: "Great speaking with you, {first_name}!",
    body: "Hi {first_name},\n\nThank you for taking the time to speak with me today about {topic}.\n\nAs discussed, here are the next steps:\n• Review the materials I'm sending over\n• Schedule a follow-up call\n\nPlease don't hesitate to reach out if you have any questions.\n\nBest regards,\n{agent_name}",
    tags: ["follow-up", "email"] },
  { id: "4", type: "email", name: "Introduction Email",
    subject: "Regarding your {loan_type} — {company_name}",
    body: "Hi {first_name},\n\nMy name is {agent_name} from {company_name}.\n\nI'm reaching out because we specialize in helping people with {loan_type} and I believe we can help you too.\n\nWould you be available for a quick 10-minute call this week?\n\nBest,\n{agent_name}",
    tags: ["intro", "email"] },
  { id: "5", type: "call_script", name: "Outbound Opening",
    body: "Opening:\nHi, may I speak with {first_name}?\n\nGreat! This is {agent_name} from {company_name}. How are you today?\n\n[Wait for response]\n\nBridge:\nThe reason I'm calling — we noticed you may qualify for {offer}. Do you have 2 minutes?\n\nValue Prop:\nWe've been helping clients save on their {loan_type}. Based on your profile, you could save significantly...",
    tags: ["call", "outbound"] },
  { id: "6", type: "call_script", name: "Objection Handling",
    body: "Price Objection:\n'I understand. If we could show you how this pays for itself in {timeframe}, would that be worth a look?'\n\nNot Interested:\n'I respect that completely. May I ask what specifically isn't a fit right now?'\n\nNeed to Think:\n'Of course! What specifically would help you feel more confident?'",
    tags: ["call", "objections"] },
];

const TYPE_CONFIG: Record<TemplateType, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  sms:         { label: "SMS",         icon: MessageSquare, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
  email:       { label: "Email",       icon: Mail,          color: "text-blue-400",    bg: "bg-blue-500/10 border-blue-500/20" },
  call_script: { label: "Call Script", icon: Phone,         color: "text-purple-400",  bg: "bg-purple-500/10 border-purple-500/20" },
};

const VARIABLES = ["{first_name}","{last_name}","{agent_name}","{company_name}","{loan_type}","{offer}","{time}","{topic}"];

export default function TemplatesPage() {
  const [filter, setFilter] = useState<TemplateType | "all">("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Template | null>(SAMPLE_TEMPLATES[0]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filtered = SAMPLE_TEMPLATES.filter(t => {
    if (filter !== "all" && t.type !== filter) return false;
    if (search && !t.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const handleCopy = (t: Template) => {
    navigator.clipboard.writeText(t.body);
    setCopiedId(t.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Templates</h1>
          <p className="text-zinc-400">SMS, email, and call script templates</p>
        </div>
        <button className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
          <Plus className="h-4 w-4" />New Template
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {(["sms","email","call_script"] as TemplateType[]).map(type => {
          const cfg = TYPE_CONFIG[type];
          const count = SAMPLE_TEMPLATES.filter(t => t.type === type).length;
          return (
            <button key={type} onClick={() => setFilter(filter === type ? "all" : type)}
              className={cn("rounded-xl border p-4 text-left transition-all", filter === type ? cfg.bg : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-700")}>
              <div className="flex items-center gap-2 mb-1">
                <cfg.icon className={cn("h-4 w-4", cfg.color)} />
                <span className="text-xs font-medium text-zinc-400">{cfg.label}</span>
              </div>
              <p className="text-2xl font-bold text-white">{count}</p>
              <p className="text-xs text-zinc-600 mt-0.5">templates</p>
            </button>
          );
        })}
      </div>

      <div className="flex gap-4" style={{ height: "calc(100vh - 22rem)" }}>
        <div className="w-72 shrink-0 flex flex-col gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search templates…"
              className="h-9 w-full rounded-lg border border-zinc-800 bg-zinc-900 pl-10 pr-3 text-sm text-zinc-300 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none" />
          </div>
          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
            {filtered.map(t => {
              const cfg = TYPE_CONFIG[t.type];
              return (
                <button key={t.id} onClick={() => setSelected(t)}
                  className={cn("w-full text-left rounded-lg border p-3 transition-all",
                    selected?.id === t.id ? "border-indigo-500/40 bg-indigo-500/10" : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-700")}>
                  <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium mb-1", cfg.bg, cfg.color)}>
                    <cfg.icon className="h-3 w-3" />{cfg.label}
                  </span>
                  <p className="text-sm font-medium text-white">{t.name}</p>
                  <p className="text-xs text-zinc-600 mt-0.5 truncate">{t.body.slice(0, 55)}…</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden flex flex-col">
          {selected ? (
            <>
              <div className="flex items-center justify-between p-4 border-b border-zinc-800">
                <div className="flex items-center gap-3">
                  {(() => { const cfg = TYPE_CONFIG[selected.type]; return (
                    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium", cfg.bg, cfg.color)}>
                      <cfg.icon className="h-3.5 w-3.5" />{cfg.label}
                    </span>
                  ); })()}
                  <h2 className="text-sm font-semibold text-white">{selected.name}</h2>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => handleCopy(selected)} className="flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800">
                    {copiedId === selected.id ? <><Check className="h-3.5 w-3.5 text-emerald-400" />Copied!</> : <><Copy className="h-3.5 w-3.5" />Copy</>}
                  </button>
                  <button className="flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800">
                    <Edit2 className="h-3.5 w-3.5" />Edit
                  </button>
                </div>
              </div>
              {selected.subject && (
                <div className="px-4 py-3 border-b border-zinc-800">
                  <span className="text-xs text-zinc-500 mr-2">Subject:</span>
                  <span className="text-sm text-zinc-300">{selected.subject}</span>
                </div>
              )}
              <div className="flex-1 p-4 overflow-y-auto">
                <pre className="text-sm text-zinc-300 whitespace-pre-wrap font-sans leading-relaxed">{selected.body}</pre>
              </div>
              <div className="border-t border-zinc-800 p-4 space-y-2">
                <p className="text-xs text-zinc-500">Variables (click to copy):</p>
                <div className="flex flex-wrap gap-1.5">
                  {VARIABLES.map(v => (
                    <button key={v} onClick={() => navigator.clipboard.writeText(v)}
                      className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-indigo-400 hover:bg-zinc-700 font-mono">{v}</button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center text-zinc-600">
              <div className="text-center"><FileText className="mx-auto h-10 w-10 mb-3" /><p className="text-sm">Select a template to preview</p></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
