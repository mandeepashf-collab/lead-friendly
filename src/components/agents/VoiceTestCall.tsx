"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Mic, MicOff, Volume2, VolumeX, PhoneOff, Phone, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { AudioWaveform } from "./AudioWaveform";
import { CallAnalysis, type AnalysisData } from "./CallAnalysis";

interface TranscriptEntry {
  role: "user" | "agent";
  text: string;
  timestamp: Date;
}

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

interface Props {
  agentId: string;
  agentName: string;
  systemPrompt: string;
  voiceId?: string;
}

const SILENCE_THRESHOLD = 10;    // amplitude below this = silence
const SILENCE_DURATION = 1800;   // ms of silence before we send audio
const MIN_RECORDING_MS = 500;    // minimum recording before sending

export function VoiceTestCall({ agentId, agentName, systemPrompt, voiceId }: Props) {
  const [callActive, setCallActive] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [conversationHistory, setConversationHistory] = useState<ConversationMessage[]>([]);
  const [callDuration, setCallDuration] = useState(0);
  const [status, setStatus] = useState<"idle" | "connecting" | "listening" | "processing" | "speaking">("idle");
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [error, setError] = useState("");
  const [processingTurn, setProcessingTurn] = useState(false);

  // Refs for audio handling
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordingStartRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: "smooth" });
  }, [transcript]);

  useEffect(() => {
    if (callActive) {
      timerRef.current = setInterval(() => setCallDuration((d) => d + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [callActive]);

  const formatDuration = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const stopRecording = useCallback(() => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    setIsListening(false);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const sendAudioToAPI = useCallback(async (audioBlob: Blob, history: ConversationMessage[]) => {
    if (processingTurn) return;
    setProcessingTurn(true);
    setStatus("processing");

    try {
      const arrayBuffer = await audioBlob.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString("base64");

      const res = await fetch("/api/agents/voice-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_id: agentId,
          audio_base64: base64,
          conversation_history: history,
        }),
      });

      if (!res.ok) throw new Error("API error");

      const data = await res.json();

      if (data.silence) {
        // Nothing was said — resume listening
        setStatus("listening");
        setIsListening(true);
        startListening(history);
        return;
      }

      // Show user transcript
      if (data.transcript) {
        setTranscript((prev) => [
          ...prev,
          { role: "user", text: data.transcript, timestamp: new Date() },
        ]);
      }

      const newHistory = data.conversation_history || history;
      setConversationHistory(newHistory);

      // Play agent response audio
      if (data.audio_base64 && !isSpeakerMuted) {
        setIsAgentSpeaking(true);
        setStatus("speaking");

        if (data.agent_response) {
          setTranscript((prev) => [
            ...prev,
            { role: "agent", text: data.agent_response, timestamp: new Date() },
          ]);
        }

        const audioData = Uint8Array.from(atob(data.audio_base64), (c) => c.charCodeAt(0));
        const blob = new Blob([audioData], { type: "audio/mpeg" });
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        currentAudioRef.current = audio;

        audio.onended = () => {
          URL.revokeObjectURL(url);
          setIsAgentSpeaking(false);
          setStatus("listening");
          setIsListening(true);
          startListening(newHistory);
        };

        audio.onerror = () => {
          setIsAgentSpeaking(false);
          setStatus("listening");
          setIsListening(true);
          startListening(newHistory);
        };

        audio.play().catch(() => {
          setIsAgentSpeaking(false);
          setStatus("listening");
        });
      } else {
        // No audio — show text and resume
        if (data.agent_response) {
          setTranscript((prev) => [
            ...prev,
            { role: "agent", text: data.agent_response, timestamp: new Date() },
          ]);
        }
        setStatus("listening");
        setIsListening(true);
        startListening(newHistory);
      }
    } catch (err) {
      console.error("voice-test error:", err);
      setError("Connection error. Check your mic and try again.");
      setStatus("listening");
      setIsListening(true);
    } finally {
      setProcessingTurn(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, isSpeakerMuted, processingTurn]);

  const startListening = useCallback((history: ConversationMessage[]) => {
    if (!mediaStreamRef.current || isMicMuted) return;

    chunksRef.current = [];
    recordingStartRef.current = Date.now();

    const recorder = new MediaRecorder(mediaStreamRef.current, {
      mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm",
    });

    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      const duration = Date.now() - recordingStartRef.current;
      if (chunksRef.current.length === 0 || duration < MIN_RECORDING_MS) return;
      const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });
      sendAudioToAPI(audioBlob, history);
    };

    recorder.start(100); // collect chunks every 100ms

    // Set up silence detection via AnalyserNode
    if (analyserRef.current) {
      const checkSilence = () => {
        if (!mediaRecorderRef.current || mediaRecorderRef.current.state !== "recording") return;

        const data = new Uint8Array(analyserRef.current!.frequencyBinCount);
        analyserRef.current!.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;

        if (avg < SILENCE_THRESHOLD) {
          if (!silenceTimerRef.current) {
            silenceTimerRef.current = setTimeout(() => {
              silenceTimerRef.current = null;
              stopRecording();
            }, SILENCE_DURATION);
          }
        } else {
          // User is speaking — cancel silence timer
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
          }
        }

        if (mediaRecorderRef.current?.state === "recording") {
          requestAnimationFrame(checkSilence);
        }
      };
      requestAnimationFrame(checkSilence);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMicMuted, sendAudioToAPI, stopRecording]);

  const startCall = async () => {
    setError("");
    setStatus("connecting");
    setTranscript([]);
    setConversationHistory([]);
    setCallDuration(0);
    setAnalysis(null);

    try {
      // Request mic access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      // Set up AudioContext for waveform + silence detection
      const audioCtx = new AudioContext();
      audioContextRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);
      analyserRef.current = analyser;

      setCallActive(true);

      // Start with agent greeting (text-to-voice)
      setStatus("speaking");
      setIsAgentSpeaking(true);

      const greeting = "Hi! I'm ready to take your call. How can I help you today?";

      // Synthesize greeting
      try {
        const synthRes = await fetch("/api/voice/synthesize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: greeting,
            voiceId: voiceId || undefined,
          }),
        });

        if (synthRes.ok) {
          const blob = await synthRes.blob();
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          currentAudioRef.current = audio;

          setTranscript([{ role: "agent", text: greeting, timestamp: new Date() }]);

          audio.onended = () => {
            URL.revokeObjectURL(url);
            setIsAgentSpeaking(false);
            setStatus("listening");
            setIsListening(true);
            startListening([{ role: "assistant", content: greeting }]);
          };
          audio.play().catch(() => {
            setIsAgentSpeaking(false);
            setStatus("listening");
            setIsListening(true);
            startListening([{ role: "assistant", content: greeting }]);
          });
          return;
        }
      } catch {
        // Fall through to text-only
      }

      // Fallback: no audio synthesis — just show text and start listening
      setTranscript([{ role: "agent", text: greeting, timestamp: new Date() }]);
      setIsAgentSpeaking(false);
      setStatus("listening");
      setIsListening(true);
      const initHistory: ConversationMessage[] = [{ role: "assistant", content: greeting }];
      setConversationHistory(initHistory);
      startListening(initHistory);
    } catch (err: any) {
      if (err.name === "NotAllowedError") {
        setError("Microphone access denied. Please allow mic access and try again.");
      } else {
        setError("Failed to start call: " + (err.message || "Unknown error"));
      }
      setStatus("idle");
    }
  };

  const endCall = async () => {
    // Stop all audio
    currentAudioRef.current?.pause();
    stopRecording();

    // Stop mic stream
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;

    // Close audio context
    audioContextRef.current?.close();
    audioContextRef.current = null;
    analyserRef.current = null;

    setCallActive(false);
    setIsListening(false);
    setIsAgentSpeaking(false);
    setStatus("idle");

    // Generate analysis from transcript
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
        // Skip analysis if it fails
      }
    }
  };

  const statusLabel = {
    idle: "",
    connecting: "Connecting…",
    listening: "Listening…",
    processing: "Thinking…",
    speaking: "Agent speaking…",
  }[status];

  return (
    <div className="space-y-4">
      {/* Call Display */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden">
        {/* Agent Avatar + Status */}
        <div className="flex flex-col items-center gap-3 px-6 py-6 border-b border-zinc-800">
          <div className={cn(
            "relative flex h-20 w-20 items-center justify-center rounded-full text-3xl font-bold transition-all",
            isAgentSpeaking
              ? "ring-4 ring-indigo-500/50 bg-indigo-600/20 text-white"
              : isListening
              ? "ring-4 ring-emerald-500/50 bg-emerald-600/20 text-white"
              : "bg-zinc-800 text-zinc-400"
          )}>
            {agentName[0]?.toUpperCase() || "A"}
            {callActive && (
              <span className={cn(
                "absolute bottom-1 right-1 h-3 w-3 rounded-full border-2 border-zinc-950",
                isAgentSpeaking ? "bg-indigo-500 animate-pulse" : isListening ? "bg-emerald-500 animate-pulse" : "bg-zinc-600"
              )} />
            )}
          </div>

          <div className="text-center">
            <p className="text-sm font-semibold text-white">{agentName}</p>
            {callActive && (
              <p className="text-xs text-zinc-500 mt-0.5">⏱ {formatDuration(callDuration)}</p>
            )}
            {statusLabel && (
              <p className={cn(
                "text-xs mt-1 font-medium",
                status === "speaking" ? "text-indigo-400" : status === "listening" ? "text-emerald-400" : "text-zinc-500"
              )}>
                {statusLabel}
              </p>
            )}
          </div>

          {/* Waveform */}
          <div className="w-full max-w-xs">
            <AudioWaveform
              active={callActive && (isListening || isAgentSpeaking)}
              color={isAgentSpeaking ? "indigo" : isListening ? "green" : "zinc"}
              analyser={isListening ? analyserRef.current : null}
            />
          </div>
        </div>

        {/* Transcript */}
        <div
          ref={transcriptRef}
          className="h-52 overflow-y-auto p-4 space-y-3"
        >
          {transcript.length === 0 && !callActive && (
            <div className="flex h-full items-center justify-center text-zinc-600 text-xs text-center">
              Start a test call to see the live transcript here
            </div>
          )}
          {transcript.map((t, i) => (
            <div key={i} className={cn("flex gap-2", t.role === "user" ? "justify-end" : "justify-start")}>
              {t.role === "agent" && (
                <div className="h-6 w-6 rounded-full bg-indigo-600/20 border border-indigo-500/20 flex items-center justify-center text-xs text-indigo-400 shrink-0 mt-0.5">
                  {agentName[0]}
                </div>
              )}
              <div className={cn(
                "max-w-[80%] rounded-xl px-3 py-2 text-xs leading-relaxed",
                t.role === "agent"
                  ? "bg-zinc-800 text-zinc-200 rounded-tl-sm"
                  : "bg-indigo-600 text-white rounded-tr-sm"
              )}>
                {t.text}
              </div>
              {t.role === "user" && (
                <div className="h-6 w-6 rounded-full bg-zinc-700 flex items-center justify-center text-xs text-zinc-300 shrink-0 mt-0.5">
                  👤
                </div>
              )}
            </div>
          ))}
          {status === "processing" && (
            <div className="flex gap-2 justify-start">
              <div className="h-6 w-6 rounded-full bg-indigo-600/20 border border-indigo-500/20 flex items-center justify-center text-xs text-indigo-400 shrink-0 mt-0.5">
                {agentName[0]}
              </div>
              <div className="bg-zinc-800 rounded-xl rounded-tl-sm px-3 py-2 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          )}
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
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60 transition-colors"
            >
              {status === "connecting" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Phone className="h-4 w-4" />
              )}
              {status === "connecting" ? "Connecting…" : "Start Test Call"}
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsMicMuted((m) => !m)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-medium transition-colors",
                  isMicMuted
                    ? "border-red-500/40 bg-red-950/20 text-red-400"
                    : "border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-white"
                )}
              >
                {isMicMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                {isMicMuted ? "Unmute" : "Mute"}
              </button>
              <button
                onClick={() => setIsSpeakerMuted((m) => !m)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-medium transition-colors",
                  isSpeakerMuted
                    ? "border-amber-500/40 bg-amber-950/20 text-amber-400"
                    : "border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-white"
                )}
              >
                {isSpeakerMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                {isSpeakerMuted ? "Unmute" : "Speaker"}
              </button>
              <button
                onClick={endCall}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-500 transition-colors"
              >
                <PhoneOff className="h-4 w-4" />End Call
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
