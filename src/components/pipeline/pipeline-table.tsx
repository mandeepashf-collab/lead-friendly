"use client";

import { useState, useMemo } from "react";
import { Sparkles, Plus } from "lucide-react";
import { StagePill } from "@/components/ui/stage-pill";
import { getStageTone } from "@/lib/pipeline/tones";
import type { Opportunity } from "@/types/database";

type SortKey = "name" | "value" | "age";
type SortDir = "asc" | "desc";

interface StageBucket {
  stage: { id: string; name: string };
  opportunities: (Opportunity & {
    contact?: { first_name: string | null; last_name: string | null };
    assigned_user?: { full_name: string | null };
    days_in_stage?: number;
  })[];
}

interface DealRow {
  id: string;
  name: string;
  contactName: string | null;
  stageName: string;
  value: number;
  ageDays: number;
  ownerName: string | null;
}

interface Props {
  stages: StageBucket[];
  onRowClick: (id: string) => void;
  onAdd: () => void;
  onAiClick: (id: string, name: string) => void;
}

export function PipelineTable({ stages, onRowClick, onAdd, onAiClick }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("value");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const deals = useMemo<DealRow[]>(
    () =>
      stages.flatMap((s) =>
        s.opportunities.map((opp) => {
          const first = opp.contact?.first_name ?? "";
          const last = opp.contact?.last_name ?? "";
          const contactName = `${first} ${last}`.trim() || null;
          return {
            id: opp.id,
            name: opp.name,
            contactName,
            stageName: s.stage.name,
            value: opp.value || 0,
            ageDays: opp.days_in_stage ?? 0,
            ownerName: opp.assigned_user?.full_name ?? null,
          };
        })
      ),
    [stages]
  );

  const sorted = useMemo(() => {
    const arr = [...deals];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = a.name.localeCompare(b.name);
      else if (sortKey === "value") cmp = a.value - b.value;
      else if (sortKey === "age") cmp = a.ageDays - b.ageDays;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [deals, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  };

  if (deals.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-12 text-center space-y-4">
        <p className="text-sm text-zinc-400">No deals yet — add one to see them here.</p>
        <button
          onClick={onAdd}
          className="inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs bg-[var(--violet-bg)] text-[var(--violet-primary)] hover:bg-[var(--violet-border)] transition-colors"
        >
          <Plus className="h-3 w-3" />
          Add Deal
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-zinc-900 text-xs uppercase tracking-wider text-zinc-400">
          <tr>
            <Th sortable onClick={() => toggleSort("name")} active={sortKey === "name"} dir={sortDir}>Deal</Th>
            <Th>Contact</Th>
            <Th>Stage</Th>
            <Th sortable onClick={() => toggleSort("value")} active={sortKey === "value"} dir={sortDir} align="right">Value</Th>
            <Th sortable onClick={() => toggleSort("age")} active={sortKey === "age"} dir={sortDir} align="right">Age</Th>
            <Th>Owner</Th>
            <Th align="center"><span className="sr-only">AI insights</span></Th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((deal) => (
            <tr
              key={deal.id}
              onClick={() => onRowClick(deal.id)}
              className="border-t border-zinc-800 hover:bg-zinc-900/50 cursor-pointer transition-colors"
            >
              <td className="px-4 py-3 font-medium text-zinc-100">{deal.name}</td>
              <td className="px-4 py-3 text-zinc-300">{deal.contactName || "—"}</td>
              <td className="px-4 py-3">
                <StagePill tone={getStageTone(deal.stageName)}>{deal.stageName}</StagePill>
              </td>
              <td className="px-4 py-3 text-right text-zinc-100 tabular-nums">
                ${deal.value.toLocaleString()}
              </td>
              <td
                className={`px-4 py-3 text-right tabular-nums ${
                  deal.ageDays > 30 ? "text-[var(--hot)]" : "text-zinc-400"
                }`}
              >
                {deal.ageDays}d
              </td>
              <td className="px-4 py-3 text-zinc-400">{deal.ownerName || "—"}</td>
              <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => onAiClick(deal.id, deal.name)}
                  className="inline-flex items-center justify-center w-7 h-7 rounded text-[var(--amber-ai)] hover:bg-[var(--violet-bg)] transition-colors"
                  aria-label="AI insights"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({
  children,
  sortable,
  onClick,
  active,
  dir,
  align,
}: {
  children: React.ReactNode;
  sortable?: boolean;
  onClick?: () => void;
  active?: boolean;
  dir?: SortDir;
  align?: "left" | "right" | "center";
}) {
  const alignClass =
    align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  return (
    <th
      onClick={sortable ? onClick : undefined}
      className={`px-4 py-3 ${alignClass} ${
        sortable ? "cursor-pointer hover:text-zinc-200 select-none" : ""
      } ${active ? "text-zinc-200" : ""}`}
    >
      {children}
      {active && sortable && <span className="ml-1">{dir === "asc" ? "↑" : "↓"}</span>}
    </th>
  );
}
