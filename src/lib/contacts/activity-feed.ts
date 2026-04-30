/**
 * activity-feed.ts — Phase 3a
 *
 * Unified activity-timeline fetcher for the contact detail page.
 *
 * Pulls from FOUR sources in parallel, merges chronologically (newest
 * first), and paginates by timestamp cursor:
 *
 *   1. calls           — direct contact_id
 *   2. appointments    — direct contact_id
 *   3. contact_events  — direct contact_id (mig 034 — synthetic events
 *                        like status changes, tag adds, system events)
 *   4. messages        — JOIN via conversations.contact_id (messages
 *                        has no contact_id column; SMS bubbles only
 *                        link through conversations)
 *
 * Pagination is timestamp-cursor (`before`), not offset, so realtime
 * inserts at the head don't shift pages. Each query fetches `limit + 1`
 * rows so we can compute hasMore without a second round trip.
 *
 * The TS type for `messages` in src/types/database.ts is stale and
 * doesn't match the actual columns (the DB has `content`/`sender_type`/
 * `channel`, not `body`/`direction`/`is_outgoing`). This module defines
 * its own MessageRow that matches the live schema. A future cleanup can
 * unify the two; out of scope for Phase 3a.
 *
 * Used by: src/components/contacts/ActivityTimeline.tsx (3c — not built yet)
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { Call, Appointment } from "@/types/database";

// ── Row types ─────────────────────────────────────────────────────

/** A row from the contact_events table (mig 034). */
export interface ContactEventRow {
  id: string;
  organization_id: string;
  contact_id: string;
  event_type:
    | "status_changed"
    | "tag_added"
    | "tag_removed"
    | "note_added"
    | "system";
  payload_json: Record<string, unknown>;
  created_by_user_id: string | null;
  created_by_kind: "user" | "ai_agent" | "system" | "webhook";
  created_at: string;
}

/**
 * A row from the messages table — schema as it actually exists in the
 * DB (verified Apr 30 via information_schema). Note: messages has NO
 * contact_id column; the link to a contact is via conversations.
 */
export interface MessageRow {
  id: string;
  conversation_id: string;
  organization_id: string;
  sender_type: string;
  sender_id: string | null;
  sender_name: string | null;
  content: string;
  channel: string; // 'sms' | 'email' | etc.
  email_subject: string | null;
  attachments: unknown;
  is_read: boolean | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  created_at: string;
}

// ── Discriminated union ───────────────────────────────────────────

export type ActivityEvent =
  | { kind: "call"; id: string; createdAt: string; data: Call }
  | { kind: "appointment"; id: string; createdAt: string; data: Appointment }
  | { kind: "event"; id: string; createdAt: string; data: ContactEventRow }
  | { kind: "message"; id: string; createdAt: string; data: MessageRow };

export interface FetchActivityFeedResult {
  events: ActivityEvent[];
  /** True if any underlying source might have more rows older than the last
   *  event in `events`. Drives the "Load more" button. */
  hasMore: boolean;
}

export interface FetchActivityFeedOptions {
  /** Page size after merge. Default 30. */
  limit?: number;
  /** ISO timestamp cursor — fetch only events strictly older than this.
   *  Pass the `createdAt` of the last event from the previous page. */
  before?: string;
  /** Optional override for testability / SSR. Defaults to browser client. */
  supabase?: SupabaseClient;
}

// ── Fetcher ───────────────────────────────────────────────────────

const DEFAULT_LIMIT = 30;

/**
 * Fetches one page of the unified activity feed for `contactId`.
 *
 * Strategy: each of the 4 sources runs in parallel with `limit + 1`
 * row cap so we can detect "more available" without a second query.
 * After Promise.all, normalize into ActivityEvent shape, sort by
 * createdAt DESC, slice to limit, and compute hasMore.
 *
 * Errors from any single source are logged and treated as empty —
 * the timeline degrades gracefully rather than breaking the whole
 * feed if one query fails (e.g. messages join racing a schema change).
 */
export async function fetchActivityFeed(
  contactId: string,
  opts: FetchActivityFeedOptions = {},
): Promise<FetchActivityFeedResult> {
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const before = opts.before;
  const supabase = opts.supabase ?? createClient();

  // Each query asks for limit+1 rows so any source returning the extra
  // row tells us there's more to page. Cheap heuristic; correct in the
  // common case where activity is bursty within a single source.
  const fetchCap = limit + 1;

  type SourceResult<T> = { rows: T[]; hadExtra: boolean };

  function buildCallsQuery() {
    let q = supabase
      .from("calls")
      .select("*")
      .eq("contact_id", contactId)
      .order("created_at", { ascending: false })
      .limit(fetchCap);
    if (before) q = q.lt("created_at", before);
    return q;
  }

  function buildAppointmentsQuery() {
    let q = supabase
      .from("appointments")
      .select("*")
      .eq("contact_id", contactId)
      .order("created_at", { ascending: false })
      .limit(fetchCap);
    if (before) q = q.lt("created_at", before);
    return q;
  }

  function buildContactEventsQuery() {
    let q = supabase
      .from("contact_events")
      .select("*")
      .eq("contact_id", contactId)
      .order("created_at", { ascending: false })
      .limit(fetchCap);
    if (before) q = q.lt("created_at", before);
    return q;
  }

  function buildMessagesQuery() {
    // messages has no contact_id; we join to conversations and filter on
    // its contact_id. Using `!inner` so the filter applies to rows
    // (PostgREST default is left-join with optional filter, which would
    // return all messages and just filter the embed).
    let q = supabase
      .from("messages")
      .select("*, conversations!inner(contact_id)")
      .eq("conversations.contact_id", contactId)
      .order("created_at", { ascending: false })
      .limit(fetchCap);
    if (before) q = q.lt("created_at", before);
    return q;
  }

  const [callsRes, apptsRes, eventsRes, msgsRes] = await Promise.all([
    buildCallsQuery(),
    buildAppointmentsQuery(),
    buildContactEventsQuery(),
    buildMessagesQuery(),
  ]);

  function unwrap<T>(
    res: { data: unknown; error: { message: string } | null },
    label: string,
  ): SourceResult<T> {
    if (res.error) {
      console.error(`[activity-feed] ${label} query failed:`, res.error);
      return { rows: [], hadExtra: false };
    }
    const rows = (res.data as T[] | null) ?? [];
    return {
      rows: rows.slice(0, limit),
      hadExtra: rows.length > limit,
    };
  }

  const calls = unwrap<Call>(callsRes, "calls");
  const appts = unwrap<Appointment>(apptsRes, "appointments");
  const events = unwrap<ContactEventRow>(eventsRes, "contact_events");
  const messages = unwrap<MessageRow>(msgsRes, "messages");

  // Normalize into discriminated union. Skip rows missing a created_at;
  // they can't be sorted or paginated.
  const merged: ActivityEvent[] = [
    ...calls.rows
      .filter((r) => r.created_at)
      .map<ActivityEvent>((r) => ({
        kind: "call",
        id: r.id,
        createdAt: r.created_at as string,
        data: r,
      })),
    ...appts.rows
      .filter((r) => r.created_at)
      .map<ActivityEvent>((r) => ({
        kind: "appointment",
        id: r.id,
        createdAt: r.created_at as string,
        data: r,
      })),
    ...events.rows.map<ActivityEvent>((r) => ({
      kind: "event",
      id: r.id,
      createdAt: r.created_at,
      data: r,
    })),
    ...messages.rows
      .filter((r) => r.created_at)
      .map<ActivityEvent>((r) => ({
        kind: "message",
        id: r.id,
        createdAt: r.created_at as string,
        data: r,
      })),
  ];

  merged.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  const sliced = merged.slice(0, limit);

  // hasMore is true if either:
  //   (a) any single source returned an extra row beyond `limit`, OR
  //   (b) the merged set itself overflowed `limit` (more rows exist than
  //       a single page can carry, even after slicing).
  // We don't trust (b) alone because all sources could be exactly `limit`
  // long with no more rows behind them; (a) handles that case correctly.
  const hasMore =
    calls.hadExtra ||
    appts.hadExtra ||
    events.hadExtra ||
    messages.hadExtra ||
    merged.length > limit;

  return { events: sliced, hasMore };
}

/**
 * Convenience helper for "Load more" in the UI: returns the cursor to
 * pass as `before` on the next call. Returns null if the page is empty
 * (no further pagination possible).
 */
export function getNextCursor(events: ActivityEvent[]): string | null {
  if (events.length === 0) return null;
  return events[events.length - 1].createdAt;
}
