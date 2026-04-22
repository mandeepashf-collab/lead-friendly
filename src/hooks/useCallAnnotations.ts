"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * call_annotations row shape (subset used by Annotate UI).
 * annotation_type CHECK values match the DB default-driven convention:
 *   needs_improvement | great_response | comment
 */
export interface CallAnnotation {
  id: string;
  call_id: string;
  line_index: number;
  speaker: string;
  transcript_line: string;
  annotation_type: "needs_improvement" | "great_response" | "comment";
  title: string | null;
  priority: "low" | "medium" | "high" | null;
  prompt_correction: string | null;
  status: string | null;
  created_at: string;
}

export interface CreateAnnotationInput {
  callId: string;
  lineIndex: number;
  speaker: string;
  transcriptLine: string;
  annotationType: "needs_improvement" | "great_response" | "comment";
  title: string;
  priority?: "low" | "medium" | "high";
  promptCorrection?: string;
}

/**
 * Read + write annotations for a single call.
 *
 * - `annotations` is an array, keyed by line_index for easy lookup in the UI
 * - `create` returns the inserted row so the caller can optimistic-update
 * - Reloads from DB after a successful insert (keeps the cache consistent
 *   even if multiple tabs annotate the same call)
 */
export function useCallAnnotations(callId: string | null | undefined): {
  annotations: CallAnnotation[];
  loading: boolean;
  error: string | null;
  create: (input: CreateAnnotationInput) => Promise<CallAnnotation | null>;
  refetch: () => void;
} {
  const [annotations, setAnnotations] = useState<CallAnnotation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!callId) {
      setAnnotations([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    const sb = createClient();
    sb.from("call_annotations")
      .select(
        "id, call_id, line_index, speaker, transcript_line, annotation_type, title, priority, prompt_correction, status, created_at",
      )
      .eq("call_id", callId)
      .order("line_index", { ascending: true })
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) {
          setError(err.message);
          setAnnotations([]);
        } else {
          setAnnotations((data as CallAnnotation[]) ?? []);
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [callId, nonce]);

  const create = useCallback(
    async (input: CreateAnnotationInput): Promise<CallAnnotation | null> => {
      const sb = createClient();
      const { data: userRes } = await sb.auth.getUser();
      const userId = userRes.user?.id ?? null;

      const { data, error: err } = await sb
        .from("call_annotations")
        .insert({
          call_id: input.callId,
          line_index: input.lineIndex,
          speaker: input.speaker,
          transcript_line: input.transcriptLine,
          annotation_type: input.annotationType,
          title: input.title,
          priority: input.priority ?? "medium",
          prompt_correction: input.promptCorrection ?? null,
          user_id: userId,
        })
        .select(
          "id, call_id, line_index, speaker, transcript_line, annotation_type, title, priority, prompt_correction, status, created_at",
        )
        .single();

      if (err) {
        setError(err.message);
        return null;
      }
      // Optimistic append + trigger a refetch for eventual consistency
      const row = data as CallAnnotation;
      setAnnotations((prev) =>
        [...prev, row].sort((a, b) => a.line_index - b.line_index),
      );
      setNonce((n) => n + 1);
      return row;
    },
    [],
  );

  return {
    annotations,
    loading,
    error,
    create,
    refetch: () => setNonce((n) => n + 1),
  };
}
