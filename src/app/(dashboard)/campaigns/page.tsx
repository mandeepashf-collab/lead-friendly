"use client";
import Link from "next/link";
import { Megaphone, Plus, Play, Pause, Trash2, Users, PhoneCall, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCampaigns, deleteCampaign, updateCampaign } from "@/hooks/use-campaigns";
import type { Campaign } from "@/types/database";

const STATUS_TABS = ["all","draft","active","paused","completed"] as const;

function StatusBadge({ status }: { status: string }) {
  const map: Record<string,string> = {
    draft: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
    active: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    paused: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    completed: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  };
  return <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize", map[status] || map.draft)}>{status}</span>;
}

export default function CampaignsPage() {
  const { campaigns, loading, refetch } = useCampaigns();
  const activeCampaigns = campaigns.filter(c => c.status === "active").length;
  const totalContacted = campaigns.reduce((s,c) => s + (c.total_contacted||0), 0);
  const totalAnswered = campaigns.reduce((s,c) => s + (c.total_answered||0), 0);
  const totalAppts = campaigns.reduce((s,c) => s + (c.total_appointments||0), 0);
  const answerRate = totalContacted > 0 ? Math.round((totalAnswered/totalContacted)*100) : 0;

  const handleToggle = async (c: Campaign) => {
    const nextStatus = c.status === "active" ? "paused" : "active";
    await updateCampaign(c.id, { status: nextStatus });

    // If we just ACTIVATED the campaign, actually start dialing. The
    // campaign runner respects daily_call_limit and skips contacts that
    // have already been dialed by this campaign.
    if (nextStatus === "active") {
      try {
        await fetch("/api/automations/process", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "campaign_launch", campaign_id: c.id }),
        });
      } catch (err) {
        console.error("Campaign launch failed:", err);
      }
    }

    refetch();
  };
  const handleDelete = async (id: string) => {
    if (!confirm("Delete this campaign?")) return;
    await deleteCampaign(id); refetch();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Campaigns</h1>
          <p className="text-zinc-400">Manage outbound calling and messaging campaigns</p>
        </div>
        <Link href="/campaigns/new" className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
          <Plus className="h-4 w-4" />Create Campaign
        </Link>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Active Campaigns", value: activeCampaigns, icon: Megaphone, color: "text-indigo-400" },
          { label: "Total Contacted", value: totalContacted.toLocaleString(), icon: Users, color: "text-blue-400" },
          { label: "Answer Rate", value: `${answerRate}%`, icon: PhoneCall, color: "text-emerald-400" },
          { label: "Appointments", value: totalAppts, icon: Calendar, color: "text-purple-400" },
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

      {loading ? (
        <div className="flex items-center justify-center py-20 text-zinc-500">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-600 border-t-indigo-500 mr-2" />Loading…
        </div>
      ) : campaigns.length === 0 ? (
        <div className="flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/50 gap-4">
          <Megaphone className="h-16 w-16 text-zinc-700" />
          <div className="text-center">
            <p className="text-sm font-medium text-zinc-400">No campaigns yet</p>
            <p className="text-xs text-zinc-600 mt-1">Create your first outbound calling campaign</p>
          </div>
          <Link href="/campaigns/new" className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            <Plus className="h-4 w-4" />Create Campaign
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {campaigns.map(c => {
            const pct = (c.daily_call_limit||100) > 0 ? Math.round(((c.total_contacted||0)/((c.daily_call_limit||100)*7))*100) : 0;
            return (
              <div key={c.id} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 space-y-4 hover:border-zinc-700 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-white truncate">{c.name}</h3>
                    <p className="text-xs text-zinc-500 capitalize mt-0.5">{c.type?.replace(/_/g," ") || "Outbound call"}</p>
                  </div>
                  <StatusBadge status={c.status} />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-zinc-500">
                    <span>{(c.total_contacted||0).toLocaleString()} contacted</span>
                    <span>{Math.min(pct,100)}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-zinc-800">
                    <div className="h-1.5 rounded-full bg-indigo-600" style={{ width: `${Math.min(pct,100)}%` }} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  {[{l:"Contacted",v:c.total_contacted||0},{l:"Answered",v:c.total_answered||0},{l:"Booked",v:c.total_appointments||0}].map(s => (
                    <div key={s.l} className="rounded-lg bg-zinc-950/50 p-2">
                      <p className="text-sm font-semibold text-white">{s.v.toLocaleString()}</p>
                      <p className="text-xs text-zinc-600">{s.l}</p>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2 pt-1 border-t border-zinc-800">
                  <button onClick={() => handleToggle(c)}
                    className={cn("flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium flex-1 justify-center",
                      c.status==="active" ? "bg-amber-500/10 text-amber-400 hover:bg-amber-500/20" : "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20")}>
                    {c.status==="active" ? <><Pause className="h-3.5 w-3.5" />Pause</> : <><Play className="h-3.5 w-3.5" />Start</>}
                  </button>
                  <Link href={`/campaigns/${c.id}`} className="flex items-center gap-1.5 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-700 flex-1 justify-center">
                    View Results
                  </Link>
                  <button onClick={() => handleDelete(c.id)} className="rounded-lg p-1.5 text-zinc-600 hover:bg-red-500/10 hover:text-red-400">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
