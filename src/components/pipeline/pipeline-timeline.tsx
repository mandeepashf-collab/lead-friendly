"use client";

import { useMemo } from "react";
import { Sparkles } from "lucide-react";
import { StagePill } from "@/components/ui/stage-pill";
import { getStageTone, TONE_CLASSES } from "@/lib/pipeline/tones";
import type { Opportunity } from "@/types/database";

interface StageBucket {
  stage: { id: string; name: string };
  opportunities: (Opportunity & {
    contact?: { first_name: string | null; last_name: string | null };
    assigned_user?: { full_name: string | null };
    days_in_stage?: number;
  })[];
}

interface TimelineDeal {
  id: string;
  name: string;
  contactName: string | null;
  stageName: string;
  value: number;
  createdAt: string;
}

interface Props {
  stages: StageBucket[];
  onEventClick: (id: string) => void;
  onAdd?: () => void;
  onAiClick?: (id: string, name: string) => void;
}

export function PipelineTimeline({ stages, onEventClick, onAdd, onAiClick }: Props) {
  const events = useMemo<TimelineDeal[]>(() => {
    const flat: TimelineDeal[] = [];
    for (const bucket of stages) {
      for (const opp of bucket.opportunities) {
        const first = opp.contact?.first_name ?? "";
        const last = opp.contact?.last_name ?? "";
        const contactName = `${first} ${last}`.trim() || null;
        flat.push({
          id: opp.id,
          name: opp.name,
          contactName,
          stageName: bucket.stage.name,
          value: opp.value || 0,
          createdAt: opp.created_at,
        });
      }
    }
    flat.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return flat;
  }, [stages]);

  const grouped = useMemo(() => {
    const groups: Array<{ label: string; deals: TimelineDeal[] }> = [];
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

    for (const deal of events) {
      const d = new Date(deal.createdAt);
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      let label: string;
      if (dayStart.getTime() === today.getTime()) label = "Today";
      else if (dayStart.getTime() === yesterday.getTime()) label = "Yesterday";
      else
        label = d.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
        });

      const last = groups[groups.length - 1];
      if (last && last.label === label) {
        last.deals.push(deal);
      } else {
        groups.push({ label, deals: [deal] });
      }
    }
    return groups;
  }, [events]);

  if (events.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-12 text-center">
        <p className="text-sm text-zinc-400 mb-4">
          No deals yet — add one to start tracking your pipeline.
        </p>
        {onAdd && (
          <button
            onClick={onAdd}
            className="inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs bg-[var(--violet-bg)] text-[var(--violet-primary)] hover:bg-[var(--violet-border)] transition-colors"
          >
            + Add Deal
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-6">
      <div className="relative">
        <div className="absolute left-[7px] top-2 bottom-2 w-px bg-zinc-800" aria-hidden="true" />
        <div className="space-y-8">
          {grouped.map((group) => (
            <section key={group.label} className="relative">
              <h3 className="text-xs uppercase tracking-wider text-zinc-500 mb-3 ml-7">
                {group.label}
              </h3>
              <ul className="space-y-3">
                {group.deals.map((deal) => {
                  const tone = getStageTone(deal.stageName);
                  const classes = TONE_CLASSES[tone];
                  return (
                    <li
                      key={deal.id}
                      onClick={() => onEventClick(deal.id)}
                      className="relative pl-7 cursor-pointer group"
                    >
                      <span
                        className={`absolute left-0 top-1.5 inline-block w-3.5 h-3.5 rounded-full ring-4 ring-zinc-950 ${classes.dot}`}
                        aria-hidden="true"
                      />
                      <div className="flex items-baseline gap-3 flex-wrap">
                        <span className="text-sm font-medium text-zinc-100 group-hover:text-white transition-colors">
                          {deal.name}
                        </span>
                        <StagePill tone={tone}>{deal.stageName}</StagePill>
                        <span className="text-sm tabular-nums text-zinc-300">
                          ${deal.value.toLocaleString()}
                        </span>
                        <span className="text-xs text-zinc-500 flex-1">
                          created
                          {deal.contactName ? ` · ${deal.contactName}` : ""}
                        </span>
                        {onAiClick && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onAiClick(deal.id, deal.name);
                            }}
                            className="inline-flex items-center justify-center w-7 h-7 rounded text-[var(--amber-ai)] hover:bg-[var(--violet-bg)] transition-colors"
                            aria-label="AI insights"
                          >
                            <Sparkles className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
