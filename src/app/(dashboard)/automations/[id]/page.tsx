"use client";
import { useParams, useRouter } from "next/navigation";
import { useWorkflow } from "@/hooks/use-workflows";
import { WorkflowBuilder } from "../workflow-builder";

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

  // WorkflowBuilder is a modal-style component. We render it directly with
  // close/save both routing back to the list page. This swaps in the existing
  // editor (used by the create flow) instead of the placeholder stub.
  return (
    <WorkflowBuilder
      workflow={workflow}
      onClose={() => router.push("/automations")}
      onSaved={() => router.push("/automations")}
    />
  );
}
