// src/components/dashboard/activity-pulse-feed.tsx
//
// Stage 3.6.4 — Activity pulse feed.
// Polls /api/dashboard/activity every 30s when tab is visible.
// New items (not in the seen-id set from prior render) animate in via
// the existing `slide-in` keyframe in globals.css.

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { ActivityEvent, ActivityDotToken } from "@/lib/dashboard/activity";

interface Props {
  orgId: string | null;
}

const POLL_INTERVAL_MS = 30_000;

const DOT_COLOR: Record<ActivityDotToken, string> = {
  "amber-ai": "var(--amber-ai)",
  "slate-400": "#94a3b8",
  pink: "var(--pink)",
  won: "var(--won)",
  lost: "var(--lost)",
  warm: "var(--warm)",
};

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

export function ActivityPulseFeed({ orgId }: Props) {
  const [events, setEvents] = useState<ActivityEvent[] | null>(null);
  const seenRef = useRef<Set<string>>(new Set());
  const [newIds, setNewIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;

    async function load() {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/dashboard/activity", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as { events?: ActivityEvent[] };
        if (cancelled) return;
        const list = json.events ?? [];

        const fresh = new Set<string>();
        if (seenRef.current.size > 0) {
          // Only mark items "new" once we have a baseline — don't animate the entire first load.
          for (const e of list) if (!seenRef.current.has(e.id)) fresh.add(e.id);
        }
        for (const e of list) seenRef.current.add(e.id);

        setEvents(list);
        setNewIds(fresh);
      } catch (err) {
        console.warn("[activity-pulse-feed] load failed", err);
      }
    }

    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [orgId]);

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-white">Activity Pulse</h3>
        <span className="text-xs text-zinc-500">Last 7 days</span>
      </div>

      <div className="mt-4">
        {events === null ? (
          <div className="space-y-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-9 rounded-md bg-zinc-800/40 animate-pulse"
              />
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-zinc-500">
            <p className="text-sm">No recent activity</p>
          </div>
        ) : (
          <ul className="space-y-1">
            {events.map((e) => {
              const isNew = newIds.has(e.id);
              const row = (
                <div
                  className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-zinc-800/40 transition-colors"
                  style={isNew ? { animation: "slide-in 200ms ease-out" } : undefined}
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: DOT_COLOR[e.dotToken] }}
                  />
                  <span className="flex-1 text-sm text-zinc-200 truncate">{e.headline}</span>
                  <span className="text-xs text-zinc-500 tabular-nums shrink-0">
                    {relativeTime(e.ts)}
                  </span>
                </div>
              );
              return (
                <li key={e.id}>
                  {e.href ? (
                    <Link href={e.href} className="block">
                      {row}
                    </Link>
                  ) : (
                    row
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
