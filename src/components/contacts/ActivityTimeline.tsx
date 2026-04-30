"use client";

/**
 * ActivityTimeline — Phase 3c
 *
 * Unified activity feed for /people/[id]. Pulls calls, appointments,
 * contact_events, and messages via fetchActivityFeed (Phase 3a),
 * renders typed cards via the timeline/* components, and subscribes
 * to realtime INSERT/UPDATE on calls and INSERT on contact_events
 * so newly-emitted timeline rows appear within ~1s without refresh.
 *
 * Owns its own Supabase channel — replaces the inline calls
 * subscription that lived in /people/[id]/page.tsx prior to this
 * refactor (and the now-unused useRealtimeCalls hook in that page).
 *
 * Pagination is timestamp-cursor via fetchActivityFeed; "Load more"
 * fetches the next page using the oldest event's createdAt as the
 * `before` cursor.
 *
 * Error handling: fetchActivityFeed is best-effort (each source
 * degrades to empty on error). On unexpected throws we render a
 * retry button rather than crashing the page.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  fetchActivityFeed,
  getNextCursor,
  type ActivityEvent,
  type ContactEventRow,
} from "@/lib/contacts/activity-feed";
import type { Call } from "@/types/database";
import { CallEventCard } from "./timeline/CallEventCard";
import { AppointmentEventCard } from "./timeline/AppointmentEventCard";
import { StatusChangeEventCard } from "./timeline/StatusChangeEventCard";
import { TagEventCard } from "./timeline/TagEventCard";
import { MessageEventCard } from "./timeline/MessageEventCard";
import { SystemEventCard } from "./timeline/SystemEventCard";

const PAGE_SIZE = 30;

// ── Helpers ───────────────────────────────────────────────────────

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  if (isNaN(t)) return "";
  const diffMs = Date.now() - t;
  const sec = Math.max(1, Math.floor(diffMs / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  // Longer than a week — render as a date
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: new Date(iso).getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
  });
}

function authorLabel(opts: {
  createdByKind: string;
  createdByUserId: string | null;
  currentUserId: string;
  profileNames: Record<string, string>;
}): string {
  if (opts.createdByKind === "system" || opts.createdByKind === "webhook") {
    return "Lead Friendly";
  }
  if (opts.createdByKind === "ai_agent") {
    return "AI agent";
  }
  if (!opts.createdByUserId) return "Lead Friendly";
  if (opts.createdByUserId === opts.currentUserId) return "you";
  return opts.profileNames[opts.createdByUserId] ?? "a teammate";
}

interface Props {
  contactId: string;
  currentUserId: string;
}


export function ActivityTimeline({ contactId, currentUserId }: Props) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profileNames, setProfileNames] = useState<Record<string, string>>({});

  const supabase = useMemo(() => createClient(), []);

  // ── Profile-name hydrator ───────────────────────────────────────
  // Fires whenever the events list grows. Looks up display names for
  // any distinct created_by_user_id we don't already have.
  useEffect(() => {
    const distinctIds = new Set<string>();
    for (const ev of events) {
      if (ev.kind !== "event") continue;
      const uid = ev.data.created_by_user_id;
      if (uid && !profileNames[uid]) distinctIds.add(uid);
    }
    if (distinctIds.size === 0) return;

    let cancelled = false;
    (async () => {
      const ids = Array.from(distinctIds);
      const { data, error: profErr } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", ids);
      if (cancelled || profErr || !data) return;
      setProfileNames((prev) => {
        const next = { ...prev };
        for (const row of data as { id: string; full_name: string | null }[]) {
          next[row.id] = row.full_name ?? "a teammate";
        }
        return next;
      });
    })();

    return () => { cancelled = true; };
  }, [events, profileNames, supabase]);

  // ── Initial load ───────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchActivityFeed(contactId, { limit: PAGE_SIZE, supabase })
      .then((res) => {
        if (cancelled) return;
        setEvents(res.events);
        setHasMore(res.hasMore);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[ActivityTimeline] fetch failed:", err);
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [contactId, supabase]);

  // ── Realtime: calls (INSERT + UPDATE) and contact_events (INSERT) ──
  useEffect(() => {
    const channel = supabase
      .channel(`contact-timeline:${contactId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "calls", filter: `contact_id=eq.${contactId}` },
        (payload) => {
          const call = payload.new as Call;
          if (!call.created_at) return;
          setEvents((prev) => {
            // Skip if already present (duplicate event delivery)
            if (prev.some((e) => e.kind === "call" && e.id === call.id)) return prev;
            const next: ActivityEvent = {
              kind: "call",
              id: call.id,
              createdAt: call.created_at,
              data: call,
            };
            return [next, ...prev].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "calls", filter: `contact_id=eq.${contactId}` },
        (payload) => {
          const call = payload.new as Call;
          setEvents((prev) =>
            prev.map((e) =>
              e.kind === "call" && e.id === call.id
                ? { ...e, data: call }
                : e,
            ),
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "contact_events", filter: `contact_id=eq.${contactId}` },
        (payload) => {
          const row = payload.new as ContactEventRow;
          setEvents((prev) => {
            if (prev.some((e) => e.kind === "event" && e.id === row.id)) return prev;
            const next: ActivityEvent = {
              kind: "event",
              id: row.id,
              createdAt: row.created_at,
              data: row,
            };
            return [next, ...prev].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
          });
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [contactId, supabase]);


  // ── Load more ──────────────────────────────────────────────────
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    const cursor = getNextCursor(events);
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const res = await fetchActivityFeed(contactId, {
        limit: PAGE_SIZE,
        before: cursor,
        supabase,
      });
      setEvents((prev) => {
        // Merge while deduping by (kind, id) — realtime may have raced.
        const seen = new Set(prev.map((e) => `${e.kind}:${e.id}`));
        const additions = res.events.filter((e) => !seen.has(`${e.kind}:${e.id}`));
        return [...prev, ...additions];
      });
      setHasMore(res.hasMore);
    } catch (err) {
      console.error("[ActivityTimeline] loadMore failed:", err);
    } finally {
      setLoadingMore(false);
    }
  }, [contactId, events, hasMore, loadingMore, supabase]);

  const retry = useCallback(() => {
    setError(null);
    setLoading(true);
    fetchActivityFeed(contactId, { limit: PAGE_SIZE, supabase })
      .then((res) => {
        setEvents(res.events);
        setHasMore(res.hasMore);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
  }, [contactId, supabase]);


  // ── Render ─────────────────────────────────────────────────────
  if (loading && events.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (error && events.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-amber-500 mb-2">
          Couldn&rsquo;t load activity.
        </p>
        <button
          onClick={retry}
          className="text-xs text-indigo-400 hover:text-indigo-300"
        >
          Retry
        </button>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="text-center py-12 text-zinc-600">
        <Activity size={24} className="mx-auto mb-2 opacity-50" />
        <p className="text-sm">No activity yet</p>
        <p className="text-xs text-zinc-700 mt-1">
          Calls, appointments, status changes, and tags will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {events.map((ev) => {
        const relativeTime = formatRelative(ev.createdAt);
        switch (ev.kind) {
          case "call":
            return <CallEventCard key={`call:${ev.id}`} call={ev.data} />;
          case "appointment":
            return (
              <AppointmentEventCard
                key={`appt:${ev.id}`}
                appointment={ev.data}
                relativeTime={relativeTime}
              />
            );
          case "message":
            return (
              <MessageEventCard
                key={`msg:${ev.id}`}
                message={ev.data}
                relativeTime={relativeTime}
              />
            );
          case "event": {
            const author = authorLabel({
              createdByKind: ev.data.created_by_kind,
              createdByUserId: ev.data.created_by_user_id,
              currentUserId,
              profileNames,
            });
            switch (ev.data.event_type) {
              case "status_changed":
                return (
                  <StatusChangeEventCard
                    key={`event:${ev.id}`}
                    event={ev.data}
                    authorLabel={author}
                    relativeTime={relativeTime}
                  />
                );
              case "tag_added":
              case "tag_removed":
                return (
                  <TagEventCard
                    key={`event:${ev.id}`}
                    event={ev.data}
                    authorLabel={author}
                    relativeTime={relativeTime}
                  />
                );
              default:
                return (
                  <SystemEventCard
                    key={`event:${ev.id}`}
                    event={ev.data}
                    authorLabel={author}
                    relativeTime={relativeTime}
                  />
                );
            }
          }
          default:
            return null;
        }
      })}

      {hasMore && (
        <div className="flex justify-center pt-2">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="text-xs text-indigo-400 hover:text-indigo-300 disabled:text-zinc-600 disabled:cursor-not-allowed inline-flex items-center gap-2"
          >
            {loadingMore && <Loader2 size={12} className="animate-spin" />}
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}
