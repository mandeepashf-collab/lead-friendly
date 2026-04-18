"use client";

/**
 * Human Dialer — browser-based WebRTC softphone using @telnyx/webrtc.
 *
 * Flow:
 *   1. On mount, POST /api/telnyx/token to get login credentials (token or
 *      username/password fallback).
 *   2. Instantiate TelnyxRTC and connect. The client registers to Telnyx as
 *      a SIP endpoint.
 *   3. User dials a number → we newCall() and stream audio via the browser.
 *   4. On call start we insert a calls row (direction='outbound', no ai_agent_id
 *      so it's clearly a human call). On hangup we update duration + status.
 *
 * Prefill: ?contactId=X hydrates the phone input from the contacts table.
 */

import { useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  Phone, PhoneOff, Mic, MicOff, PauseCircle, PlayCircle, Hash,
  User as UserIcon, Loader2, AlertCircle, CheckCircle2, Delete,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Contact } from "@/types/database";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TelnyxClient = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TelnyxCall = any;

type PhoneRow = { number: string };

function HumanDialerInner() {
  const searchParams = useSearchParams();
  const prefillContactId = searchParams.get("contactId");

  const [connectionState, setConnectionState] = useState<
    "idle" | "connecting" | "ready" | "error"
  >("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [phone, setPhone] = useState("");
  const [contact, setContact] = useState<Contact | null>(null);
  const [fromNumber, setFromNumber] = useState<string | null>(null);
  const [fromNumbers, setFromNumbers] = useState<PhoneRow[]>([]);

  const [inCall, setInCall] = useState(false);
  const [callState, setCallState] = useState<string>("");
  const [callStartedAt, setCallStartedAt] = useState<Date | null>(null);
  const [muted, setMuted] = useState(false);
  const [held, setHeld] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const clientRef = useRef<TelnyxClient | null>(null);
  const callRef = useRef<TelnyxCall | null>(null);
  const callRecordIdRef = useRef<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // 1) Resolve the user's org + phone numbers, and optionally prefill contact
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles").select("organization_id").eq("id", user.id).single();
      if (!profile?.organization_id) return;

      const { data: numbers } = await supabase
        .from("phone_numbers")
        .select("number")
        .eq("organization_id", profile.organization_id)
        .eq("status", "active")
        .order("created_at", { ascending: true });
      if (cancelled) return;
      const list = (numbers || []) as PhoneRow[];
      setFromNumbers(list);
      if (list.length > 0) setFromNumber(list[0].number);

      if (prefillContactId) {
        const { data: c } = await supabase
          .from("contacts")
          .select("*")
          .eq("id", prefillContactId)
          .single();
        if (!cancelled && c) {
          setContact(c as Contact);
          if (c.phone) setPhone(c.phone);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [prefillContactId]);

  // 2) Boot the Telnyx WebRTC client
  useEffect(() => {
    let cancelled = false;
    let client: TelnyxClient | null = null;

    (async () => {
      setConnectionState("connecting");
      setErrorMsg(null);
      try {
        // Dynamic import — @telnyx/webrtc is browser-only
        const mod = await import("@telnyx/webrtc");
        const TelnyxRTC = (mod as { TelnyxRTC: new (opts: unknown) => TelnyxClient }).TelnyxRTC;

        const tokenRes = await fetch("/api/telnyx/token", { method: "POST" });
        if (!tokenRes.ok) {
          const t = await tokenRes.text();
          throw new Error(`Token fetch failed (${tokenRes.status}): ${t.slice(0, 200)}`);
        }
        const tokenData = await tokenRes.json();

        const clientOpts: Record<string, unknown> = tokenData.login_token
          ? { login_token: tokenData.login_token }
          : { login: tokenData.login, password: tokenData.password };

        client = new TelnyxRTC(clientOpts);
        clientRef.current = client;

        // The Telnyx SDK emits 'telnyx.ready' when the socket has registered
        client.on("telnyx.ready", () => {
          if (cancelled) return;
          setConnectionState("ready");
        });
        client.on("telnyx.error", (err: unknown) => {
          console.error("Telnyx error:", err);
          if (cancelled) return;
          setConnectionState("error");
          setErrorMsg(
            typeof err === "object" && err && "message" in err
              ? String((err as { message: unknown }).message)
              : "WebRTC connection error"
          );
        });
        client.on("telnyx.socket.close", () => {
          if (cancelled) return;
          setConnectionState("idle");
        });
        client.on("telnyx.notification", (notification: { type?: string; call?: TelnyxCall }) => {
          // Call state changes come through here
          if (notification?.type === "callUpdate" && notification.call) {
            const c = notification.call;
            if (c === callRef.current) {
              setCallState(String(c.state || ""));
              if (c.state === "active" && !callStartedAt) {
                setCallStartedAt(new Date());
              }
              if (c.state === "done" || c.state === "destroy" || c.state === "hangup") {
                void handleCallEnded();
              }
            }
          }
        });

        // remoteElement is a valid option on TelnyxRTC; typed as `any` above
        client.remoteElement = audioRef.current;
        client.connect();
      } catch (err) {
        console.error("Failed to init WebRTC:", err);
        if (!cancelled) {
          setConnectionState("error");
          setErrorMsg(err instanceof Error ? err.message : "Failed to connect to Telnyx");
        }
      }
    })();

    return () => {
      cancelled = true;
      try {
        callRef.current?.hangup();
      } catch { /* noop */ }
      try {
        client?.disconnect();
      } catch { /* noop */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 3) Live call elapsed timer
  useEffect(() => {
    if (!inCall || !callStartedAt) return;
    const int = setInterval(() => {
      setElapsed(Math.floor((Date.now() - callStartedAt.getTime()) / 1000));
    }, 500);
    return () => clearInterval(int);
  }, [inCall, callStartedAt]);

  const normaliseE164 = (s: string) => {
    const trimmed = s.trim();
    if (trimmed.startsWith("+")) return "+" + trimmed.slice(1).replace(/\D/g, "");
    const digits = trimmed.replace(/\D/g, "");
    if (digits.length === 10) return "+1" + digits;
    return "+" + digits;
  };

  const handleDial = async () => {
    if (!clientRef.current || connectionState !== "ready") return;
    if (!phone.trim()) return;
    if (!fromNumber) {
      setErrorMsg("No active phone number found — add one in Phone Numbers first.");
      return;
    }

    const to = normaliseE164(phone);
    setErrorMsg(null);

    // Insert the call record first so we can update it on hangup
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const { data: profile } = await supabase
        .from("profiles").select("organization_id").eq("id", user.id).single();
      if (!profile?.organization_id) throw new Error("No org");

      const { data: inserted, error } = await supabase
        .from("calls")
        .insert({
          organization_id: profile.organization_id,
          contact_id: contact?.id ?? null,
          direction: "outbound",
          status: "initiated",
          from_number: fromNumber,
          to_number: to,
          ai_agent_id: null, // Human call — no AI agent
          started_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (error || !inserted) {
        console.error("Call record insert error:", error);
        setErrorMsg("Could not create call record");
        return;
      }
      callRecordIdRef.current = inserted.id;
    } catch (err) {
      console.error("Pre-dial failed:", err);
      setErrorMsg("Pre-dial failed");
      return;
    }

    try {
      const call = clientRef.current.newCall({
        destinationNumber: to,
        callerNumber: fromNumber,
        audio: true,
        video: false,
      });
      callRef.current = call;
      setInCall(true);
      setCallState("new");
      setMuted(false);
      setHeld(false);
      setElapsed(0);
      setCallStartedAt(null);
    } catch (err) {
      console.error("newCall failed:", err);
      setErrorMsg("Failed to start call");
      setInCall(false);
    }
  };

  const handleCallEnded = async () => {
    const id = callRecordIdRef.current;
    const started = callStartedAt;
    setInCall(false);
    setMuted(false);
    setHeld(false);
    callRef.current = null;
    callRecordIdRef.current = null;
    setCallStartedAt(null);

    if (!id) return;

    const duration = started ? Math.max(0, Math.floor((Date.now() - started.getTime()) / 1000)) : 0;
    try {
      const supabase = createClient();
      await supabase
        .from("calls")
        .update({
          status: duration > 0 ? "completed" : "no-answer",
          duration,
          ended_at: new Date().toISOString(),
        })
        .eq("id", id);
    } catch (err) {
      console.error("Failed to update call record on hangup:", err);
    }
  };

  const handleHangup = () => {
    try {
      callRef.current?.hangup();
    } catch { /* noop */ }
    // handleCallEnded will fire via the state listener, but fire here too
    // in case the SDK doesn't emit (safety net)
    void handleCallEnded();
  };

  const toggleMute = () => {
    if (!callRef.current) return;
    try {
      if (muted) callRef.current.unmuteAudio?.();
      else callRef.current.muteAudio?.();
      setMuted(!muted);
    } catch (err) { console.error(err); }
  };

  const toggleHold = () => {
    if (!callRef.current) return;
    try {
      if (held) callRef.current.unhold?.();
      else callRef.current.hold?.();
      setHeld(!held);
    } catch (err) { console.error(err); }
  };

  const sendDTMF = (digit: string) => {
    if (callRef.current?.dtmf) {
      try { callRef.current.dtmf(digit); } catch { /* noop */ }
    }
    // Also append to phone display when not in call
    if (!inCall) setPhone((p) => p + digit);
  };

  const backspace = () => setPhone((p) => p.slice(0, -1));

  const formatElapsed = (s: number) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  const keypadKeys = [
    "1","2","3","4","5","6","7","8","9","*","0","#",
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Human Dialer</h1>
        <p className="text-zinc-400">Dial contacts yourself using your browser</p>
      </div>

      {/* Connection status strip */}
      <div className={cn(
        "rounded-lg border px-4 py-2 text-sm flex items-center gap-2",
        connectionState === "ready" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" :
        connectionState === "error" ? "bg-red-500/10 border-red-500/20 text-red-400" :
        "bg-amber-500/10 border-amber-500/20 text-amber-400"
      )}>
        {connectionState === "connecting" && <Loader2 className="h-4 w-4 animate-spin" />}
        {connectionState === "ready" && <CheckCircle2 className="h-4 w-4" />}
        {connectionState === "error" && <AlertCircle className="h-4 w-4" />}
        <span>
          {connectionState === "connecting" && "Connecting to Telnyx…"}
          {connectionState === "ready" && "Ready to dial"}
          {connectionState === "error" && (errorMsg || "Connection error")}
          {connectionState === "idle" && "Disconnected"}
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: dialer */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 space-y-4">
          {/* From number */}
          <div>
            <label className="text-xs font-medium uppercase text-zinc-500">Calling from</label>
            {fromNumbers.length === 0 ? (
              <p className="mt-1 text-sm text-amber-400">No active phone numbers. Add one in Phone Numbers.</p>
            ) : fromNumbers.length === 1 ? (
              <p className="mt-1 text-sm font-mono text-white">{fromNumbers[0].number}</p>
            ) : (
              <select
                value={fromNumber || ""}
                onChange={(e) => setFromNumber(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
              >
                {fromNumbers.map((n) => <option key={n.number} value={n.number}>{n.number}</option>)}
              </select>
            )}
          </div>

          {/* Destination */}
          <div>
            <label className="text-xs font-medium uppercase text-zinc-500">Dial</label>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 555 123 4567"
                disabled={inCall}
                className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-lg font-mono text-white placeholder-zinc-600 focus:border-indigo-500 focus:outline-none disabled:opacity-60"
              />
              <button
                onClick={backspace}
                disabled={inCall || !phone}
                className="rounded-lg border border-zinc-700 bg-zinc-800 p-2 text-zinc-400 hover:bg-zinc-700 hover:text-white disabled:opacity-40"
                title="Backspace"
              >
                <Delete className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Keypad */}
          <div className="grid grid-cols-3 gap-2">
            {keypadKeys.map((k) => (
              <button
                key={k}
                onClick={() => sendDTMF(k)}
                className="h-14 rounded-lg border border-zinc-700 bg-zinc-800 text-xl font-semibold text-white hover:bg-zinc-700 active:bg-zinc-600"
              >
                {k}
              </button>
            ))}
          </div>

          {/* Dial / in-call controls */}
          {!inCall ? (
            <button
              onClick={handleDial}
              disabled={connectionState !== "ready" || !phone.trim() || !fromNumber}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:bg-zinc-800 disabled:text-zinc-500"
            >
              <Phone className="h-5 w-5" />
              Call
            </button>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2">
                <span className="text-xs text-emerald-400 uppercase font-semibold">
                  {callState === "active" ? "In Call" : callState || "Ringing"}
                </span>
                <span className="font-mono text-sm text-white">{formatElapsed(elapsed)}</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={toggleMute}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-lg border p-3 text-xs",
                    muted ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                          : "border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                  )}
                >
                  {muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                  {muted ? "Unmute" : "Mute"}
                </button>
                <button
                  onClick={toggleHold}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-lg border p-3 text-xs",
                    held ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                         : "border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                  )}
                >
                  {held ? <PlayCircle className="h-5 w-5" /> : <PauseCircle className="h-5 w-5" />}
                  {held ? "Resume" : "Hold"}
                </button>
                <button
                  onClick={handleHangup}
                  className="flex flex-col items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400 hover:bg-red-500/20"
                >
                  <PhoneOff className="h-5 w-5" />
                  Hang Up
                </button>
              </div>
            </div>
          )}

          {errorMsg && connectionState !== "error" && (
            <p className="text-xs text-red-400 rounded-lg bg-red-500/10 px-3 py-2">{errorMsg}</p>
          )}
        </div>

        {/* Right: contact card / tips */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 space-y-4">
          {contact ? (
            <>
              <h3 className="text-xs font-semibold uppercase text-zinc-500">Calling</h3>
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-600/20 text-indigo-400 font-bold">
                  {((contact.first_name?.[0] || "") + (contact.last_name?.[0] || "")).toUpperCase() || <UserIcon className="h-5 w-5" />}
                </div>
                <div>
                  <p className="font-semibold text-white">
                    {[contact.first_name, contact.last_name].filter(Boolean).join(" ") || "Unnamed"}
                  </p>
                  {contact.company_name && <p className="text-sm text-zinc-400">{contact.company_name}</p>}
                </div>
              </div>
              {contact.email && (
                <div className="text-sm">
                  <span className="text-zinc-500">Email: </span>
                  <span className="text-white">{contact.email}</span>
                </div>
              )}
              {contact.source && (
                <div className="text-sm">
                  <span className="text-zinc-500">Source: </span>
                  <span className="text-white capitalize">{contact.source.replace(/_/g, " ")}</span>
                </div>
              )}
              {contact.tags && contact.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {contact.tags.map((t) => (
                    <span key={t} className="rounded-full bg-zinc-800 border border-zinc-700 px-2 py-0.5 text-xs text-zinc-300">
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <h3 className="text-xs font-semibold uppercase text-zinc-500">Tips</h3>
              <ul className="space-y-2 text-sm text-zinc-400">
                <li className="flex gap-2">
                  <Hash className="h-4 w-4 mt-0.5 text-zinc-600 shrink-0" />
                  Click a contact&apos;s Call button on the Contacts page to auto-prefill the number here.
                </li>
                <li className="flex gap-2">
                  <Mic className="h-4 w-4 mt-0.5 text-zinc-600 shrink-0" />
                  Your browser will ask for microphone access the first time you dial.
                </li>
                <li className="flex gap-2">
                  <Phone className="h-4 w-4 mt-0.5 text-zinc-600 shrink-0" />
                  Human calls are logged to the Calls page with no AI agent attached.
                </li>
              </ul>
            </>
          )}
        </div>
      </div>

      {/* Hidden audio element for remote stream — Telnyx SDK writes to this */}
      <audio ref={audioRef} autoPlay />
    </div>
  );
}

export default function HumanDialerPage() {
  return (
    <Suspense fallback={<div className="text-zinc-500">Loading dialer…</div>}>
      <HumanDialerInner />
    </Suspense>
  );
}
