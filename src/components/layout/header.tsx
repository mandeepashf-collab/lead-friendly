"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, PhoneCall, X as CloseIcon } from "lucide-react";
import { useSidebarStore } from "@/store/sidebar";
import { cn } from "@/lib/utils";
import { NotificationPanel } from "@/components/layout/notification-panel";
import { UserMenu } from "@/components/layout/user-menu";
import { CommandPalette } from "@/components/layout/command-palette";
import { QuickAdd } from "@/components/layout/quick-add";
import InitiateCallModal from "@/components/calls/InitiateCallModal";

function SoftphoneButton() {
  const [open, setOpen] = useState(false);
  const [number, setNumber] = useState("");
  const [dialedNumber, setDialedNumber] = useState<string | null>(null);
  const KEYS = ["1","2","3","4","5","6","7","8","9","*","0","#"];
  const SUB: Record<string,string> = {"1":"","2":"ABC","3":"DEF","4":"GHI","5":"JKL","6":"MNO","7":"PQRS","8":"TUV","9":"WXYZ","*":"","0":"+","#":""};

  const normalizeToE164 = useCallback((raw: string): string | null => {
    const digits = raw.replace(/\D/g, "");
    if (raw.startsWith("+") && digits.length >= 10) return `+${digits}`;
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
    return null;
  }, []);

  const handleCall = useCallback(() => {
    const e164 = normalizeToE164(number);
    if (!e164) return;
    // Close dialpad FIRST, then open modal. Same tick but explicit for clarity.
    setOpen(false);
    setDialedNumber(e164);
  }, [number, normalizeToE164]);

  // Keyboard input while dialpad is open:
  //   digits 0-9 → append, * and # → append, Backspace → delete last,
  //   Enter → call, Escape → close dialpad.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      // Ignore if the user is typing in an input/textarea elsewhere
      const target = e.target as HTMLElement | null;
      const inField = target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
      if (inField) return;

      if (/^[0-9]$/.test(e.key) || e.key === "*" || e.key === "#") {
        e.preventDefault();
        setNumber((p) => p + e.key);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        setNumber((p) => p.slice(0, -1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        handleCall();
      } else if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, handleCall]);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title={open ? "Close dialpad" : "Open dialpad"}
        className={cn(
          "relative z-50 w-9 h-9 rounded-full flex items-center justify-center transition-colors",
          open ? "bg-emerald-600 text-white" : "bg-zinc-800 hover:bg-zinc-700 text-zinc-400",
        )}
      >
        <PhoneCall className="h-4 w-4" />
      </button>
      {open && (
        <>
          {/* Backdrop — click anywhere outside the dialpad to close */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-11 z-50 w-72 bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/60">
              <div>
                <p className="text-xs text-zinc-500">Dialpad</p>
                <p className="text-[10px] text-zinc-600">Type or tap · Enter to call · Esc to close</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                title="Close (Esc)"
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>
            <div className="px-4 pt-4 pb-2 min-h-[48px]">
              <span className="text-2xl font-mono text-white tracking-wider">{number || <span className="text-zinc-600 text-base">Enter number</span>}</span>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-3 gap-2 mb-4">
                {KEYS.map(key => (
                  <button key={key} onClick={() => setNumber(p => p + key)}
                    className="flex flex-col items-center justify-center py-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 transition-colors">
                    <span className="text-lg font-medium text-white leading-none">{key}</span>
                    <span className="text-[9px] text-zinc-600 mt-0.5 tracking-widest">{SUB[key]}</span>
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleCall}
                  disabled={!normalizeToE164(number)}
                  title="Start a call (Enter)"
                  className="flex-1 py-3.5 rounded-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-30 disabled:bg-zinc-800 text-white flex items-center justify-center transition-colors"
                >
                  <PhoneCall className="h-5 w-5" />
                </button>
                {number && (
                  <button onClick={() => setNumber(p => p.slice(0,-1))}
                    title="Delete last digit (Backspace)"
                    className="w-12 py-3.5 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-400 flex items-center justify-center transition-colors">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M3 12l6.414 6.414a2 2 0 001.414.586H19a2 2 0 002-2V7a2 2 0 00-2-2h-8.172a2 2 0 00-1.414.586L3 12z"/></svg>
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}
      {dialedNumber && (
        <InitiateCallModal
          contactName="Dialed number"
          contactPhone={dialedNumber}
          onClose={() => { setDialedNumber(null); setNumber(""); }}
          onCallStarted={() => { setDialedNumber(null); setNumber(""); }}
        />
      )}
    </div>
  );
}

export function Header() {
  const { isCollapsed } = useSidebarStore();
  const [paletteOpen, setPaletteOpen] = useState(false);

  // ⌘K / Ctrl+K opens command palette
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  return (
    <>
      <header
        className={cn(
          "sticky top-0 z-40 flex h-16 items-center justify-between border-b border-zinc-800 bg-zinc-950/80 px-6 backdrop-blur-sm transition-all",
          isCollapsed ? "ml-16" : "ml-64"
        )}
      >
        {/* Search trigger */}
        <div className="flex flex-1 items-center gap-4">
          <button
            onClick={() => setPaletteOpen(true)}
            className="relative flex max-w-md flex-1 items-center"
            aria-label="Open search"
          >
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500 pointer-events-none" />
            <div className="h-9 w-full rounded-lg border border-zinc-800 bg-zinc-900 pl-10 pr-4 text-sm text-zinc-600 flex items-center hover:border-zinc-700 transition-colors cursor-pointer">
              Quick search… <span className="ml-auto text-xs text-zinc-700 font-mono">⌘K</span>
            </div>
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <QuickAdd />
          <SoftphoneButton />
          <NotificationPanel />
          <UserMenu initials="MS" name="Mandeep" />
        </div>
      </header>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </>
  );
}
