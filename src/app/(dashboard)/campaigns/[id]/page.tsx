"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Phone, PhoneCall, Calendar, TrendingUp, Download, Pause, Play, Bot, Users } from "lucide-react";
import { useCampaigns, updateCampaign } from "@/hooks/use-campaigns";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

export default function CampaignResultsPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === "string" ? params.id : "";
  const { campaigns, refetch: refetchCampaigns } = useCampaigns();
  const campaign = campaigns.find(c => c.id === id);
  const [calls, setCalls] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [agentName, setAgentName] = useState<string>("");
  const [toggling, setToggling] = useState(false);

  // Load campaign-specific calls
  useEffect(() => {
    if (!id) return;
    fetch(`/api/campaigns/${id}/calls`)
      .then(r => r.json())
      .then(d => { setCalls(d.calls || d.data || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [id]);

  // Load agent name
  useEffect(() => {
    if (!campaign?.ai_agent_id) return;
    const supabase = createClient();
    supabase.from("ai_agents").select("name").eq("id", campaign.ai_agent_id).maybeSingle()
      .then(({ data }) => { if (data) setAgentName(data.name); });
  }, [campaign?.ai_agent_id]);

  const handleToggleStatus = async () => {
    if (!campaign) return;
    setToggling(true);
    const newStatus = campaign.status === "active" ? "paused" : "active";
    await updateCampaign(campaign.id, { status: newStatus });
    refetchCampaigns();
    setToggling(false);
  };

  const answerRate = campaign && campaign.total_contacted > 0
    ? Math.round((campaign.total_answered / campaign.total_contacted) * 100) : 0;
  const progress = campaign ? Math.min(100, Math.round(((campaign.total_contacted || 0) / ((campaign.daily_call_limit || 100) * 7)) * 100)) : 0;

  if (!campaign) return (
    <div className="flex flex-col items-center justify-center py-40 gap-4">
      <p className="text-zinc-400">Campaign not found</p>
      <button onClick={() => router.push("/campaigns")} className="text-sm text-indigo-400 hover:text-indigo-300">← Back</button>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/campaigns")} className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white">
            <ArrowLeft className="h-4 w-4" />Back
          </button>
          <div className="h-4 w-px bg-zinc-700" />
          <div>
            <h1 className="text-2xl font-bold text-white">{campaign.name}</h1>
            <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize mt-1",
              campaign.status === "active" ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" : "text-zinc-400 bg-zinc-500/10 border-zinc-500/20")}>
              {campaign.status}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-2 rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-800">
            <Download className="h-4 w-4" />Export
          </button>
          <button onClick={handleToggleStatus} disabled={toggling}
            className={cn("flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            campaign.status === "active" ? "bg-amber-500/10 text-amber-400 hover:bg-amber-500/20" : "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20",
            toggling && "opacity-50 cursor-not-allowed")}>
            {campaign.status === "active" ? <><Pause className="h-4 w-4" />{toggling ? "Pausing…" : "Pause"}</> : <><Play className="h-4 w-4" />{toggling ? "Resuming…" : "Resume"}</>}
          </button>
        </div>
      </div>

      {/* Progress */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium text-zinc-300">Overall Progress</p>
          <span className="text-sm font-semibold text-indigo-400">{progress}%</span>
        </div>
        <div className="h-3 rounded-full bg-zinc-800">
          <div className="h-3 rounded-full bg-indigo-600 transition-all" style={{ width: `${progress}%` }} />
        </div>
        <div className="flex justify-between text-xs text-zinc-600 mt-1">
          <span>{campaign.total_contacted || 0} contacted</span>
          <span>{campaign.daily_call_limit || 0} daily limit</span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Total Called", value: campaign.total_contacted || 0, icon: Phone, color: "text-indigo-400" },
          { label: "Answered", value: campaign.total_answered || 0, icon: PhoneCall, color: "text-emerald-400" },
          { label: "Appointments", value: campaign.total_appointments || 0, icon: Calendar, color: "text-purple-400" },
          { label: "Answer Rate", value: `${answerRate}%`, icon: TrendingUp, color: "text-blue-400" },
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

      {/* Agent + campaign info */}
      {(campaign.ai_agent_id || agentName) && (
        <div className="flex items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-900/50 px-5 py-3">
          <Bot className="h-5 w-5 text-indigo-400" />
          <div className="flex-1">
            <p className="text-xs text-zinc-500">AI Agent</p>
            <p className="text-sm font-medium text-white">{agentName || "Loading…"}</p>
          </div>
          {campaign.ai_agent_id && (
            <Link href={`/ai-agents/${campaign.ai_agent_id}`}
              className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
              View Agent →
            </Link>
          )}
        </div>
      )}

      {/* Target tags (display-only in 1.5; edit deferred) */}
      {Array.isArray((campaign as unknown as { contact_filter?: { tags?: string[] } }).contact_filter?.tags) &&
       ((campaign as unknown as { contact_filter: { tags: string[] } }).contact_filter.tags).length > 0 && (
        <div className="flex items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-900/50 px-5 py-3">
          <div className="flex-1">
            <p className="text-xs text-zinc-500">Target Tags</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {(campaign as unknown as { contact_filter: { tags: string[] } }).contact_filter.tags.map((tagName) => (
                <span key={tagName}
                  className="inline-flex items-center rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-0.5 text-xs font-medium text-indigo-300">
                  {tagName}
                </span>
              ))}
            </div>
          </div>
          <span className="text-[10px] uppercase tracking-wider text-zinc-600">OR match</span>
        </div>
      )}

      {/* Call log */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800">
          <h3 className="text-sm font-semibold text-white">Call Log</h3>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-zinc-800">
              {["Contact","Called At","Duration","Status","Sentiment"].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/50">
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-zinc-600">Loading…</td></tr>
            ) : calls.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-zinc-600">No calls yet</td></tr>
            ) : calls.slice(0,30).map(c => {
              const rec = c as Record<string, unknown>;
              const contact = rec.contacts as {first_name:string|null;last_name:string|null}|null;
              const name = contact ? [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "Unknown" : "Unknown";
              const durSec = (rec.duration_seconds as number) || 0;
              const dur = durSec ? `${Math.floor(durSec/60)}:${String(durSec%60).padStart(2,"0")}` : "—";
              const status = (rec.status as string) || "unknown";
              const outcome = (rec.outcome as string) || "";
              return (
                <tr key={rec.id as string} onClick={() => router.push(`/calls/${rec.id}`)}
                  className="hover:bg-zinc-800/20 cursor-pointer transition-colors">
                  <td className="px-4 py-3 text-sm font-medium text-white">{name}</td>
                  <td className="px-4 py-3 text-sm text-zinc-400">{new Date(rec.created_at as string).toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm text-zinc-400">{dur}</td>
                  <td className="px-4 py-3"><span className={cn("text-xs font-medium capitalize px-2 py-0.5 rounded-full border",
                    status === "completed" ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" : "text-zinc-400 bg-zinc-500/10 border-zinc-500/20")}>
                    {status}</span></td>
                  <td className="px-4 py-3 text-sm capitalize text-zinc-400">{outcome ? outcome.replace(/_/g, " ") : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
