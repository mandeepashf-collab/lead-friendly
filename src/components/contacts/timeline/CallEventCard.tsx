"use client";

/**
 * CallEventCard — Phase 3c
 *
 * Direct port of the inline CallActivityCard / InlineAudioPlayer /
 * TranscriptSection that previously lived in /people/[id]/page.tsx.
 * Same behavior, same UX, just lifted into its own file so the
 * unified ActivityTimeline can render it alongside other event types.
 *
 * Audio + transcript are mount-gated: the InlineAudioPlayer only
 * mounts when the parent card is expanded, so each useRecordingUrl
 * fetch fires at most once per expansion (saves N requests when
 * scrolling a long activity feed).
 */

import { useState, useRef, useEffect } from "react";
import {
  ChevronDown, Bot, Phone, Volume2, FileText, Play, MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRecordingUrl } from "@/hooks/use-recording-url";
import { useCallTranscript } from "@/hooks/useCallTranscript";
import type { Call } from "@/types/database";

// ── Inline Audio Player ────────────────────────────────────────────
function InlineAudioPlayer({
  callId,
  storedUrl,
  duration,
}: {
  callId: string;
  storedUrl: string | null;
  duration: number;
}) {
  const recordingUrlState = useRecordingUrl({ callId, storedUrl });
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [dur, setDur] = useState(duration || 0);
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.ontimeupdate = () => setCurrent(a.currentTime);
    a.onloadedmetadata = () => setDur(a.duration);
    a.onended = () => setPlaying(false);
  }, [recordingUrlState.status]);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else { a.play(); setPlaying(true); }
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = audioRef.current;
    if (!a || !dur) return;
    const rect = e.currentTarget.getBoundingClientRect();
    a.currentTime = ((e.clientX - rect.left) / rect.width) * dur;
  };

  const cycleSpeed = () => {
    const speeds = [1, 1.25, 1.5, 2, 0.75];
    const next = speeds[(speeds.indexOf(speed) + 1) % speeds.length];
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  const fmt = (s: number) => `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;

  if (recordingUrlState.status === "loading") {
    return <p className="text-xs text-zinc-500">Loading recording…</p>;
  }
  if (recordingUrlState.status === "error") {
    return (
      <p className="text-xs text-amber-500">
        Recording unavailable: {recordingUrlState.error}
      </p>
    );
  }
  if (recordingUrlState.status !== "ready") {
    return <p className="text-xs text-zinc-500">No recording available.</p>;
  }

  const signedUrl = recordingUrlState.signedUrl;

  return (
    <div>
      <audio ref={audioRef} src={signedUrl} preload="none" />
      <div className="flex items-center gap-3">
        <button onClick={toggle}
          className="w-8 h-8 rounded-full bg-zinc-800 hover:bg-indigo-600 flex items-center justify-center flex-shrink-0 transition-colors">
          {playing
            ? <Volume2 size={13} className="text-white" />
            : <Play size={13} className="text-white ml-0.5" />}
        </button>
        <div className="flex-1 space-y-1">
          <div className="relative h-1 bg-zinc-800 rounded-full cursor-pointer" onClick={seek}>
            <div className="absolute inset-y-0 left-0 bg-indigo-500 rounded-full"
              style={{ width: dur ? `${(current/dur)*100}%` : '0%' }} />
          </div>
          <div className="flex justify-between text-[10px] font-mono text-zinc-600">
            <span>{fmt(current)}</span><span>{fmt(dur)}</span>
          </div>
        </div>
        <button onClick={cycleSpeed}
          className="text-[10px] font-mono text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded w-7 text-center hover:text-white">
          {speed}×
        </button>
        <a href={signedUrl} download className="p-1.5 text-zinc-600 hover:text-zinc-400 transition-colors">
          <FileText size={12} />
        </a>
      </div>
    </div>
  );
}

// ── Transcript section (Deepgram, via call_transcripts) ───────────
function TranscriptSection({ callId }: { callId: string }) {
  const { state } = useCallTranscript(callId);

  if (state.status === "idle") return null;

  return (
    <div>
      <p className="text-xs font-medium text-zinc-500 mb-1.5 flex items-center gap-1.5">
        <MessageSquare size={11} /> Transcript
      </p>
      <div className="bg-zinc-800 rounded-lg px-3 py-2 max-h-48 overflow-y-auto">
        {state.status === "pending" || state.status === "processing" ? (
          <p className="text-xs text-zinc-500 italic">
            Transcript is being generated...
          </p>
        ) : state.status === "failed" ? (
          <p className="text-xs text-amber-500">
            Transcript failed to generate
            {state.message ? ` — ${state.message}` : ""}
          </p>
        ) : state.lines.length === 0 ? (
          <p className="text-xs text-zinc-500 italic">
            Transcript is empty
          </p>
        ) : (
          <div className="space-y-1.5">
            {state.lines.map((line) => {
              const isFirstSpeaker = line.speaker.endsWith("0");
              return (
                <div
                  key={line.index}
                  className={`flex gap-2 ${isFirstSpeaker ? "" : "flex-row-reverse"}`}
                >
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 mt-0.5 ${
                      isFirstSpeaker
                        ? "bg-indigo-500/10 text-indigo-400"
                        : "bg-zinc-700 text-zinc-400"
                    }`}
                  >
                    {line.speaker}
                  </span>
                  <p
                    className={`text-xs leading-relaxed px-2.5 py-1.5 rounded-lg max-w-[80%] ${
                      isFirstSpeaker
                        ? "bg-indigo-500/10 text-indigo-100"
                        : "bg-zinc-700 text-zinc-300"
                    }`}
                  >
                    {line.text}
                  </p>
                </div>
              );
            })}
          </div>
        )}
        {state.status === "completed" && state.lines.length > 0 && (
          <p className="text-[10px] text-zinc-600 mt-2">
            {state.model} · {(state.overallConfidence * 100).toFixed(1)}% confidence · {state.lines.length} lines
          </p>
        )}
      </div>
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────
interface Props {
  call: Call;
}

export function CallEventCard({ call }: Props) {
  const [expanded, setExpanded] = useState(false);

  function fmtDur(secs: number) {
    if (!secs) return "0:00";
    return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  }

  const isAI = !!call.ai_agent_id;
  // A call has expandable content if it has any of:
  //   - a recording (URL column)
  //   - a legacy text transcript (calls.transcript, pre-Deepgram)
  //   - a new-pipeline transcript (calls.transcript_status)
  //   - a summary
  const hasExtra = Boolean(
    call.recording_url ||
    call.transcript ||
    (call as unknown as { transcript_status?: string | null }).transcript_status ||
    call.call_summary
  );

  const statusColor: Record<string, string> = {
    completed: "text-emerald-400", initiated: "text-zinc-500",
    failed: "text-red-400", "no-answer": "text-amber-400",
  };

  const sentimentStyle: Record<string, string> = {
    positive: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    negative: "bg-red-500/10 text-red-400 border-red-500/20",
    neutral: "bg-zinc-700 text-zinc-400 border-zinc-600",
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden hover:border-zinc-700 transition-colors">
      <div className={cn("flex items-center justify-between px-4 py-3", hasExtra && "cursor-pointer")}
        onClick={() => hasExtra && setExpanded(!expanded)}>
        <div className="flex items-center gap-3">
          <div className={cn("w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
            isAI ? "bg-indigo-500/10 border border-indigo-500/20" : "bg-blue-500/10 border border-blue-500/20")}>
            {isAI ? <Bot size={13} className="text-indigo-400" /> : <Phone size={13} className="text-blue-400" />}
          </div>
          <div>
            <p className="text-sm font-medium text-white">
              {isAI ? "AI Call" : "Manual Call"} · <span className="capitalize text-zinc-400">{call.direction}</span>
            </p>
            <p className="text-xs text-zinc-500">
              {new Date(call.created_at).toLocaleString()} · {fmtDur(call.duration_seconds)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {call.sentiment && (
            <span className={cn("text-xs px-2 py-0.5 rounded-full border", sentimentStyle[call.sentiment] || sentimentStyle.neutral)}>
              {call.sentiment}
            </span>
          )}
          <span className={cn("text-xs font-medium", statusColor[call.status] || "text-zinc-500")}>
            {call.status}
          </span>
          {hasExtra && (
            <ChevronDown size={14} className={cn("text-zinc-600 transition-transform", expanded && "rotate-180")} />
          )}
        </div>
      </div>

      {expanded && hasExtra && (
        <div className="border-t border-zinc-800 px-4 py-4 space-y-4">
          <InlineAudioPlayer
            callId={call.id}
            storedUrl={call.recording_url}
            duration={call.duration_seconds}
          />

          {call.call_summary && (
            <div>
              <p className="text-xs font-medium text-zinc-500 mb-1.5 flex items-center gap-1.5">
                <FileText size={11} /> Summary
              </p>
              <p className="text-sm text-zinc-300 leading-relaxed bg-zinc-800 rounded-lg px-3 py-2">
                {call.call_summary}
              </p>
            </div>
          )}
          <TranscriptSection callId={call.id} />
        </div>
      )}
    </div>
  );
}
