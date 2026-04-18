"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Bot,
  Clock,
  Copy,
  Check,
  Download,
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  RefreshCw,
  User,
  Wifi,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useCall } from "@/hooks/use-calls";

// Shape of a row in the call_turns table (see migrations / voice/answer route).
interface CallTurn {
  id: string;
  call_id: string;
  organization_id: string;
  ordinal: number;
  role: "user" | "agent" | string;
  state_name: string | null;
  content: string;
  created_at?: string | null;
}

function formatDuration(s: number) {
  if (!s || s < 0) return "0:00";
  const mins = Math.floor(s / 60);
  const secs = Math.floor(s % 60);
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    completed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    answered: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    missed: "bg-red-500/10 text-red-400 border-red-500/20",
    voicemail: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    busy: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
    failed: "bg-red-500/10 text-red-400 border-red-500/20",
    "no-answer": "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize",
        map[status] || "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
      )}
    >
      {status.replace(/-/g, " ")}
    </span>
  );
}

function SentimentBadge({ sentiment }: { sentiment: string | null }) {
  if (!sentiment) return <span className="text-zinc-600 text-sm">—</span>;
  const map: Record<string, string> = {
    positive: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    neutral: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    negative: "bg-red-500/10 text-red-400 border-red-500/20",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize",
        map[sentiment] || map.neutral,
      )}
    >
      {sentiment}
    </span>
  );
}

/**
 * Distribute turns evenly across the call's duration so we can highlight
 * the "currently playing" turn as the audio progresses. Telnyx recordings
 * don't give us per-turn timestamps out of the box, so we approximate using
 * each turn's ordinal position within the total call length.
 */
function buildTurnTimeline(turns: CallTurn[], durationSeconds: number) {
  const total = Math.max(durationSeconds || 0, turns.length); // avoid /0
  const slice = turns.length > 0 ? total / turns.length : 0;
  return turns.map((turn, i) => ({
    ...turn,
    startAt: i * slice,
    endAt: (i + 1) * slice,
  }));
}

export default function CallDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id ?? null;

  const { call, loading: callLoading } = useCall(id);

  const [turns, setTurns] = useState<CallTurn[]>([]);
  const [turnsLoading, setTurnsLoading] = useState(true);
  const [turnsError, setTurnsError] = useState<string | null>(null);

  const [currentTime, setCurrentTime] = useState(0);
  const [copied, setCopied] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const activeTurnRef = useRef<HTMLDivElement | null>(null);

  // Fetch call_turns for this call, ordered by ordinal.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setTurnsLoading(true);
    setTurnsError(null);

    const supabase = createClient();
    supabase
      .from("call_turns")
      .select("*")
      .eq("call_id", id)
      .order("ordinal", { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setTurnsError(error.message);
          setTurns([]);
        } else {
          setTurns((data as CallTurn[]) || []);
        }
        setTurnsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  const timeline = useMemo(
    () => buildTurnTimeline(turns, call?.duration_seconds ?? 0),
    [turns, call?.duration_seconds],
  );

  const activeIndex = useMemo(() => {
    if (timeline.length === 0) return -1;
    // Find the last turn whose startAt <= currentTime.
    let idx = -1;
    for (let i = 0; i < timeline.length; i++) {
      if (timeline[i].startAt <= currentTime) idx = i;
      else break;
    }
    return idx;
  }, [timeline, currentTime]);

  // Scroll the active turn into view smoothly as playback progresses.
  useEffect(() => {
    if (activeTurnRef.current) {
      activeTurnRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [activeIndex]);

  const handleSeekToTurn = (startAt: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = startAt;
    audioRef.current.play().catch(() => {
      /* autoplay may be blocked; user can hit play manually */
    });
  };

  const handleCopyTranscript = () => {
    const text = turns.length
      ? turns
          .map((t) => `${t.role === "agent" ? "Agent" : "Caller"}: ${t.content}`)
          .join("\n")
      : call?.transcript || "";
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ────────────────────────────────────────────────────────────────
  // Loading / not-found states — match the zinc-on-dark styling used
  // on the parent calls page.
  // ────────────────────────────────────────────────────────────────
  if (callLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2 text-zinc-500">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-600 border-t-indigo-500" />
          Loading call…
        </div>
      </div>
    );
  }

  if (!call) {
    return (
      <div className="space-y-6">
        <Link
          href="/calls"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" /> Back to calls
        </Link>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-10 text-center">
          <Phone className="mx-auto h-10 w-10 text-zinc-600" />
          <p className="mt-3 text-sm font-medium text-zinc-300">Call not found</p>
          <p className="text-xs text-zinc-500">
            It may have been deleted or you may not have access to it.
          </p>
        </div>
      </div>
    );
  }

  const contactName = call.contacts
    ? [call.contacts.first_name, call.contacts.last_name]
        .filter(Boolean)
        .join(" ") || "Unknown"
    : "Unknown";

  return (
    <div className="space-y-6">
      {/* Top bar — back link + page title, mirroring the calls list header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <button
            onClick={() => router.push("/calls")}
            className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" /> Back to calls
          </button>
          <h1 className="mt-2 text-2xl font-bold text-white">{contactName}</h1>
          <p className="text-zinc-400 flex items-center gap-2 text-sm">
            {call.ai_agent_id ? (
              <Bot className="h-3.5 w-3.5 text-indigo-400" />
            ) : (
              <User className="h-3.5 w-3.5 text-emerald-400" />
            )}
            {call.ai_agent_id ? "AI-handled" : "Human-dialed"} ·{" "}
            <span className="inline-flex items-center gap-1">
              {call.direction === "inbound" ? (
                <PhoneIncoming className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <PhoneOutgoing className="h-3.5 w-3.5 text-indigo-400" />
              )}
              <span className="capitalize">{call.direction}</span>
            </span>
            · {new Date(call.created_at).toLocaleString()}
          </p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="flex h-9 shrink-0 items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-400 hover:text-white"
        >
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {/* Stat tiles — same visual language as the list-page summary tiles */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Duration
          </p>
          <p className="mt-2 text-3xl font-bold text-white">
            {formatDuration(call.duration_seconds)}
          </p>
          <p className="mt-1 text-xs text-zinc-600 flex items-center gap-1">
            <Clock className="h-3 w-3" /> Call length
          </p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Status
          </p>
          <div className="mt-2">
            <StatusBadge status={call.status} />
          </div>
          <p className="mt-1 text-xs text-zinc-600">Final disposition</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Sentiment
          </p>
          <div className="mt-2">
            <SentimentBadge sentiment={call.sentiment} />
          </div>
          <p className="mt-1 text-xs text-zinc-600">AI-inferred</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Turns
          </p>
          <p className="mt-2 text-3xl font-bold text-white">{turns.length}</p>
          <p className="mt-1 text-xs text-zinc-600">Back-and-forth</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Channel
          </p>
          <div className="mt-2">
            {(call as unknown as Record<string, unknown>).call_type === "webrtc" ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2 py-0.5 text-xs font-medium text-cyan-400">
                <Wifi className="h-3 w-3" />WebRTC
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full border border-zinc-500/20 bg-zinc-500/10 px-2 py-0.5 text-xs font-medium text-zinc-400">
                <Phone className="h-3 w-3" />Phone
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-zinc-600">Call method</p>
        </div>
      </div>

      {/* Main two-column layout: player + summary on the left, transcript right */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        {/* Left column */}
        <div className="space-y-4">
          {/* Recording / audio player */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Recording
            </h2>
            {call.recording_url ? (
              <div className="mt-3 space-y-3">
                <audio
                  ref={audioRef}
                  controls
                  preload="metadata"
                  src={call.recording_url}
                  style={{ colorScheme: "dark" }}
                  className="h-10 w-full"
                  onTimeUpdate={(e) =>
                    setCurrentTime(e.currentTarget.currentTime)
                  }
                  onSeeked={(e) =>
                    setCurrentTime(e.currentTarget.currentTime)
                  }
                />
                <div className="flex items-center justify-between text-xs text-zinc-500">
                  <span>
                    {formatDuration(currentTime)} /{" "}
                    {formatDuration(call.duration_seconds)}
                  </span>
                  <a
                    href={call.recording_url}
                    download
                    className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-xs font-medium text-zinc-300 hover:bg-zinc-700"
                  >
                    <Download className="h-3.5 w-3.5" /> Download
                  </a>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm text-zinc-500">
                No recording is available for this call.
              </p>
            )}
          </div>

          {/* Summary */}
          {call.call_summary && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Summary
              </h2>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
                {call.call_summary}
              </p>
            </div>
          )}

          {/* Metadata */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-xs text-zinc-500 space-y-1">
            <p>
              Call ID:{" "}
              <span className="font-mono text-[11px] text-zinc-600">
                {call.id}
              </span>
            </p>
            <p>
              Created:{" "}
              <span className="text-zinc-300">
                {new Date(call.created_at).toLocaleString()}
              </span>
            </p>
            {call.ai_agent_id && (
              <p>
                AI Agent:{" "}
                <span className="font-mono text-[11px] text-zinc-600">
                  {call.ai_agent_id}
                </span>
              </p>
            )}
          </div>
        </div>

        {/* Right column — synced transcript */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden flex flex-col min-h-[400px]">
          <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Transcript
            </h2>
            <button
              onClick={handleCopyTranscript}
              className="inline-flex items-center gap-1.5 rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white"
              title="Copy transcript"
            >
              {copied ? (
                <Check className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              <span className="text-xs">{copied ? "Copied" : "Copy"}</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 max-h-[32rem]">
            {turnsLoading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-zinc-500">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-600 border-t-indigo-500" />
                Loading transcript…
              </div>
            ) : turnsError ? (
              <p className="py-10 text-center text-sm text-red-400">
                Couldn&apos;t load transcript: {turnsError}
              </p>
            ) : timeline.length > 0 ? (
              <div className="space-y-2">
                {timeline.map((turn, i) => {
                  const isAgent = turn.role === "agent";
                  const isActive = i === activeIndex;
                  return (
                    <div
                      key={turn.id ?? `${turn.ordinal}-${i}`}
                      ref={isActive ? activeTurnRef : undefined}
                      className={cn(
                        "flex",
                        isAgent ? "justify-start" : "justify-end",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => handleSeekToTurn(turn.startAt)}
                        className={cn(
                          "max-w-[85%] rounded-xl border px-3 py-2 text-left text-sm transition-colors",
                          isAgent
                            ? "border-indigo-500/20 bg-indigo-500/10 text-indigo-100 hover:bg-indigo-500/20"
                            : "border-zinc-700 bg-zinc-800 text-zinc-100 hover:bg-zinc-700",
                          isActive &&
                            "ring-2 ring-indigo-400/70 ring-offset-2 ring-offset-zinc-900",
                        )}
                      >
                        <div className="flex items-center justify-between gap-3 mb-0.5">
                          <span className="text-[10px] uppercase font-semibold opacity-70">
                            {isAgent ? "Agent" : "Caller"}
                          </span>
                          <span className="text-[10px] font-mono opacity-60">
                            {formatDuration(turn.startAt)}
                          </span>
                        </div>
                        <p className="leading-relaxed whitespace-pre-wrap">
                          {turn.content}
                        </p>
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : call.transcript ? (
              // Fallback: no structured turns, render the flat transcript.
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
                {call.transcript}
              </p>
            ) : (
              <p className="py-10 text-center text-sm text-zinc-500">
                No transcript yet for this call.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
