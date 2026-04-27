// src/components/dashboard/daily-digest-card.tsx
//
// Stage 3.6.4 — Daily AI digest card. Right-rail-style.
// Mounts → fetches /api/dashboard/digest once → renders. No polling
// (cache TTL handles freshness; user can hard-refresh to bust).

"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

interface Props {
  orgId: string | null;
}

interface DigestResponse {
  text: string;
  generated_at: string;
  cached: boolean;
}

function relativeTime(iso: string): string {
  const ago = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ago / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function DailyDigestCard({ orgId }: Props) {
  const [data, setData] = useState<DigestResponse | null>(null);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/dashboard/digest", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as DigestResponse;
        if (!cancelled) setData(json);
      } catch (err) {
        console.warn("[daily-digest-card] load failed", err);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  if (!orgId || !data) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-400" />
          <div className="text-sm font-semibold text-white">Today&apos;s pulse</div>
        </div>
        <div className="mt-4 space-y-2">
          <div className="h-3 w-full rounded bg-zinc-800/60 animate-pulse" />
          <div className="h-3 w-[90%] rounded bg-zinc-800/60 animate-pulse" />
          <div className="h-3 w-[60%] rounded bg-zinc-800/60 animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-amber-400" />
        <div className="text-sm font-semibold text-white">Today&apos;s pulse</div>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-zinc-300">{data.text}</p>
      <p className="mt-3 text-[10px] text-zinc-500">
        Generated {relativeTime(data.generated_at)} · {data.cached ? "cached" : "fresh"}
      </p>
    </div>
  );
}
