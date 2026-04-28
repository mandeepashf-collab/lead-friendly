"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Target, Plus, DollarSign, TrendingUp,
  Megaphone, Play, Pause, Trash2, Users, PhoneCall, Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useOpportunities, usePipelines } from "@/hooks/use-opportunities";
import { useCampaigns, deleteCampaign, updateCampaign } from "@/hooks/use-campaigns";
import { PipelineBoard } from "./pipeline-board";
import { OpportunityDialog } from "./opportunity-dialog";
import { PipelineViewToggle, parseViewFromSearchParams } from "@/components/pipeline/view-toggle";
import { PipelineTable } from "@/components/pipeline/pipeline-table";
import { PipelineTimeline } from "@/components/pipeline/pipeline-timeline";
import { DealAIDrawer } from "@/components/pipeline/deal-ai-drawer";
import type { Opportunity } from "@/types/database";
import type { Campaign } from "@/types/database";

function fmtUSD(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

/* ─── Campaign helpers ─── */
function CampaignStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
    active: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    paused: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    completed: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  };
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize", map[status] || map.draft)}>
      {status}
    </span>
  );
}

/* ─── Opportunities Tab ─── */
function OpportunitiesTab() {
  const searchParams = useSearchParams();
  const view = parseViewFromSearchParams(searchParams.get("view"));
  const [showCreate, setShowCreate] = useState(false);
  const [editOpp, setEditOpp] = useState<Opportunity | null>(null);
  const [selectedPipeline, setSelectedPipeline] = useState<string | undefined>();
  const [aiDrawerDeal, setAiDrawerDeal] = useState<{ id: string; name: string } | null>(null);

  const { pipelines, loading: pipelinesLoading } = usePipelines();
  const activePipeline = selectedPipeline || pipelines[0]?.id;
  const { opportunities, groupedByStage, loading, refetch } = useOpportunities(activePipeline);

  const totalDeals = opportunities.length;
  const pipelineValue = opportunities.reduce((s, o) => s + (o.value || 0), 0);
  const avgDeal = totalDeals > 0 ? pipelineValue / totalDeals : 0;

  return (
    <div className="space-y-6">
      {/* Actions row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PipelineViewToggle current={view} />
          {pipelines.length > 0 && (
            <div className="flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900 p-0.5">
              {pipelines.map((p) => (
                <button key={p.id} onClick={() => setSelectedPipeline(p.id)}
                  className={cn("rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    activePipeline === p.id ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-200")}>
                  {p.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <button onClick={() => { setEditOpp(null); setShowCreate(true); }}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
          <Plus className="h-4 w-4" />Add Opportunity
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Deals", value: totalDeals, icon: Target, color: "text-indigo-400" },
          { label: "Pipeline Value", value: fmtUSD(pipelineValue), icon: DollarSign, color: "text-emerald-400" },
          { label: "Avg Deal Size", value: fmtUSD(avgDeal), icon: TrendingUp, color: "text-blue-400" },
        ].map((s) => (
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

      {/* Board / List view */}
      {loading || pipelinesLoading ? (
        <div className="flex items-center justify-center py-20 text-zinc-500">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-600 border-t-indigo-500 mr-2" />Loading...
        </div>
      ) : pipelines.length === 0 ? (
        <div className="flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/50 gap-4 text-zinc-600">
          <Target className="h-12 w-12" />
          <div className="text-center">
            <p className="text-sm font-medium text-zinc-400">No pipeline yet</p>
            <p className="text-xs mt-1">Please select a pipeline to view opportunities</p>
          </div>
        </div>
      ) : view === "kanban" ? (
        <PipelineBoard
          stages={Object.values(groupedByStage)}
          onAdd={() => { setEditOpp(null); setShowCreate(true); }}
          onEdit={(opp) => { setEditOpp(opp); setShowCreate(true); }}
          onDelete={async (id) => { const { deleteOpportunity } = await import("@/hooks/use-opportunities"); await deleteOpportunity(id); refetch(); }}
          onAiClick={(id, name) => setAiDrawerDeal({ id, name })}
          refetch={refetch}
        />
      ) : view === "table" ? (
        <PipelineTable
          stages={Object.values(groupedByStage)}
          onRowClick={(id) => {
            const opp = opportunities.find((o) => o.id === id);
            if (opp) { setEditOpp(opp); setShowCreate(true); }
          }}
          onAdd={() => { setEditOpp(null); setShowCreate(true); }}
          onAiClick={(id, name) => setAiDrawerDeal({ id, name })}
        />
      ) : (
        <PipelineTimeline
          stages={Object.values(groupedByStage)}
          onEventClick={(id) => {
            const opp = opportunities.find((o) => o.id === id);
            if (opp) { setEditOpp(opp); setShowCreate(true); }
          }}
          onAdd={() => { setEditOpp(null); setShowCreate(true); }}
          onAiClick={(id, name) => setAiDrawerDeal({ id, name })}
        />
      )}

      {showCreate && (
        <OpportunityDialog
          opportunity={editOpp}
          pipelineId={activePipeline}
          onClose={() => { setShowCreate(false); setEditOpp(null); }}
          onSaved={() => { setShowCreate(false); setEditOpp(null); refetch(); }}
        />
      )}

      <DealAIDrawer
        dealId={aiDrawerDeal?.id ?? null}
        dealName={aiDrawerDeal?.name ?? null}
        onClose={() => setAiDrawerDeal(null)}
      />
    </div>
  );
}

/* ─── Campaigns Tab ─── */
function CampaignsTab() {
  const { campaigns, loading, refetch } = useCampaigns();
  const activeCampaigns = campaigns.filter(c => c.status === "active").length;
  const totalContacted = campaigns.reduce((s, c) => s + (c.total_contacted || 0), 0);
  const totalAnswered = campaigns.reduce((s, c) => s + (c.total_answered || 0), 0);
  const totalAppts = campaigns.reduce((s, c) => s + (c.total_appointments || 0), 0);
  const answerRate = totalContacted > 0 ? Math.round((totalAnswered / totalContacted) * 100) : 0;

  const handleToggle = async (c: Campaign) => {
    await updateCampaign(c.id, { status: c.status === "active" ? "paused" : "active" });
    refetch();
  };
  const handleDelete = async (id: string) => {
    if (!confirm("Delete this campaign?")) return;
    await deleteCampaign(id);
    refetch();
  };

  return (
    <div className="space-y-6">
      {/* Actions */}
      <div className="flex items-center justify-end">
        <Link href="/campaigns/new" className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
          <Plus className="h-4 w-4" />Create Campaign
        </Link>
      </div>

      {/* Stats */}
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

      {/* Campaign cards */}
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
            const pct = (c.daily_call_limit || 100) > 0 ? Math.round(((c.total_contacted || 0) / ((c.daily_call_limit || 100) * 7)) * 100) : 0;
            return (
              <div key={c.id} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 space-y-4 hover:border-zinc-700 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-white truncate">{c.name}</h3>
                    <p className="text-xs text-zinc-500 capitalize mt-0.5">{c.type?.replace(/_/g, " ") || "Outbound call"}</p>
                  </div>
                  <CampaignStatusBadge status={c.status} />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-zinc-500">
                    <span>{(c.total_contacted || 0).toLocaleString()} contacted</span>
                    <span>{Math.min(pct, 100)}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-zinc-800">
                    <div className="h-1.5 rounded-full bg-indigo-600" style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  {[{ l: "Contacted", v: c.total_contacted || 0 }, { l: "Answered", v: c.total_answered || 0 }, { l: "Booked", v: c.total_appointments || 0 }].map(s => (
                    <div key={s.l} className="rounded-lg bg-zinc-950/50 p-2">
                      <p className="text-sm font-semibold text-white">{s.v.toLocaleString()}</p>
                      <p className="text-xs text-zinc-600">{s.l}</p>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2 pt-1 border-t border-zinc-800">
                  <button onClick={() => handleToggle(c)}
                    className={cn("flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium flex-1 justify-center",
                      c.status === "active" ? "bg-amber-500/10 text-amber-400 hover:bg-amber-500/20" : "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20")}>
                    {c.status === "active" ? <><Pause className="h-3.5 w-3.5" />Pause</> : <><Play className="h-3.5 w-3.5" />Start</>}
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

/* ─── Main Page ─── */
const TABS = [
  { id: "opportunities", label: "Opportunities" },
  { id: "campaigns", label: "Campaigns" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function PipelinePage() {
  const [activeTab, setActiveTab] = useState<TabId>("opportunities");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Pipeline</h1>
        <p className="text-zinc-400">Track deals and manage outbound campaigns</p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-4 border-b border-zinc-800">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "pb-3 text-sm font-medium transition-colors border-b-2 -mb-px",
              activeTab === tab.id
                ? "border-indigo-500 text-white"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "opportunities" && <OpportunitiesTab />}
      {activeTab === "campaigns" && <CampaignsTab />}
    </div>
  );
}
