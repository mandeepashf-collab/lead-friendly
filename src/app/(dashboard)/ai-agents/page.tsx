"use client";

import Link from "next/link";
import { Bot, Plus, Phone, Zap, Settings2, Trash2, Sparkles, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAIAgents, deleteAIAgent } from "@/hooks/use-ai-agents";
import { AGENT_TEMPLATES, FEATURED_TEMPLATES } from "@/lib/agent-templates";
import type { AIAgent } from "@/types/database";

const VOICES: Record<string, string> = {
  "aura-2-luna-en": "Luna", "aura-2-orion-en": "Orion",
  "aura-2-stella-en": "Stella", "aura-2-asteria-en": "Asteria",
  "aura-2-athena-en": "Athena", "aura-2-helios-en": "Helios",
  "aura-2-hera-en": "Hera", "aura-2-zeus-en": "Zeus",
};

function AgentCard({ agent, onDelete }: { agent: AIAgent; onDelete: () => void }) {
  const voiceName = VOICES[agent.voice_id || ""] || agent.voice_id?.split("-").pop() || "Custom";
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 space-y-4 hover:border-zinc-700 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
            agent.status === "active" ? "bg-indigo-600/20" : "bg-zinc-800")}>
            <Bot className={cn("h-5 w-5", agent.status === "active" ? "text-indigo-400" : "text-zinc-600")} />
          </div>
          <div>
            <h3 className="font-semibold text-white text-sm">{agent.name}</h3>
            <p className="text-xs text-zinc-500 mt-0.5 capitalize">{agent.type || "Outbound"}</p>
          </div>
        </div>
        <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium border",
          agent.status === "active"
            ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
            : "text-zinc-500 bg-zinc-500/10 border-zinc-500/20")}>
          <span className={cn("h-1.5 w-1.5 rounded-full", agent.status === "active" ? "bg-emerald-400" : "bg-zinc-600")} />
          {agent.status === "active" ? "Active" : "Inactive"}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-zinc-950/50 p-2.5 text-center">
          <p className="text-lg font-bold text-white">{(agent.total_calls || 0).toLocaleString()}</p>
          <p className="text-xs text-zinc-600">Total calls</p>
        </div>
        <div className="rounded-lg bg-zinc-950/50 p-2.5 text-center">
          <p className="text-lg font-bold text-white">{voiceName}</p>
          <p className="text-xs text-zinc-600">Voice</p>
        </div>
      </div>
      {agent.system_prompt && (
        <p className="text-xs text-zinc-600 line-clamp-2 leading-relaxed">{agent.system_prompt}</p>
      )}
      <div className="flex items-center gap-2 pt-1 border-t border-zinc-800">
        <Link href={`/ai-agents/${agent.id}`}
          className="flex items-center gap-1.5 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-700 flex-1 justify-center">
          <Settings2 className="h-3.5 w-3.5" />Configure
        </Link>
        <button onClick={onDelete}
          className="rounded-lg border border-zinc-800 p-1.5 text-zinc-600 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export default function AIAgentsPage() {
  const { agents, loading, refetch } = useAIAgents();
  const activeCount = agents.filter(a => a.status === "active").length;
  const totalCalls = agents.reduce((s, a) => s + (a.total_calls || 0), 0);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this agent?")) return;
    await deleteAIAgent(id);
    refetch();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">AI Agents</h1>
          <p className="text-zinc-400">Configure and train your AI voice agents</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/ai-agents/build" prefetch={true}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            <Sparkles className="h-4 w-4" />Create agent
          </Link>
          <Link href="/ai-agents/new" prefetch={true}
            className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-700">
            <Plus className="h-4 w-4" />Advanced
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Agents", value: agents.length, icon: Bot, color: "text-indigo-400" },
          { label: "Active Agents", value: activeCount, icon: Zap, color: "text-emerald-400" },
          { label: "Total Calls Made", value: totalCalls.toLocaleString(), icon: Phone, color: "text-blue-400" },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{s.label}</p>
                <p className="mt-2 text-3xl font-bold text-white">{s.value}</p>
              </div>
              <s.icon className={cn("h-5 w-5 mt-0.5", s.color)} />
            </div>
          </div>
        ))}
      </div>

      {/* Featured Templates Strip */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide">Quick-start templates</h2>
          <Link href="/ai-agents/build?tab=templates" className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
            View all <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {FEATURED_TEMPLATES.map(tid => {
            const t = AGENT_TEMPLATES.find(tpl => tpl.id === tid);
            if (!t) return null;
            return (
              <Link key={t.id} href={`/ai-agents/build?template=${t.id}`}
                className="group rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 hover:border-indigo-500/40 transition-colors">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-2xl">{t.icon}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{t.name}</p>
                    <p className="text-xs text-zinc-500">{t.industry}</p>
                  </div>
                </div>
                <p className="text-xs text-zinc-600 line-clamp-2">{t.description}</p>
              </Link>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-zinc-500">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-600 border-t-indigo-500 mr-2" />Loading…
        </div>
      ) : agents.length === 0 ? (
        <div className="rounded-xl border border-indigo-500/20 bg-gradient-to-r from-indigo-600/10 to-purple-600/10 p-8">
          <div className="flex flex-col items-center text-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-600/20">
              <Sparkles className="h-8 w-8 text-indigo-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Build your first AI agent in 60 seconds</h3>
              <p className="mt-1 text-sm text-zinc-400 max-w-md">
                Describe your business and our AI builder will create a trained voice agent — or pick a ready-made template.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/ai-agents/build"
                className="flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700">
                <Sparkles className="h-4 w-4" />Build with AI
              </Link>
              <Link href="/ai-agents/build?tab=templates"
                className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-5 py-2.5 text-sm font-medium text-zinc-300 hover:bg-zinc-700">
                Browse templates
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map(agent => (
            <AgentCard key={agent.id} agent={agent} onDelete={() => handleDelete(agent.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
