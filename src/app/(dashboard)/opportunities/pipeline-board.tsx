"use client";

import { useState } from "react";
import { Plus, Trash2, Edit2, Eye, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { moveOpportunity, deleteOpportunity } from "@/hooks/use-opportunities";
import type { Opportunity } from "@/types/database";

interface Stage {
  id: string;
  name: string;
  color: string;
  sort_order: number;
}

interface StageData {
  stage: Stage;
  opportunities: (Opportunity & {
    contact?: { first_name: string | null; last_name: string | null };
    assigned_user?: { full_name: string | null };
    days_in_stage?: number;
  })[];
  count: number;
  totalValue: number;
}

interface Props {
  stages: StageData[];
  onAdd: () => void;
  onEdit: (opp: Opportunity) => void;
  onDelete: (id: string) => void;
  refetch: () => void;
}

const STAGE_COLORS: Record<string, { border: string; bg: string }> = {
  blue: { border: "border-blue-500", bg: "bg-blue-500/10" },
  amber: { border: "border-amber-500", bg: "bg-amber-500/10" },
  purple: { border: "border-purple-500", bg: "bg-purple-500/10" },
  cyan: { border: "border-cyan-500", bg: "bg-cyan-500/10" },
  green: { border: "border-green-500", bg: "bg-green-500/10" },
  red: { border: "border-red-500", bg: "bg-red-500/10" },
};

function getStageColor(stageName: string): { border: string; bg: string } {
  const name = stageName.toLowerCase();
  if (name.includes("new")) return STAGE_COLORS.blue;
  if (name.includes("qualified")) return STAGE_COLORS.amber;
  if (name.includes("proposal")) return STAGE_COLORS.purple;
  if (name.includes("negotiation")) return STAGE_COLORS.cyan;
  if (name.includes("won")) return STAGE_COLORS.green;
  if (name.includes("lost")) return STAGE_COLORS.red;
  return STAGE_COLORS.blue;
}

function OpportunityCard({
  opportunity,
  stageId,
  onEdit,
  onDelete,
  onMove,
  stages,
}: {
  opportunity: Opportunity & {
    contact?: { first_name: string | null; last_name: string | null };
    assigned_user?: { full_name: string | null };
    days_in_stage?: number;
  };
  stageId: string;
  onEdit: (opp: Opportunity) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, newStageId: string) => void;
  stages: Stage[];
}) {
  const [showMoveMenu, setShowMoveMenu] = useState(false);

  const contactName = opportunity.contact
    ? `${opportunity.contact.first_name || ""} ${opportunity.contact.last_name || ""}`.trim()
    : "No Contact";

  const formattedValue = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
  }).format(opportunity.value || 0);

  return (
    <div className="group rounded-lg border border-zinc-800 bg-zinc-900 p-4 hover:border-zinc-700 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <h3 className="font-medium text-white text-sm flex-1 line-clamp-2">{opportunity.name}</h3>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onEdit(opportunity)}
            className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-white"
            title="Edit"
          >
            <Edit2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onDelete(opportunity.id)}
            className="rounded p-1 text-zinc-500 hover:bg-red-500/10 hover:text-red-400"
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Contact Name */}
      <p className="text-xs text-zinc-400 mb-2 line-clamp-1">{contactName}</p>

      {/* Value */}
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-indigo-400">{formattedValue}</span>
        <span className="text-xs text-zinc-500">{opportunity.days_in_stage || 0}d</span>
      </div>

      {/* Move Button */}
      <div className="relative">
        <button
          onClick={() => setShowMoveMenu(!showMoveMenu)}
          className="w-full flex items-center justify-between gap-2 rounded-lg border border-zinc-700 bg-zinc-800/50 px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 transition-colors"
        >
          <span>Move</span>
          <ChevronDown className="h-3 w-3" />
        </button>

        {showMoveMenu && (
          <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-lg border border-zinc-700 bg-zinc-900 shadow-lg overflow-hidden">
            {stages
              .filter((s) => s.id !== stageId)
              .map((stage) => (
                <button
                  key={stage.id}
                  onClick={() => {
                    onMove(opportunity.id, stage.id);
                    setShowMoveMenu(false);
                  }}
                  className="block w-full text-left px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800 transition-colors"
                >
                  {stage.name}
                </button>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function PipelineBoard({ stages, onAdd, onEdit, onDelete, refetch }: Props) {
  const handleDelete = async (id: string) => {
    if (!confirm("Delete this opportunity? This action cannot be undone.")) return;
    await deleteOpportunity(id);
    refetch();
  };

  const handleMove = async (id: string, newStageId: string) => {
    await moveOpportunity(id, newStageId);
    refetch();
  };

  // Get all unique stages for move menu
  const allStages = stages.map((s) => s.stage);

  return (
    <div className="overflow-x-auto pb-4">
      <div className="inline-flex gap-4 min-w-full pr-4">
        {stages.map((stageData) => {
          const colors = getStageColor(stageData.stage.name);

          return (
            <div key={stageData.stage.id} className="flex-shrink-0 w-96">
              {/* Column Header */}
              <div
                className={cn(
                  "rounded-t-lg border-x border-t border-zinc-800 bg-zinc-900 px-4 py-3",
                  colors.border
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-white text-sm">{stageData.stage.name}</h3>
                    <p className="text-xs text-zinc-500 mt-1">
                      {stageData.count} deal{stageData.count !== 1 ? "s" : ""} •{" "}
                      {new Intl.NumberFormat("en-US", {
                        style: "currency",
                        currency: "USD",
                        minimumFractionDigits: 0,
                      }).format(stageData.totalValue)}
                    </p>
                  </div>
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-800 text-xs font-medium text-zinc-300">
                    {stageData.count}
                  </div>
                </div>
              </div>

              {/* Column Cards */}
              <div
                className={cn(
                  "rounded-b-lg border-x border-b border-zinc-800 bg-zinc-950 p-3 space-y-3 min-h-96",
                  colors.border
                )}
              >
                {stageData.opportunities.length === 0 ? (
                  <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-zinc-800">
                    <p className="text-xs text-zinc-600">No opportunities</p>
                  </div>
                ) : (
                  stageData.opportunities.map((opp) => (
                    <OpportunityCard
                      key={opp.id}
                      opportunity={opp}
                      stageId={stageData.stage.id}
                      onEdit={onEdit}
                      onDelete={handleDelete}
                      onMove={handleMove}
                      stages={allStages}
                    />
                  ))
                )}

                {/* Add Card Button */}
                <button
                  onClick={onAdd}
                  className="w-full rounded-lg border border-dashed border-zinc-700 py-2 text-xs text-zinc-500 hover:border-zinc-600 hover:text-zinc-400 transition-colors"
                >
                  + Add Deal
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
