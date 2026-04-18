"use client";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useWorkflow } from "@/hooks/use-workflows";

export default function EditWorkflowPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === "string" ? params.id : "";
  const { workflow, loading } = useWorkflow(id);

  if (loading) return <div className="flex items-center justify-center py-40 text-zinc-500">Loading…</div>;
  if (!workflow) return (
    <div className="flex flex-col items-center justify-center py-40 gap-4">
      <p className="text-zinc-400">Workflow not found</p>
      <button onClick={() => router.push("/automations")} className="text-sm text-indigo-400">← Back</button>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => router.push("/automations")} className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white">
          <ArrowLeft className="h-4 w-4" />Back
        </button>
        <div className="h-4 w-px bg-zinc-700" />
        <h1 className="text-2xl font-bold text-white">Edit: {workflow.name}</h1>
      </div>
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
        <p className="text-sm text-zinc-400">Trigger: <span className="text-white">{workflow.trigger_type}</span></p>
        <p className="text-sm text-zinc-400 mt-1">Steps: <span className="text-white">{Array.isArray(workflow.steps) ? workflow.steps.length : 0}</span></p>
        <p className="text-sm text-zinc-400 mt-1">Status: <span className="text-white capitalize">{workflow.status}</span></p>
        <p className="text-xs text-zinc-600 mt-4">Full edit UI coming in next update.</p>
      </div>
    </div>
  );
}
