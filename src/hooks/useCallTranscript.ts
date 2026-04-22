"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Single uniform transcript line regardless of source.
 * Indexed (0..N-1) so annotations can FK by line_index.
 */
export interface TranscriptLine {
  /** Stable 0-based index — used as call_annotations.line_index */
  index: number;
  /** "Speaker 0", "Speaker 1" from Deepgram diarize, or a normalized role */
  speaker: string;
  /** Line text */
  text: string;
  /** Seconds into the recording where this line starts */
  startSec: number;
  /** Seconds into the recording where this line ends */
  endSec: number;
  /** Per-line confidence 0-1 (sentence-level from Deepgram) */
  confidence: number;
}

export type TranscriptState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "processing" }
  | { status: "failed"; message?: string }
  | {
      status: "completed";
      lines: TranscriptLine[];
      flatText: string;
      overallConfidence: number;
      durationSeconds: number;
      model: string;
    };

/**
 * Reads calls.transcript_status first to decide which sub-state to return.
 * Only fetches the full call_transcripts row when status is 'completed' —
 * saves ~50KB per card on the activity feed while things are still processing.
 *
 * Polling: when status is 'pending' or 'processing', re-polls every 10s.
 * Stops polling on terminal states or unmount.
 */
export function useCallTranscript(
  callId: string | null | undefined,
): {
  state: TranscriptState;
  refetch: () => void;
} {
  const [state, setState] = useState<TranscriptState>({ status: "idle" });
  const [refetchNonce, setRefetchNonce] = useState(0);

  useEffect(() => {
    if (!callId) {
      setState({ status: "idle" });
      return;
    }

    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    const sb = createClient();

    async function load() {
      // 1. Check status on the calls row first
      const { data: callRow, error: statusErr } = await sb
        .from("calls")
        .select("transcript_status")
        .eq("id", callId!)
        .maybeSingle();

      if (cancelled) return;

      if (statusErr) {
        setState({ status: "failed", message: statusErr.message });
        return;
      }

      const status = (callRow?.transcript_status as string | null) ?? null;

      if (!status) {
        setState({ status: "idle" });
        return;
      }

      if (status === "pending" || status === "processing") {
        setState({ status: status as "pending" | "processing" });
        // Re-poll in 10s; stop on terminal state or unmount
        pollTimer = setTimeout(() => {
          if (!cancelled) load();
        }, 10_000);
        return;
      }

      if (status === "failed") {
        setState({ status: "failed" });
        return;
      }

      // status === 'completed' — fetch the full row
      const { data: t, error: tErr } = await sb
        .from("call_transcripts")
        .select("text, raw_json, confidence, duration_seconds, model")
        .eq("call_id", callId!)
        .maybeSingle();

      if (cancelled) return;

      if (tErr || !t) {
        setState({
          status: "failed",
          message:
            tErr?.message ??
            "transcript_status=completed but call_transcripts row not found",
        });
        return;
      }

      const lines = parseDeepgramLines(t.raw_json as unknown);
      setState({
        status: "completed",
        lines,
        flatText: (t.text as string) ?? "",
        overallConfidence: Number(t.confidence ?? 0),
        durationSeconds: Number(t.duration_seconds ?? 0),
        model: (t.model as string) ?? "unknown",
      });
    }

    load();

    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [callId, refetchNonce]);

  return {
    state,
    refetch: () => setRefetchNonce((n) => n + 1),
  };
}

/**
 * Parse Deepgram nova-3 response into indexed TranscriptLine[].
 *
 * Deepgram's response shape when we request `diarize=true&utterances=true`:
 *   results.utterances[] — one entry per continuous utterance by one speaker
 *     { start, end, confidence, speaker (int), transcript }
 *
 * We prefer utterances over paragraphs.sentences because utterances respect
 * speaker boundaries natively (a single utterance never crosses speakers).
 * Falls back to paragraphs.sentences if utterances are absent, and finally
 * to a single synthetic line from flat text if neither exists.
 */
function parseDeepgramLines(rawJson: unknown): TranscriptLine[] {
  if (!rawJson || typeof rawJson !== "object") return [];
  const root = rawJson as Record<string, unknown>;
  const results = root.results as Record<string, unknown> | undefined;
  if (!results) return [];

  // Preferred: utterances[]
  const utterances = results.utterances as
    | Array<{
        start?: number;
        end?: number;
        confidence?: number;
        speaker?: number;
        transcript?: string;
      }>
    | undefined;

  if (Array.isArray(utterances) && utterances.length > 0) {
    return utterances
      .map((u, i) => ({
        index: i,
        speaker:
          typeof u.speaker === "number" ? `Speaker ${u.speaker}` : "Speaker",
        text: (u.transcript ?? "").trim(),
        startSec: Number(u.start ?? 0),
        endSec: Number(u.end ?? 0),
        confidence: Number(u.confidence ?? 0),
      }))
      .filter((l) => l.text.length > 0);
  }

  // Fallback: channels[0].alternatives[0].paragraphs.paragraphs[].sentences[]
  const channels = results.channels as
    | Array<{
        alternatives?: Array<{
          paragraphs?: {
            paragraphs?: Array<{
              speaker?: number;
              sentences?: Array<{
                text?: string;
                start?: number;
                end?: number;
              }>;
            }>;
          };
        }>;
      }>
    | undefined;

  const paragraphs =
    channels?.[0]?.alternatives?.[0]?.paragraphs?.paragraphs ?? [];

  if (paragraphs.length > 0) {
    const out: TranscriptLine[] = [];
    let idx = 0;
    for (const p of paragraphs) {
      const speaker =
        typeof p.speaker === "number" ? `Speaker ${p.speaker}` : "Speaker";
      for (const s of p.sentences ?? []) {
        const text = (s.text ?? "").trim();
        if (!text) continue;
        out.push({
          index: idx++,
          speaker,
          text,
          startSec: Number(s.start ?? 0),
          endSec: Number(s.end ?? 0),
          confidence: 0, // sentence-level confidence not provided in paragraphs
        });
      }
    }
    if (out.length > 0) return out;
  }

  // Last-resort fallback: single line from flat channel text if present
  const flat = channels?.[0]?.alternatives?.[0] as
    | { transcript?: string }
    | undefined;
  if (flat?.transcript) {
    return [
      {
        index: 0,
        speaker: "Speaker",
        text: flat.transcript,
        startSec: 0,
        endSec: 0,
        confidence: 0,
      },
    ];
  }

  return [];
}
