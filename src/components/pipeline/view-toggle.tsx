"use client";

import { LayoutGrid, Table2, GitCommitHorizontal } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

export type PipelineView = "kanban" | "table" | "timeline";

const VIEWS: Array<{ id: PipelineView; label: string; Icon: typeof LayoutGrid }> = [
  { id: "kanban", label: "Kanban", Icon: LayoutGrid },
  { id: "table", label: "Table", Icon: Table2 },
  { id: "timeline", label: "Timeline", Icon: GitCommitHorizontal },
];

export function PipelineViewToggle({ current }: { current: PipelineView }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setView = useCallback(
    (view: PipelineView) => {
      const params = new URLSearchParams(searchParams.toString());
      if (view === "kanban") {
        params.delete("view");
      } else {
        params.set("view", view);
      }
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  return (
    <div
      role="tablist"
      aria-label="Pipeline view mode"
      className="inline-flex items-center gap-0.5 rounded-md border border-zinc-800 bg-zinc-900 p-0.5"
    >
      {VIEWS.map(({ id, label, Icon }) => {
        const active = current === id;
        return (
          <button
            key={id}
            role="tab"
            aria-selected={active}
            aria-label={label}
            onClick={() => setView(id)}
            className={[
              "inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs transition-colors",
              active
                ? "bg-[var(--violet-bg)] text-[var(--violet-primary)]"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800",
            ].join(" ")}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function parseViewFromSearchParams(value: string | null | undefined): PipelineView {
  if (value === "table" || value === "timeline") return value;
  return "kanban";
}
