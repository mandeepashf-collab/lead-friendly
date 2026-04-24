"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Delete,
  Info,
  Loader2,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Settings2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSoftphone, type SoftphoneContact } from "./SoftphoneContext";
import { useDialWithCompliance } from "@/hooks/useDialWithCompliance";

// ── Types ────────────────────────────────────────────────────

type DockState =
  | "idle"
  | "ready"
  | "dialing"
  | "connected"
  | "ending"
  | "error";

interface OrgNumber {
  id: string;
  number: string;
  friendly_name: string | null;
  status: string;
}

interface MediaDeviceOption {
  deviceId: string;
  label: string;
}

interface DockPosition {
  x: number;
  y: number;
}

const LAST_USED_NUMBER_KEY = "softphone:lastFromNumber";
const MIC_PREF_KEY = "softphone:micDeviceId";
const DOCK_POSITION_KEY = "softphone:dockPosition";
const BROADCAST_CHANNEL = "leadfriendly-softphone";

// Approx dock sizes for viewport clamping. Idle pill is ~160x40; expanded
// dock is 360 wide and grows with content (body varies by state). We use
// generous estimates so the dock never ends up even partially off-screen.
const EXPANDED_DOCK_WIDTH = 360;
const EXPANDED_DOCK_HEIGHT = 500;
const IDLE_PILL_WIDTH = 160;
const IDLE_PILL_HEIGHT = 40;

const DTMF_KEYS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["*", "0", "#"],
];

// RFC 4733 DTMF event codes — '0'..'9' map to 0..9, '*' → 10, '#' → 11.
// livekit-client's publishDtmf(code, digit) takes both.
const DTMF_EVENT_CODES: Record<string, number> = {
  "0": 0, "1": 1, "2": 2, "3": 3, "4": 4,
  "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
  "*": 10, "#": 11,
};

// ── Component ────────────────────────────────────────────────

export function Softphone() {
  const { pendingContact, clearPending, setInCall } = useSoftphone();
  const { dial } = useDialWithCompliance();

  // Dock UI state
  const [dockState, setDockState] = useState<DockState>("idle");
  const [expanded, setExpanded] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPrimaryTab, setIsPrimaryTab] = useState(true);

  // Current-call state
  const [activeContact, setActiveContact] = useState<SoftphoneContact | null>(
    null,
  );
  const [selectedFromNumber, setSelectedFromNumber] = useState<string>("");
  const [orgNumbers, setOrgNumbers] = useState<OrgNumber[]>([]);
  const [callId, setCallId] = useState<string | null>(null);
  const [micMuted, setMicMuted] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [statusLabel, setStatusLabel] = useState<string>("");

  // Device pickers
  const [mics, setMics] = useState<MediaDeviceOption[]>([]);
  const [selectedMicId, setSelectedMicId] = useState<string>("");
  const [showSettings, setShowSettings] = useState(false);

  // ── Drag state ─────────────────────────────────────────────
  //
  // When position is null → use default CSS (bottom-6 right-6).
  // When position is set  → absolute top/left pixel coords from drag.
  //
  // We don't track width/height explicitly — we just use constants above for
  // clamping. This keeps the state shape small and avoids layout reads during
  // drag which would tank framerate.
  const [position, setPosition] = useState<DockPosition | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{
    mouseX: number;
    mouseY: number;
    dockX: number;
    dockY: number;
  } | null>(null);

  // Refs for mutable objects (Room, timers, track)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const roomRef = useRef<any>(null);
  const localTrackRef = useRef<MediaStreamTrack | null>(null);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const broadcastRef = useRef<BroadcastChannel | null>(null);
  const audioElementsRef = useRef<HTMLAudioElement[]>([]);

  // ── Tab-switch guard ────────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
      return;
    }
    const bc = new BroadcastChannel(BROADCAST_CHANNEL);
    broadcastRef.current = bc;
    const tabId = Math.random().toString(36).slice(2);

    // Announce self on mount, ask if any primary exists
    bc.postMessage({ type: "hello", tabId });

    const handler = (ev: MessageEvent) => {
      const data = ev.data as { type?: string; tabId?: string };
      if (data?.type === "hello" && data.tabId !== tabId) {
        // Another tab just opened. If we're primary, tell them.
        if (isPrimaryTab) {
          bc.postMessage({ type: "claimed", tabId });
        }
      } else if (data?.type === "claimed" && data.tabId !== tabId) {
        // Another tab was already primary. We are a duplicate.
        setIsPrimaryTab(false);
      }
    };
    bc.addEventListener("message", handler);

    return () => {
      bc.removeEventListener("message", handler);
      bc.close();
      broadcastRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Load org numbers once ────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/phone-numbers", { credentials: "include" });
        if (!res.ok) return;
        const data = (await res.json()) as { numbers?: OrgNumber[] };
        if (cancelled) return;
        const active = (data.numbers ?? []).filter((n) => n.status === "active");
        setOrgNumbers(active);

        // Restore last-used if still valid
        const lastUsed =
          typeof window !== "undefined"
            ? window.localStorage.getItem(LAST_USED_NUMBER_KEY)
            : null;
        const defaultNumber =
          (lastUsed && active.find((n) => n.number === lastUsed)?.number) ||
          active[0]?.number ||
          "";
        setSelectedFromNumber(defaultNumber);
      } catch (err) {
        console.error("[softphone] failed to load org numbers:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Load mic devices ─────────────────────────────────────────
  const refreshDevices = useCallback(async () => {
    try {
      // Ensure permission so device labels populate
      if (navigator.mediaDevices?.getUserMedia) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          // Immediately stop — we only wanted permission
          stream.getTracks().forEach((t) => t.stop());
        } catch {
          // user denied or no mic; continue with empty list
        }
      }
      const all = await navigator.mediaDevices.enumerateDevices();
      const micList = all
        .filter((d) => d.kind === "audioinput")
        .map((d) => ({
          deviceId: d.deviceId,
          label: d.label || `Microphone ${d.deviceId.slice(0, 5)}`,
        }));
      setMics(micList);
      const preferred =
        typeof window !== "undefined"
          ? window.localStorage.getItem(MIC_PREF_KEY)
          : null;
      const chosen =
        (preferred && micList.find((m) => m.deviceId === preferred)?.deviceId) ||
        micList[0]?.deviceId ||
        "";
      setSelectedMicId(chosen);
    } catch (err) {
      console.error("[softphone] enumerateDevices failed:", err);
    }
  }, []);

  useEffect(() => {
    refreshDevices();
  }, [refreshDevices]);

  // ── Handle incoming pending contact from context ─────────────
  useEffect(() => {
    if (!pendingContact) return;
    setActiveContact(pendingContact);
    setDockState("ready");
    setExpanded(true);
    setErrorMsg(null);
    clearPending();
  }, [pendingContact, clearPending]);

  // ── Elapsed timer ────────────────────────────────────────────
  useEffect(() => {
    if (dockState === "connected") {
      const start = Date.now();
      setElapsedSeconds(0);
      elapsedTimerRef.current = setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - start) / 1000));
      }, 1000);
    } else {
      if (elapsedTimerRef.current) {
        clearInterval(elapsedTimerRef.current);
        elapsedTimerRef.current = null;
      }
    }
    return () => {
      if (elapsedTimerRef.current) {
        clearInterval(elapsedTimerRef.current);
        elapsedTimerRef.current = null;
      }
    };
  }, [dockState]);

  // ── Global cleanup on unmount (route change, etc.) ───────────
  useEffect(() => {
    return () => {
      void teardownRoom();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Sync in-call flag to context ─────────────────────────────
  useEffect(() => {
    setInCall(dockState === "connected" || dockState === "dialing");
  }, [dockState, setInCall]);

  // ── Drag: hydrate saved position from localStorage ───────────
  //
  // Runs once on mount. If the stored position is now off-screen (user
  // resized their window since last session), clamp into the viewport so
  // the dock is always reachable.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(DOCK_POSITION_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as DockPosition;
      if (typeof parsed.x !== "number" || typeof parsed.y !== "number") return;
      setPosition(clampToViewport(parsed, EXPANDED_DOCK_WIDTH, EXPANDED_DOCK_HEIGHT));
    } catch {
      // Malformed — ignore, fall back to default bottom-right
    }
  }, []);

  // ── Drag: re-clamp on window resize ──────────────────────────
  //
  // If the user resizes the window smaller and the dock is at the edge,
  // it could end up off-screen. Re-clamp whenever the viewport changes.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => {
      setPosition((current) => {
        if (!current) return current;
        return clampToViewport(current, EXPANDED_DOCK_WIDTH, EXPANDED_DOCK_HEIGHT);
      });
    };
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  // ── Drag: mousemove / mouseup listeners (only attached while dragging) ──
  //
  // We attach to window (not the dock) so the drag keeps working even if
  // the cursor leaves the dock briefly. Listeners are removed on mouseup
  // to avoid processing mousemove events when the user isn't dragging.
  useEffect(() => {
    if (!isDragging) return;

    const onMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return;
      const dx = e.clientX - dragStartRef.current.mouseX;
      const dy = e.clientY - dragStartRef.current.mouseY;
      const newPos = {
        x: dragStartRef.current.dockX + dx,
        y: dragStartRef.current.dockY + dy,
      };
      // Clamp on every frame so the dock can't be dragged off-screen
      const width = expanded || dockState !== "idle" ? EXPANDED_DOCK_WIDTH : IDLE_PILL_WIDTH;
      const height = expanded || dockState !== "idle" ? EXPANDED_DOCK_HEIGHT : IDLE_PILL_HEIGHT;
      setPosition(clampToViewport(newPos, width, height));
    };

    const onUp = () => {
      setIsDragging(false);
      dragStartRef.current = null;
      // Persist whatever position we settled on
      setPosition((current) => {
        if (current && typeof window !== "undefined") {
          try {
            window.localStorage.setItem(DOCK_POSITION_KEY, JSON.stringify(current));
          } catch {
            // localStorage full or disabled — silently skip persistence
          }
        }
        return current;
      });
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isDragging, expanded, dockState]);

  // ── Drag: handle mousedown on drag handle ───────────────────
  //
  // Called from the header element's onMouseDown. We DO NOT call
  // preventDefault unconditionally — if the user is clicking a button inside
  // the header (Settings, Close), let the click happen. We only start a drag
  // when the target is the handle itself (not a button within it).
  const handleDragStart = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      // If the click landed on a button inside the header, don't start drag.
      // data-no-drag on those buttons is our signal.
      const target = e.target as HTMLElement;
      if (target.closest("[data-no-drag]")) return;

      // Compute starting dock position. If position is null (first time),
      // materialize it from the current rendered bounding rect so dragging
      // picks up from wherever the default CSS placed it.
      const dockEl = e.currentTarget.closest("[data-softphone-dock]") as HTMLElement | null;
      let startPos: DockPosition;
      if (position) {
        startPos = position;
      } else if (dockEl) {
        const rect = dockEl.getBoundingClientRect();
        startPos = { x: rect.left, y: rect.top };
        setPosition(startPos);
      } else {
        // Fallback — shouldn't happen in practice
        startPos = { x: window.innerWidth - EXPANDED_DOCK_WIDTH - 24, y: window.innerHeight - EXPANDED_DOCK_HEIGHT - 24 };
        setPosition(startPos);
      }

      dragStartRef.current = {
        mouseX: e.clientX,
        mouseY: e.clientY,
        dockX: startPos.x,
        dockY: startPos.y,
      };
      setIsDragging(true);
      e.preventDefault();
    },
    [position],
  );

  // ── Core actions ─────────────────────────────────────────────

  const teardownRoom = useCallback(async () => {
    try {
      // Detach any audio elements
      audioElementsRef.current.forEach((el) => {
        try {
          el.pause();
          el.srcObject = null;
          el.remove();
        } catch {
          // no-op
        }
      });
      audioElementsRef.current = [];
      if (roomRef.current) {
        try {
          await roomRef.current.disconnect();
        } catch {
          // no-op
        }
        roomRef.current = null;
      }
      if (localTrackRef.current) {
        try {
          localTrackRef.current.stop();
        } catch {
          // no-op
        }
        localTrackRef.current = null;
      }
    } catch (err) {
      console.error("[softphone] teardown error:", err);
    }
  }, []);

  const startCall = useCallback(async () => {
    if (!activeContact || !selectedFromNumber) {
      setErrorMsg("Contact or outbound number missing");
      return;
    }
    setErrorMsg(null);
    setDockState("dialing");
    setStatusLabel("Connecting...");

    const contactDisplayName =
      [activeContact.firstName, activeContact.lastName]
        .filter(Boolean)
        .join(" ")
        .trim() ||
      activeContact.company ||
      activeContact.phone;

    try {
      // 1. Initiate via our API (runs through the compliance gate — the
      // hook handles 403 hard blocks + 409 soft-block override modal).
      const result = await dial({
        endpoint: "/api/softphone/initiate",
        body: {
          contactId: activeContact.id,
          fromNumber: selectedFromNumber,
          // Stage 1.6: forward the activeContact's phone so the server dials
          // the picker-chosen number (cell vs primary). Server validates it
          // matches contact.phone OR contact.cell_phone.
          phone: activeContact.phone,
        },
        contactName: contactDisplayName,
        phone: activeContact.phone,
      });

      if (!result.ok) {
        // Hook already surfaced the error as a toast. Reset the dock so the
        // user can retry (or pick a different contact) without a stuck
        // "Connecting..." state. Cancel from the override modal returns the
        // dock to ready; anything else is treated as an error.
        if (result.reason === "cancelled") {
          setDockState("ready");
          setStatusLabel("");
        } else {
          setErrorMsg(
            result.reason === "error" ? result.message : "Call blocked by compliance policy",
          );
          setDockState("error");
          setStatusLabel("");
        }
        return;
      }

      const { callId: newCallId, accessToken, serverUrl } = result.data as {
        callId: string;
        accessToken: string;
        serverUrl: string;
        sipParticipantIdentity: string;
      };

      setCallId(newCallId);

      // Persist last-used number now that we've successfully initiated
      if (typeof window !== "undefined") {
        window.localStorage.setItem(LAST_USED_NUMBER_KEY, selectedFromNumber);
        if (selectedMicId) {
          window.localStorage.setItem(MIC_PREF_KEY, selectedMicId);
        }
      }

      // 2. Connect to LiveKit room
      const livekit = await import("livekit-client");
      const { Room, RoomEvent, Track, createLocalAudioTrack } = livekit;

      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        publishDefaults: { audioPreset: livekit.AudioPresets.telephone },
      });
      roomRef.current = room;

      // Handlers
      room.on(RoomEvent.ParticipantConnected, (participant) => {
        if (participant.identity.startsWith("sip_")) {
          // SIP leg joined — contact is picking up or the dial is progressing
          setStatusLabel("Ringing...");
        }
      });

      room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
        if (
          track.kind === Track.Kind.Audio &&
          participant.identity.startsWith("sip_")
        ) {
          // Contact audio arrived → call is live
          const audioEl = track.attach() as HTMLAudioElement;
          audioEl.autoplay = true;
          audioEl.style.display = "none";
          document.body.appendChild(audioEl);
          audioElementsRef.current.push(audioEl);
          setDockState("connected");
          setStatusLabel("Connected");
        }
      });

      room.on(RoomEvent.ParticipantDisconnected, (participant) => {
        if (participant.identity.startsWith("sip_")) {
          // SIP hung up. End the call on our side too.
          void endCall();
        }
      });

      room.on(RoomEvent.Disconnected, () => {
        // Defensive — should be covered by participantDisconnected, but
        // catch-all in case the room dies for other reasons.
        setDockState((prev) =>
          prev === "connected" || prev === "dialing" ? "ending" : prev,
        );
      });

      await room.connect(serverUrl, accessToken);

      // 3. Publish rep's mic with chosen device
      const localTrack = await createLocalAudioTrack({
        deviceId: selectedMicId || undefined,
        echoCancellation: true,
        noiseSuppression: true,
      });
      localTrackRef.current = localTrack.mediaStreamTrack;
      await room.localParticipant.publishTrack(localTrack);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[softphone] startCall failed:", err);
      setErrorMsg(msg);
      setDockState("error");
      setStatusLabel("");
      await teardownRoom();
    }
  }, [activeContact, selectedFromNumber, selectedMicId, teardownRoom, dial]);

  const endCall = useCallback(async () => {
    setDockState("ending");
    setStatusLabel("Ending...");
    const idToHangup = callId;

    // Fire server hangup FIRST so deleteRoom() sends SIP BYE to the contact
    // before we tear down our own connection. If we teardown first, our
    // participant goes away but the SIP leg stays alive in the room — the
    // contact keeps hearing silence until their carrier times them out.
    if (idToHangup) {
      try {
        await fetch("/api/softphone/hangup", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ callId: idToHangup }),
        });
      } catch (err) {
        console.error("[softphone] hangup post failed:", err);
      }
    }

    // Now tear down our own LiveKit connection. The room is already being
    // destroyed server-side, but this ensures we release the mic + audio
    // elements locally regardless.
    await teardownRoom();

    setDockState("idle");
    setStatusLabel("");
    setCallId(null);
    setActiveContact(null);
    setMicMuted(false);
    setElapsedSeconds(0);
  }, [callId, teardownRoom]);

  const toggleMute = useCallback(async () => {
    if (!roomRef.current) return;
    const enabled = micMuted; // if currently muted, we want to enable
    try {
      await roomRef.current.localParticipant.setMicrophoneEnabled(enabled);
      setMicMuted(!enabled);
    } catch (err) {
      console.error("[softphone] toggleMute failed:", err);
    }
  }, [micMuted]);

  const sendDtmf = useCallback(
    async (digit: string) => {
      if (!roomRef.current || dockState !== "connected") return;
      const code = DTMF_EVENT_CODES[digit];
      if (code === undefined) return;
      try {
        // livekit-client first-class DTMF; routes automatically to the
        // SIP participant in the room. No data-channel topic needed.
        await roomRef.current.localParticipant.publishDtmf(code, digit);
      } catch (err) {
        console.error("[softphone] sendDtmf failed:", err);
      }
    },
    [dockState],
  );

  const closeDock = useCallback(() => {
    // Never close out of an active call state — user must End first
    if (dockState === "connected" || dockState === "dialing" || dockState === "ending") {
      return;
    }
    setActiveContact(null);
    setErrorMsg(null);
    setDockState("idle");
    setExpanded(false);
  }, [dockState]);

  // ── Derived ─────────────────────────────────────────────────

  const contactDisplayName = useMemo(() => {
    if (!activeContact) return "";
    const full = [activeContact.firstName, activeContact.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();
    return full || activeContact.phone;
  }, [activeContact]);

  const formattedElapsed = useMemo(() => {
    const m = Math.floor(elapsedSeconds / 60);
    const s = elapsedSeconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }, [elapsedSeconds]);

  // Position style — null = use default CSS (bottom-6 right-6), otherwise
  // absolute pixel coords from drag state. We use inline style for the
  // dynamic case so Tailwind doesn't need to know about runtime coords.
  const positionStyle: React.CSSProperties = position
    ? { top: `${position.y}px`, left: `${position.x}px` }
    : { bottom: "1.5rem", right: "1.5rem" };

  // ── Render ──────────────────────────────────────────────────

  // Duplicate-tab guard: show a minimal advisory instead of a functional dock
  if (!isPrimaryTab) {
    return (
      <div
        className="fixed z-50 max-w-xs rounded-lg border border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-lg"
        style={positionStyle}
      >
        Softphone is open in another tab. Switch to that tab to place calls.
      </div>
    );
  }

  // Idle pill — minimal footprint, draggable via onMouseDown on the button
  if (dockState === "idle" && !expanded) {
    return (
      <button
        data-softphone-dock
        onClick={() => {
          // Don't open dock if this click is the end of a drag
          if (isDragging) return;
          setExpanded(true);
        }}
        onMouseDown={handleDragStart}
        style={{ ...positionStyle, cursor: isDragging ? "grabbing" : "grab" }}
        className={cn(
          "fixed z-50 flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-md hover:bg-slate-50",
          isDragging && "shadow-xl",
        )}
        aria-label="Open softphone (drag to move)"
      >
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        <Phone className="h-4 w-4" />
        Softphone
      </button>
    );
  }

  // Expanded dock
  return (
    <div
      data-softphone-dock
      style={positionStyle}
      className={cn(
        "fixed z-50 w-[360px] rounded-xl border border-slate-200 bg-white shadow-2xl",
        isDragging && "shadow-[0_20px_50px_rgba(0,0,0,0.3)]",
      )}
    >
      {/* Header — also the drag handle. Buttons inside use data-no-drag to
          opt out of starting a drag when clicked. */}
      <div
        onMouseDown={handleDragStart}
        style={{ cursor: isDragging ? "grabbing" : "grab" }}
        className="flex items-center justify-between border-b border-slate-100 px-4 py-3 select-none"
        title="Drag to move"
      >
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              dockState === "connected"
                ? "animate-pulse bg-red-500"
                : dockState === "dialing"
                  ? "animate-pulse bg-amber-500"
                  : "bg-emerald-500",
            )}
          />
          <span className="text-sm font-semibold text-slate-900">
            {dockState === "connected"
              ? `On call · ${formattedElapsed}`
              : dockState === "dialing"
                ? statusLabel || "Dialing..."
                : dockState === "ending"
                  ? "Ending..."
                  : dockState === "error"
                    ? "Error"
                    : "Softphone"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {(dockState === "ready" || dockState === "error" || dockState === "idle") && (
            <>
              <button
                data-no-drag
                onClick={() => setShowSettings((s) => !s)}
                className="rounded p-1 text-slate-500 hover:bg-slate-100"
                aria-label="Settings"
              >
                <Settings2 className="h-4 w-4" />
              </button>
              <button
                data-no-drag
                onClick={closeDock}
                className="rounded p-1 text-slate-500 hover:bg-slate-100"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="p-4">
        {/* Error message */}
        {errorMsg && (
          <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
            {errorMsg}
          </div>
        )}

        {/* Contact block */}
        {activeContact && (
          <div className="mb-4">
            <div className="text-base font-semibold text-slate-900">
              {contactDisplayName}
            </div>
            <div className="text-sm text-slate-500">{activeContact.phone}</div>
            {activeContact.company && (
              <div className="text-xs text-slate-400">{activeContact.company}</div>
            )}
          </div>
        )}

        {!activeContact && dockState === "idle" && (
          <div className="mb-4 rounded-md border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
            Select a contact to call.
          </div>
        )}

        {/* Settings panel (device + number pickers) */}
        {(showSettings || dockState === "ready") && (
          <div className="mb-3 space-y-3">
            <label className="block text-xs font-medium text-slate-600">
              Call from
              <select
                value={selectedFromNumber}
                onChange={(e) => setSelectedFromNumber(e.target.value)}
                disabled={dockState !== "ready" && dockState !== "idle"}
                className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 disabled:bg-slate-50 disabled:text-slate-400"
              >
                {orgNumbers.length === 0 && <option value="">No numbers</option>}
                {orgNumbers.map((n) => (
                  <option key={n.id} value={n.number}>
                    {n.number}
                    {n.friendly_name ? ` — ${n.friendly_name}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-slate-600">
              Microphone
              <select
                value={selectedMicId}
                onChange={(e) => setSelectedMicId(e.target.value)}
                disabled={dockState !== "ready" && dockState !== "idle"}
                className="mt-1 block w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 disabled:bg-slate-50 disabled:text-slate-400"
              >
                {mics.length === 0 && <option value="">No microphones</option>}
                {mics.map((m) => (
                  <option key={m.deviceId} value={m.deviceId}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {/* Ready: confirm-dial button */}
        {dockState === "ready" && (
          <button
            onClick={startCall}
            disabled={!selectedFromNumber || !activeContact}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:bg-slate-300"
          >
            <Phone className="h-4 w-4" />
            Call
          </button>
        )}

        {/* Dialing: spinner + hangup */}
        {dockState === "dialing" && (
          <div className="flex flex-col items-center gap-3 py-4">
            <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
            <div className="text-sm text-slate-600">{statusLabel}</div>
            <button
              onClick={endCall}
              className="flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
            >
              <PhoneOff className="h-4 w-4" />
              Cancel
            </button>
          </div>
        )}

        {/* Connected: mute, keypad, hangup */}
        {dockState === "connected" && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              {DTMF_KEYS.flat().map((digit) => (
                <button
                  key={digit}
                  onClick={() => sendDtmf(digit)}
                  className="rounded-md border border-slate-200 bg-white py-2.5 text-base font-semibold text-slate-900 hover:bg-slate-50 active:bg-slate-100"
                >
                  {digit}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={toggleMute}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium",
                  micMuted
                    ? "border-red-200 bg-red-50 text-red-700"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                )}
              >
                {micMuted ? (
                  <MicOff className="h-4 w-4" />
                ) : (
                  <Mic className="h-4 w-4" />
                )}
                {micMuted ? "Unmute" : "Mute"}
              </button>
              <button
                onClick={endCall}
                className="flex flex-1 items-center justify-center gap-2 rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                <PhoneOff className="h-4 w-4" />
                End
              </button>
            </div>
          </div>
        )}

        {/* Ending */}
        {dockState === "ending" && (
          <div className="flex items-center justify-center gap-2 py-4 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Ending call...
          </div>
        )}

        {/* Error retry */}
        {dockState === "error" && (
          <button
            onClick={() => {
              setErrorMsg(null);
              setDockState(activeContact ? "ready" : "idle");
            }}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Delete className="h-4 w-4" />
            Dismiss
          </button>
        )}

        {/* Compliance footer */}
        <div className="mt-3 flex items-start gap-1.5 text-[11px] leading-tight text-slate-500">
          <Info className="mt-0.5 h-3 w-3 shrink-0" />
          <span>
            Calls are recorded and transcribed. You must disclose recording to
            the other party at the start of every call.
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────

/**
 * Clamp a proposed dock position to the viewport with a small inset so the
 * dock can't be dragged off-screen. We use the passed width/height hints
 * (varies between expanded dock and idle pill) rather than measuring the
 * real element — measuring during drag would force layout on every frame.
 */
function clampToViewport(
  pos: DockPosition,
  width: number,
  height: number,
): DockPosition {
  if (typeof window === "undefined") return pos;
  const inset = 8; // keep a tiny gap from the viewport edges
  const maxX = Math.max(inset, window.innerWidth - width - inset);
  const maxY = Math.max(inset, window.innerHeight - height - inset);
  return {
    x: Math.max(inset, Math.min(pos.x, maxX)),
    y: Math.max(inset, Math.min(pos.y, maxY)),
  };
}
