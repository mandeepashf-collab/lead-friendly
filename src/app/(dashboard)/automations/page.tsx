"use client";
import Link from "next/link";
import { Zap, Plus, GitBranch, Clock, Play, Pause, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkflows, deleteWorkflow, updateWorkflow } from "@/hooks/use-workflows";

const TRIGGER_LABELS: Record<string, string> = {
  contact_created: "Contact Created", call_completed: "Call Completed",
  appointment_booked: "Appointment Booked", tag_added: "Tag Added",
  form_submitted: "Form Submitted", manual: "Manual",
};

export default function AutomationsPage() {
  const { workflows, loading, refetch } = useWorkflows();
  const activeCount = workflows.filter(w => w.status === "active").length;
  const totalRuns = workflows.reduce((s, w) => s + (w.total_runs || 0), 0);

  const handleToggle = async (w: { id: string; status: string }) => {
    await updateWorkflow(w.id, { status: w.status === "active" ? "paused" : "active" } as Parameters<typeof updateWorkflow>[1]);
    refetch();
  };
  const handleDelete = async (id: string) => {
    if (!confirm("Delete this workflow?")) return;
    await deleteWorkflow(id); refetch();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Automations</h1>
          <p className="text-zinc-400">Build and manage automated workflows</p>
        </div>
        <Link href="/automations/new" className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
          <Plus className="h-4 w-4" />New Workflow
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Workflows", value: workflows.length, icon: GitBranch, color: "text-indigo-400" },
          { label: "Active", value: activeCount, icon: Zap, color: "text-emerald-400" },
          { label: "Total Runs", value: totalRuns.toLocaleString(), icon: Clock, color: "text-blue-400" },
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
      ) : workflows.length === 0 ? (
        <div className="flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/50 gap-4">
          <Zap className="h-16 w-16 text-zinc-700" />
          <div className="text-center">
            <p className="text-sm font-medium text-zinc-400">No automations yet</p>
            <p className="text-xs text-zinc-600 mt-1">Automate repetitive tasks with workflows</p>
          </div>
          <Link href="/automations/new" className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            <Plus className="h-4 w-4" />Create Workflow
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {workflows.map(w => (
            <div key={w.id} className="flex items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 hover:border-zinc-700 transition-colors">
              <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                w.status === "active" ? "bg-emerald-500/10" : "bg-zinc-800")}>
                <Zap className={cn("h-5 w-5", w.status === "active" ? "text-emerald-400" : "text-zinc-600")} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-white">{w.name}</h3>
                  <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize",
                    w.status === "active" ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" : "text-zinc-500 bg-zinc-500/10 border-zinc-500/20")}>
                    {w.status}
                  </span>
                </div>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Trigger: {TRIGGER_LABELS[w.trigger_type] || w.trigger_type} · {Array.isArray(w.steps) ? w.steps.length : 0} steps · {(w.total_runs || 0).toLocaleString()} runs
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Link href={`/automations/${w.id}`} className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800">Edit</Link>
                <button onClick={() => handleToggle(w)}
                  className={cn("flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium",
                    w.status === "active" ? "bg-amber-500/10 text-amber-400 hover:bg-amber-500/20" : "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20")}>
                  {w.status === "active" ? <><Pause className="h-3.5 w-3.5" />Pause</> : <><Play className="h-3.5 w-3.5" />Enable</>}
                </button>
                <button onClick={() => handleDelete(w.id)} className="rounded-lg p-1.5 text-zinc-600 hover:bg-red-500/10 hover:text-red-400">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
