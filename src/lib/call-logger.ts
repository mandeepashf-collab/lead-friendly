/**
 * Structured call logger — scoped by call_id.
 *
 * Every log entry tags the call_id so you can pull one ID from
 * voice_webhook_events and see the full lifecycle chain.
 *
 * Usage:
 *   const log = callLogger("crec_abc123");
 *   log.info("call.answered", { agent: "Sarah", direction: "outbound" });
 *   log.error("tts_failed", { voiceId: "xxx", error: "timeout" });
 *   await log.persist(supabase); // flush to voice_webhook_events table
 */

import type { SupabaseClient } from "@supabase/supabase-js";

interface LogEntry {
  timestamp: string;
  level: "info" | "warn" | "error";
  event: string;
  data?: Record<string, unknown>;
}

export function callLogger(callId: string) {
  const entries: LogEntry[] = [];
  const prefix = `[CALL:${callId.slice(-8)}]`;

  function log(level: LogEntry["level"], event: string, data?: Record<string, unknown>) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      event,
      data,
    };
    entries.push(entry);

    // Console output for immediate visibility in Vercel logs
    const msg = `${prefix} [${level.toUpperCase()}] ${event}`;
    if (level === "error") {
      console.error(msg, data ?? "");
    } else if (level === "warn") {
      console.warn(msg, data ?? "");
    } else {
      console.log(msg, data ?? "");
    }
  }

  return {
    info: (event: string, data?: Record<string, unknown>) => log("info", event, data),
    warn: (event: string, data?: Record<string, unknown>) => log("warn", event, data),
    error: (event: string, data?: Record<string, unknown>) => log("error", event, data),

    /** Flush all buffered entries to voice_webhook_events table */
    async persist(supabase: SupabaseClient) {
      if (entries.length === 0) return;
      try {
        const rows = entries.map(e => ({
          event_type: `log.${e.event}`,
          call_control_id: callId,
          payload: { level: e.level, event: e.event, ...e.data },
          created_at: e.timestamp,
        }));
        await supabase.from("voice_webhook_events").insert(rows);
      } catch (err) {
        console.error(`${prefix} Failed to persist logs:`, err);
      }
    },

    /** Get all entries for debugging */
    getEntries: () => [...entries],
  };
}
