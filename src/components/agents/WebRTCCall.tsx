"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Mic, MicOff, Volume2, VolumeX, PhoneOff, Phone, Loader2, Wifi } from "lucide-react";
import { cn } from "@/lib/utils";
import { AudioWaveform } from "./AudioWaveform";
import { CallAnalysis, type AnalysisData } from "./CallAnalysis";

interface TranscriptEntry {
  role: "user" | "agent";
  text: string;
  timestamp: Date;
}

interface Props {
  agentId: string;
  agentName: string;
  systemPrompt: string;
  voiceId?: string;
}

/**
 * WebRTCCall — Browser-based voice call using LiveKit WebRTC.
 *
 * Flow:
 *  1. POST /api/webrtc/create-call → { serverUrl, accessToken, roomName }
 *  2. Connect to LiveKit room, publish mic audio
 *  3. Subscribe to agent audio track (auto-plays)
 *  4. Receive transcript via DataChannel
 *  5. On disconnect → post-call analysis
 */
export function WebRTCCall({ agentId, agentName, systemPrompt, voiceId }: Props) {
  const [callActive, setCallActive] = useState(false);
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [callDuration, setCallDuration] = useState(0);
  const [status, setStatus] = useState<
    "idle" | "connecting" | "waiting_agent" | "connected" | "disconnected"
  >("idle");
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [error, setError] = useState("");
  const [connectionQuality, setConnectionQuality] = useState<string>("");
  const [retryCount, setRetryCount] = useState(0);

  // Refs
  const roomRef = useRef<import("livekit-client").Room | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const agentAudioElements = useRef<HTMLAudioElement[]>([]);
  const callIdRef = useRef<string>("");

  // Auto-scroll transcript
  useEffect(() => {
    transcriptRef.current?.scrollTo({
      top: transcriptRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [transcript]);

  // Duration timer
  useEffect(() => {
    if (callActive && status === "connected") {
      timerRef.current = setInterval(() => setCallDuration((d) => d + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [callActive, status]);

  const formatDuration = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const startCall = useCallback(async () => {
    setError("");
    setStatus("connecting");
    setTranscript([]);
    setCallDuration(0);
    setAnalysis(null);

    try {
      // 1. Bootstrap call via API
      const res = await fetch("/api/webrtc/create-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, testMode: true }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || "Failed to create call");
      }

      const { serverUrl, accessToken, callId, roomName } = await res.json();
      callIdRef.current = callId;

      // 2. Dynamically import livekit-client (avoid SSR issues)
      const {
        Room,
        RoomEvent,
        Track,
        ConnectionState,
        createLocalAudioTrack,
      } = await import("livekit-client");

      // 3. Create room
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        // Force v0 signaling path — LiveKit Cloud returns 400 on /rtc/v1
        // which prevents the SDK from falling back to v0 automatically.
        // singlePeerConnection: false uses separate publisher/subscriber
        // PeerConnections (v0 protocol) which LiveKit Cloud fully supports.
        singlePeerConnection: false,
        audioCaptureDefaults: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      roomRef.current = room;

      // 4. Event handlers

      // Track subscribed — attach agent audio
      room.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === Track.Kind.Audio) {
          const el = track.attach();
          el.style.display = "none";
          document.body.appendChild(el);
          agentAudioElements.current.push(el);
          setIsAgentSpeaking(true);
        }
      });

      // Track unsubscribed — cleanup
      room.on(RoomEvent.TrackUnsubscribed, (track) => {
        if (track.kind === Track.Kind.Audio) {
          track.detach().forEach((el) => {
            el.remove();
            const idx = agentAudioElements.current.indexOf(el);
            if (idx >= 0) agentAudioElements.current.splice(idx, 1);
          });
          setIsAgentSpeaking(false);
        }
      });

      // Data channel — transcript updates from agent worker
      room.on(RoomEvent.DataReceived, (payload: Uint8Array) => {
        try {
          const msg = JSON.parse(new TextDecoder().decode(payload));
          if (msg.type === "transcript" && msg.text) {
            setTranscript((prev) => [
              ...prev,
              {
                role: msg.role === "user" ? "user" : "agent",
                text: msg.text,
                timestamp: new Date(),
              },
            ]);
            if (msg.role === "assistant" || msg.role === "agent") {
              setIsAgentSpeaking(true);
              // Reset after a short delay
              setTimeout(() => setIsAgentSpeaking(false), 500);
            }
          }
        } catch {
          // Ignore malformed data
        }
      });

      // Participant joined — agent worker connected
      room.on(RoomEvent.ParticipantConnected, (participant) => {
        if (participant.identity.startsWith("agent_")) {
          setStatus("connected");
        }
      });

      // Disconnected
      room.on(RoomEvent.Disconnected, () => {
        setStatus("disconnected");
        setCallActive(false);
        setIsAgentSpeaking(false);
      });

      // Connection quality
      room.on(RoomEvent.ConnectionQualityChanged, (_quality, participant) => {
        if (participant.isLocal) {
          const q = _quality as unknown as number;
          setConnectionQuality(
            q >= 3 ? "Excellent" : q === 2 ? "Good" : q === 1 ? "Poor" : ""
          );
        }
      });

      // 5. Connect to LiveKit room
      await room.connect(serverUrl, accessToken);
      setCallActive(true);
      setStatus("waiting_agent");

      // 6. Publish local mic
      const micTrack = await createLocalAudioTrack({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      });
      await room.localParticipant.publishTrack(micTrack);

      // 7. Wait for agent to join (timeout after 15s)
      const agentTimeout = setTimeout(() => {
        if (status === "waiting_agent") {
          setStatus("connected"); // Proceed anyway, agent might join late
        }
      }, 15000);

      // Check if agent is already in the room
      const remoteParticipants = Array.from(room.remoteParticipants.values());
      if (remoteParticipants.some((p) => p.identity.startsWith("agent_"))) {
        setStatus("connected");
        clearTimeout(agentTimeout);
      }

      // Cleanup timeout on unmount
      return () => clearTimeout(agentTimeout);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[WebRTCCall] startCall error:", err);

      if (message.includes("NotAllowedError") || message.includes("Permission")) {
        setError("Microphone access denied. Please allow mic access and try again.");
      } else {
        setError(`Failed to connect: ${message}`);
      }
      setStatus("idle");
      setCallActive(false);
    }
  }, [agentId]);

  const endCall = useCallback(async () => {
    // Disconnect from LiveKit room
    if (roomRef.current) {
      roomRef.current.disconnect();
      roomRef.current = null;
    }

    // Cleanup audio elements
    agentAudioElements.current.forEach((el) => el.remove());
    agentAudioElements.current = [];

    setCallActive(false);
    setIsAgentSpeaking(false);
    setStatus("idle");

    // Generate analysis
    if (transcript.length > 0) {
      try {
        const fullText = transcript
          .map((t) => `${t.role === "agent" ? "Agent" : "Customer"}: ${t.text}`)
          .join("\n");

        const res = await fetch("/api/agents/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemPrompt: `You are analyzing an AI agent voice test call. Return ONLY valid JSON (no markdown): {"score":1-10,"summary":"string","strengths":["..."],"improvements":["..."],"goal_achieved":true/false,"goal_label":"string"}`,
            agentName: "Analyzer",
            messages: [
              {
                role: "user",
                content: `Agent's configured purpose: "${systemPrompt?.slice(0, 200)}"\n\nTRANSCRIPT:\n${fullText}\n\nAnalyze this call and return JSON.`,
              },
            ],
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const text = data.reply || "{}";
          const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
          const parsed = JSON.parse(cleaned);
          setAnalysis({
            ...parsed,
            turns: transcript.length,
            duration: formatDuration(callDuration),
            agent_talk_ratio: Math.round(
              (transcript.filter((t) => t.role === "agent").length / transcript.length) * 100
            ),
          });
        }
      } catch {
        // Skip analysis on failure
      }
    }
  }, [transcript, callDuration, systemPrompt, formatDuration]);

  const toggleMute = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;

    room.localParticipant.audioTrackPublications.forEach((pub) => {
      if (pub.track) {
        if (isMicMuted) {
          pub.track.unmute();
        } else {
          pub.track.mute();
        }
      }
    });
    setIsMicMuted(!isMicMuted);
  }, [isMicMuted]);

  const toggleSpeaker = useCallback(() => {
    agentAudioElements.current.forEach((el) => {
      el.muted = !isSpeakerMuted;
    });
    setIsSpeakerMuted(!isSpeakerMuted);
  }, [isSpeakerMuted]);

  const statusLabel = {
    idle: "",
    connecting: "Connecting to LiveKit…",
    waiting_agent: "Waiting for AI agent…",
    connected: "Connected",
    disconnected: "Call ended",
  }[status];

  const statusColor = {
    idle: "text-zinc-500",
    connecting: "text-amber-400",
    waiting_agent: "text-amber-400",
    connected: "text-emerald-400",
    disconnected: "text-zinc-500",
  }[status];

  return (
    <div className="space-y-4">
      {/* Call Display */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden">
        {/* Agent Avatar + Status */}
        <div className="flex flex-col items-center gap-3 px-6 py-6 border-b border-zinc-800">
          <div
            className={cn(
              "relative flex h-20 w-20 items-center justify-center rounded-full text-3xl font-bold transition-all",
              isAgentSpeaking
                ? "ring-4 ring-cyan-500/50 bg-cyan-600/20 text-white"
                : status === "connected"
                ? "ring-4 ring-emerald-500/50 bg-emerald-600/20 text-white"
                : "bg-zinc-800 text-zinc-400"
            )}
          >
            {agentName[0]?.toUpperCase() || "A"}
            {callActive && (
              <span
                className={cn(
                  "absolute bottom-1 right-1 h-3 w-3 rounded-full border-2 border-zinc-950",
                  isAgentSpeaking
                    ? "bg-cyan-500 animate-pulse"
                    : status === "connected"
                    ? "bg-emerald-500 animate-pulse"
                    : "bg-amber-500 animate-pulse"
                )}
              />
            )}
          </div>

          <div className="text-center">
            <p className="text-sm font-semibold text-white">{agentName}</p>
            {callActive && (
              <p className="text-xs text-zinc-500 mt-0.5">
                ⏱ {formatDuration(callDuration)}
              </p>
            )}
            {statusLabel && (
              <div className="flex items-center justify-center gap-1.5 mt-1">
                {(status === "connecting" || status === "waiting_agent") && (
                  <Loader2 className="h-3 w-3 animate-spin text-amber-400" />
                )}
                {status === "connected" && (
                  <Wifi className="h-3 w-3 text-emerald-400" />
                )}
                <p className={cn("text-xs font-medium", statusColor)}>
                  {statusLabel}
                </p>
              </div>
            )}
            {connectionQuality && status === "connected" && (
              <p className="text-[10px] text-zinc-600 mt-0.5">
                Signal: {connectionQuality}
              </p>
            )}
          </div>

          {/* WebRTC badge */}
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-cyan-950/40 border border-cyan-800/30">
            <Wifi className="h-3 w-3 text-cyan-400" />
            <span className="text-[10px] text-cyan-400 font-medium">WebRTC</span>
          </div>
        </div>

        {/* Transcript */}
        <div ref={transcriptRef} className="h-52 overflow-y-auto p-4 space-y-3">
          {transcript.length === 0 && !callActive && (
            <div className="flex h-full items-center justify-center text-zinc-600 text-xs text-center">
              Start a WebRTC test call to see the live transcript here
            </div>
          )}
          {transcript.length === 0 && callActive && status === "waiting_agent" && (
            <div className="flex h-full items-center justify-center text-zinc-600 text-xs text-center">
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin text-amber-400" />
                <span>Waiting for AI agent to join the room…</span>
              </div>
            </div>
          )}
          {transcript.map((t, i) => (
            <div
              key={i}
              className={cn(
                "flex gap-2",
                t.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              {t.role === "agent" && (
                <div className="h-6 w-6 rounded-full bg-cyan-600/20 border border-cyan-500/20 flex items-center justify-center text-xs text-cyan-400 shrink-0 mt-0.5">
                  {agentName[0]}
                </div>
              )}
              <div
                className={cn(
                  "max-w-[80%] rounded-xl px-3 py-2 text-xs leading-relaxed",
                  t.role === "agent"
                    ? "bg-zinc-800 text-zinc-200 rounded-tl-sm"
                    : "bg-cyan-600 text-white rounded-tr-sm"
                )}
              >
                {t.text}
              </div>
              {t.role === "user" && (
                <div className="h-6 w-6 rounded-full bg-zinc-700 flex items-center justify-center text-xs text-zinc-300 shrink-0 mt-0.5">
                  You
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Controls */}
        <div className="border-t border-zinc-800 px-4 py-4">
          {error && (
            <p className="text-xs text-red-400 text-center mb-3 bg-red-950/30 border border-red-900/40 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {!callActive ? (
            <button
              onClick={startCall}
              disabled={status === "connecting"}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-cyan-600 py-3 text-sm font-semibold text-white hover:bg-cyan-500 disabled:opacity-60 transition-colors"
            >
              {status === "connecting" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Wifi className="h-4 w-4" />
                  <Phone className="h-4 w-4" />
                </>
              )}
              {status === "connecting"
                ? "Connecting…"
                : "Start WebRTC Call"}
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <button
                onClick={toggleMute}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-medium transition-colors",
                  isMicMuted
                    ? "border-red-500/40 bg-red-950/20 text-red-400"
                    : "border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-white"
                )}
              >
                {isMicMuted ? (
                  <MicOff className="h-4 w-4" />
                ) : (
                  <Mic className="h-4 w-4" />
                )}
                {isMicMuted ? "Unmute" : "Mute"}
              </button>
              <button
                onClick={toggleSpeaker}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-medium transition-colors",
                  isSpeakerMuted
                    ? "border-amber-500/40 bg-amber-950/20 text-amber-400"
                    : "border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-white"
                )}
              >
                {isSpeakerMuted ? (
                  <VolumeX className="h-4 w-4" />
                ) : (
                  <Volume2 className="h-4 w-4" />
                )}
                {isSpeakerMuted ? "Unmute" : "Speaker"}
              </button>
              <button
                onClick={endCall}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-500 transition-colors"
              >
                <PhoneOff className="h-4 w-4" />
                End Call
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Post-call analysis */}
      {analysis && (
        <CallAnalysis
          analysis={analysis}
          agentId={agentId}
          systemPrompt={systemPrompt}
          onTestAgain={() => {
            setAnalysis(null);
            setTranscript([]);
          }}
        />
      )}
    </div>
  );
}
