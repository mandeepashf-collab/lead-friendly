"use client";
import { useState, useRef, useEffect, useMemo } from "react";
import { Play, Pause, Volume2, Settings, Flag, X, ChevronDown, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useCallTranscript } from "@/hooks/useCallTranscript";
import { useCallAnnotations } from "@/hooks/useCallAnnotations";
import { useRecordingUrl } from "@/hooks/use-recording-url";
import { ConvertAnnotationToEvalButton } from "@/components/agents/ConvertAnnotationToEvalButton";

interface CallSummary {
  id: string;
  displayId: string;
  phone: string;
  date: string;
  durationLabel: string;
  recording_url: string | null;
  duration_seconds: number;
}

const ANNOTATION_TYPES = [
  { value: "BAD", label: "Needs Improvement", dbValue: "needs_improvement" as const, color: "bg-red-500/10 border-red-500/30 text-red-400" },
  { value: "GOOD", label: "Good Response", dbValue: "great_response" as const, color: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" },
  { value: "COMMENT", label: "Comment", dbValue: "comment" as const, color: "bg-blue-500/10 border-blue-500/30 text-blue-400" },
];

function dbToUiAnnotationType(db: string): "BAD" | "GOOD" | "COMMENT" {
  if (db === "needs_improvement") return "BAD";
  if (db === "great_response") return "GOOD";
  return "COMMENT";
}

function fmtDuration(secs: number) {
  if (!secs) return "0:00";
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
}

export function AnnotatePage({ agentId }: { agentId: string }) {
  // ── Call list state ────────────────────────────────────────────
  const [calls, setCalls] = useState<CallSummary[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [listLoading, setListLoading] = useState(true);
  const [includePrevious, setIncludePrevious] = useState(false);
  const [minDuration, setMinDuration] = useState(5);
  const [jumpTo, setJumpTo] = useState("");

  const currentCall = calls[currentIndex] ?? null;
  const isLastCall = calls.length > 0 && currentIndex >= calls.length - 1;

  // ── Per-call data via hooks ────────────────────────────────────
  const { state: transcriptState } = useCallTranscript(currentCall?.id ?? null);
  const { annotations, loading: annotationsLoading, create: createAnnotation } =
    useCallAnnotations(currentCall?.id ?? null);
  const recordingUrlState = useRecordingUrl({
    callId: currentCall?.id,
    storedUrl: currentCall?.recording_url,
  });

  // ── Annotation UI state ────────────────────────────────────────
  const [annotatingLine, setAnnotatingLine] = useState<number | null>(null);
  const [annotationTypeUi, setAnnotationTypeUi] = useState<"BAD" | "GOOD" | "COMMENT">("BAD");
  const [annotationText, setAnnotationText] = useState("");

  // ── Converted-to-eval lookup (annotation id -> eval id) ────────
  // Drives the "Converted ✓" variant on the ConvertAnnotationToEvalButton
  // so users don't convert the same annotation twice.
  const [convertedMap, setConvertedMap] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!agentId) return;
    fetch(`/api/agents/${agentId}/converted-annotations`)
      .then((r) => r.json())
      .then((d) => setConvertedMap(d.annotationToEval ?? {}))
      .catch(() => {});
  }, [agentId]);

  // ── Audio player state ─────────────────────────────────────────
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  // ── Load the list of AI agent calls ────────────────────────────
  // IMPORTANT: we NEVER filter by call.transcript legacy column here —
  // transcript now lives in call_transcripts, surfaced via useCallTranscript
  // per call. We filter by duration and recording presence instead.
  useEffect(() => {
    let cancelled = false;
    async function loadList() {
      setListLoading(true);
      const sb = createClient();

      const { data } = await sb
        .from("calls")
        .select("id, duration_seconds, recording_url, created_at, contacts(phone)")
        .eq("ai_agent_id", agentId)
        .gte("duration_seconds", minDuration)
        .order("created_at", { ascending: false })
        .limit(115);

      if (cancelled) return;

      const rows = (data ?? []) as unknown as Array<{
        id: string;
        duration_seconds: number | null;
        recording_url: string | null;
        created_at: string;
        // Supabase types FK joins as arrays even for single-parent relations.
        contacts: { phone: string | null } | { phone: string | null }[] | null;
      }>;

      const mapped: CallSummary[] = rows.map((c) => {
        const contact = Array.isArray(c.contacts) ? c.contacts[0] : c.contacts;
        return ({
        id: c.id,
        displayId: `call_${c.id.slice(0, 8)}`,
        phone: contact?.phone ?? "Unknown",
        date: new Date(c.created_at).toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }),
        durationLabel: fmtDuration(c.duration_seconds ?? 0),
        recording_url: c.recording_url,
        duration_seconds: c.duration_seconds ?? 0,
      });
      });

      setCalls(mapped);
      setCurrentIndex(0);
      setListLoading(false);
    }
    loadList();
    return () => {
      cancelled = true;
    };
  }, [agentId, minDuration, includePrevious]);

  // ── Wire up the audio element ──────────────────────────────────
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => setCurrentTime(a.currentTime);
    const onMeta = () => setDuration(a.duration);
    const onEnd = () => setPlaying(false);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("ended", onEnd);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("ended", onEnd);
    };
  }, [recordingUrlState]);

  const togglePlay = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) {
      a.pause();
      setPlaying(false);
    } else {
      a.play();
      setPlaying(true);
    }
  };

  const seekBar = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = audioRef.current;
    if (!a || !duration) return;
    const r = e.currentTarget.getBoundingClientRect();
    a.currentTime = ((e.clientX - r.left) / r.width) * duration;
  };

  const seekToLine = (startSec: number) => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = startSec;
    a.play().catch(() => {});
    setPlaying(true);
  };

  const fmt = (s: number) =>
    `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  // ── Annotations lookup by line_index ───────────────────────────
  const annotationsByLine = useMemo(() => {
    const m = new Map<number, typeof annotations[number]>();
    for (const a of annotations) m.set(a.line_index, a);
    return m;
  }, [annotations]);

  // ── Save annotation (uses the hook) ────────────────────────────
  const saveAnnotation = async (lineIdx: number) => {
    if (!currentCall || !annotationText.trim()) return;
    const line =
      transcriptState.status === "completed"
        ? transcriptState.lines[lineIdx]
        : undefined;
    if (!line) return;

    const dbType = ANNOTATION_TYPES.find((t) => t.value === annotationTypeUi)?.dbValue ?? "comment";

    const result = await createAnnotation({
      callId: currentCall.id,
      lineIndex: lineIdx,
      speaker: line.speaker,
      transcriptLine: line.text,
      annotationType: dbType,
      title: annotationText.trim(),
      priority: "medium",
    });

    if (result) {
      setAnnotatingLine(null);
      setAnnotationText("");
    }
  };

  // ── Render: loading state for the list ─────────────────────────
  if (listLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-zinc-500">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading calls…
      </div>
    );
  }

  // ── Render: empty list ─────────────────────────────────────────
  if (!currentCall) {
    return (
      <div className="flex flex-col h-full -mx-6">
        <div className="flex items-center gap-6 px-6 py-3 border-b border-zinc-800 bg-zinc-900/50 flex-wrap">
          <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer">
            <div
              onClick={() => setIncludePrevious(!includePrevious)}
              className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer ${
                includePrevious ? "bg-indigo-600" : "bg-zinc-700"
              }`}
            >
              <div
                className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                  includePrevious ? "translate-x-4" : ""
                }`}
              />
            </div>
            Include Previously Annotated
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-400">
            Min Duration (sec):
            <input
              type="number"
              value={minDuration}
              onChange={(e) => setMinDuration(Number(e.target.value))}
              className="w-16 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-indigo-500"
            />
          </label>
        </div>
        <div className="flex items-center justify-center py-20 text-zinc-600 text-sm">
          No AI agent calls yet. Run a campaign to start annotating.
        </div>
      </div>
    );
  }

  // ── Derived values used in render ──────────────────────────────
  const isCompleted = transcriptState.status === "completed";
  const lines = isCompleted ? transcriptState.lines : [];
  const annotatedCount = annotations.length;
  const annotatedPct = lines.length > 0 ? (annotatedCount / lines.length) * 100 : 0;

  return (
    <div className="flex flex-col h-full -mx-6">
      {/* Top bar */}
      <div className="flex items-center gap-6 px-6 py-3 border-b border-zinc-800 bg-zinc-900/50 flex-wrap">
        <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer">
          <div
            onClick={() => setIncludePrevious(!includePrevious)}
            className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer ${
              includePrevious ? "bg-indigo-600" : "bg-zinc-700"
            }`}
          >
            <div
              className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                includePrevious ? "translate-x-4" : ""
              }`}
            />
          </div>
          Include Previously Annotated
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-400">
          Min Duration (sec):
          <input
            type="number"
            value={minDuration}
            onChange={(e) => setMinDuration(Number(e.target.value))}
            className="w-16 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-indigo-500"
          />
        </label>
        <div className="ml-auto flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-zinc-400">
            Jump to call:
            <input
              value={jumpTo}
              onChange={(e) => setJumpTo(e.target.value)}
              placeholder="Call ID or Phone Number"
              className="w-48 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-indigo-500"
            />
          </label>
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <span>Progress:</span>
            <div className="w-32 h-2 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-600 rounded-full"
                style={{
                  width: `${calls.length > 0 ? ((currentIndex + 1) / calls.length) * 100 : 0}%`,
                }}
              />
            </div>
            <span className="font-mono text-xs">
              {currentIndex + 1} / {calls.length}
            </span>
          </div>
        </div>
      </div>

      {/* Main two-column body */}
      <div className="flex flex-1 min-h-0">
        {/* LEFT: transcript + audio */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-0">
          <h2 className="text-base font-semibold text-white mb-4">Call Transcript</h2>

          {/* Audio player */}
          {recordingUrlState.status === "ready" ? (
            <div className="mb-5">
              <audio
                ref={audioRef}
                src={recordingUrlState.signedUrl}
                preload="metadata"
              />
              <div className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
                <button
                  onClick={togglePlay}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-zinc-800 hover:bg-indigo-600 transition-colors flex-shrink-0"
                >
                  {playing ? (
                    <Pause className="h-3.5 w-3.5 text-white" />
                  ) : (
                    <Play className="h-3.5 w-3.5 text-white ml-0.5" />
                  )}
                </button>
                <span className="text-xs font-mono text-zinc-500 w-12">{fmt(currentTime)}</span>
                <div
                  className="flex-1 h-1 bg-zinc-700 rounded-full cursor-pointer"
                  onClick={seekBar}
                >
                  <div
                    className="h-full bg-indigo-500 rounded-full"
                    style={{ width: duration ? `${(currentTime / duration) * 100}%` : "0%" }}
                  />
                </div>
                <span className="text-xs font-mono text-zinc-500 w-12 text-right">{fmt(duration)}</span>
                <Volume2 className="h-4 w-4 text-zinc-500" />
                <Settings className="h-4 w-4 text-zinc-500" />
              </div>
            </div>
          ) : recordingUrlState.status === "loading" ? (
            <p className="mb-5 text-xs text-zinc-500">Loading recording…</p>
          ) : recordingUrlState.status === "error" ? (
            <p className="mb-5 text-xs text-amber-500">
              Recording unavailable: {recordingUrlState.error}
            </p>
          ) : null}

          {/* Transcript lines */}
          <div className="space-y-0">
            {transcriptState.status === "idle" ? (
              <p className="text-sm text-zinc-600 italic">
                No transcript for this call.
              </p>
            ) : transcriptState.status === "pending" ||
              transcriptState.status === "processing" ? (
              <div className="flex items-center gap-2 text-sm text-zinc-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Transcript is being generated…
              </div>
            ) : transcriptState.status === "failed" ? (
              <p className="text-sm text-amber-500">
                Transcript failed to generate
                {transcriptState.message ? ` — ${transcriptState.message}` : ""}.
              </p>
            ) : lines.length === 0 ? (
              <p className="text-sm text-zinc-600 italic">Transcript is empty.</p>
            ) : (
              lines.map((line) => {
                const existingAnnotation = annotationsByLine.get(line.index);
                const isAnnotating = annotatingLine === line.index;
                return (
                  <div key={line.index} className="group">
                    <div
                      className={`flex gap-3 py-2 px-2 rounded-lg transition-colors ${
                        isAnnotating ? "bg-zinc-900" : "hover:bg-zinc-900/50"
                      }`}
                    >
                      <button
                        onClick={() => seekToLine(line.startSec)}
                        className="text-xs font-mono text-zinc-600 hover:text-indigo-400 w-10 flex-shrink-0 mt-0.5 text-left"
                        title="Jump to this moment"
                      >
                        {fmt(line.startSec)}
                      </button>
                      <p className="flex-1 text-sm text-zinc-300 leading-relaxed">
                        <span className="font-medium mr-1 text-indigo-400">
                          {line.speaker}:
                        </span>
                        {line.text}
                      </p>
                      <button
                        onClick={() => {
                          setAnnotatingLine(isAnnotating ? null : line.index);
                          setAnnotationText("");
                          setAnnotationTypeUi("BAD");
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded text-zinc-600 hover:text-indigo-400 hover:bg-indigo-500/10 transition-all flex-shrink-0"
                      >
                        <Flag className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {existingAnnotation && (
                      <div
                        className={`mx-12 mb-2 rounded-lg border p-3 text-sm ${
                          ANNOTATION_TYPES.find(
                            (t) =>
                              t.value ===
                              dbToUiAnnotationType(existingAnnotation.annotation_type),
                          )?.color ?? "bg-zinc-800 border-zinc-700 text-zinc-400"
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <Flag className="h-3.5 w-3.5" />
                          <span className="font-medium">
                            {ANNOTATION_TYPES.find(
                              (t) =>
                                t.value ===
                                dbToUiAnnotationType(existingAnnotation.annotation_type),
                            )?.label ?? existingAnnotation.annotation_type}
                          </span>
                          <span className="text-zinc-500 text-xs">
                            Line {existingAnnotation.line_index + 1}
                          </span>
                        </div>
                        <p className="text-xs opacity-80">
                          {existingAnnotation.title ?? ""}
                        </p>
                        <div className="mt-2 flex items-center justify-end">
                          <ConvertAnnotationToEvalButton
                            annotationId={existingAnnotation.id}
                            agentId={agentId}
                            transcriptLine={existingAnnotation.transcript_line}
                            annotationTitle={existingAnnotation.title}
                            promptCorrection={existingAnnotation.prompt_correction}
                            alreadyConverted={!!convertedMap[existingAnnotation.id]}
                            onConverted={(evalId) =>
                              setConvertedMap((m) => ({
                                ...m,
                                [existingAnnotation.id]: evalId,
                              }))
                            }
                          />
                        </div>
                      </div>
                    )}

                    {isAnnotating && (
                      <div className="mx-12 mb-20 bg-zinc-900 border border-zinc-700 rounded-xl p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-medium text-zinc-300">
                            Add annotation for line {line.index + 1}
                          </p>
                          <button
                            onClick={() => setAnnotatingLine(null)}
                            className="text-zinc-600 hover:text-white"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="flex gap-2">
                          {ANNOTATION_TYPES.map((t) => (
                            <button
                              key={t.value}
                              onClick={() =>
                                setAnnotationTypeUi(t.value as "BAD" | "GOOD" | "COMMENT")
                              }
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                                annotationTypeUi === t.value
                                  ? t.color
                                  : "border-zinc-700 text-zinc-500 hover:border-zinc-600"
                              }`}
                            >
                              {t.value}
                            </button>
                          ))}
                        </div>
                        <input
                          value={annotationText}
                          onChange={(e) => setAnnotationText(e.target.value)}
                          placeholder="Describe what went wrong or right..."
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => saveAnnotation(line.index)}
                            className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setAnnotatingLine(null)}
                            className="px-4 py-2 border border-zinc-700 text-zinc-400 text-sm rounded-lg hover:border-zinc-600 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT: Call Details */}
        <div className="w-72 flex-shrink-0 border-l border-zinc-800 flex flex-col">
          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            <div>
              <p className="text-sm font-semibold text-white mb-3">Call Details</p>
              <div className="space-y-1.5 text-xs">
                <div className="flex gap-2">
                  <span className="text-zinc-500 w-16">ID:</span>
                  <span className="text-zinc-300 font-mono truncate">{currentCall.displayId}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-zinc-500 w-16">Number:</span>
                  <span className="text-zinc-300">{currentCall.phone}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-zinc-500 w-16">Date:</span>
                  <span className="text-zinc-300">{currentCall.date}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-zinc-500 w-16">Duration:</span>
                  <span className="text-zinc-300">{currentCall.durationLabel}</span>
                </div>
              </div>
            </div>

            {/* Transcript source chip — per product decision */}
            <div>
              <p className="text-xs font-medium text-zinc-400 mb-2">Transcript source</p>
              {transcriptState.status === "completed" ? (
                <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-400">
                  Audio ({transcriptState.model}) ·{" "}
                  {(transcriptState.overallConfidence * 100).toFixed(1)}%
                </div>
              ) : transcriptState.status === "pending" ||
                transcriptState.status === "processing" ? (
                <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-400">
                  <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  Processing
                </div>
              ) : transcriptState.status === "failed" ? (
                <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-[11px] text-red-400">
                  Failed
                </div>
              ) : (
                <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-zinc-800 border border-zinc-700 text-[11px] text-zinc-500">
                  None
                </div>
              )}
            </div>

            <div>
              <button className="w-full flex items-center justify-between text-xs font-medium text-zinc-400 hover:text-white py-1">
                <span>Instructions</span>
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-zinc-400">Evals</p>
                <span className="text-[10px] text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full">
                  {annotationsLoading ? "…" : `${annotatedCount}/${lines.length} evals created`}
                </span>
              </div>
              <div className="h-1 bg-zinc-800 rounded-full overflow-hidden mb-3">
                <div
                  className="h-full bg-indigo-500 rounded-full"
                  style={{ width: `${annotatedPct}%` }}
                />
              </div>
              {annotations.map((a) => (
                <div
                  key={a.id}
                  className="mb-2 p-2 bg-zinc-900 border border-zinc-800 rounded-lg"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-zinc-300">Line {a.line_index + 1}</span>
                    <button className="text-[10px] text-indigo-400 hover:text-indigo-300">Edit</button>
                  </div>
                  <p className="text-[11px] text-zinc-500 leading-relaxed">{a.title ?? ""}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-zinc-800 p-4 flex gap-2">
            <button className="flex-1 py-2 border border-zinc-700 rounded-lg text-sm text-zinc-400 hover:border-zinc-600 hover:text-white transition-colors">
              Finish Later
            </button>
            <button
              onClick={() => {
                if (!isLastCall) setCurrentIndex(currentIndex + 1);
              }}
              disabled={isLastCall}
              className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors disabled:bg-zinc-700 disabled:text-zinc-500 disabled:cursor-not-allowed"
            >
              {isLastCall ? "No more calls" : "Next Call"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
