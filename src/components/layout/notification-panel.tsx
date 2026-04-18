"use client";

import { useState, useRef, useEffect } from "react";
import { Bell, X, CheckCheck, Phone, Calendar, MessageSquare, DollarSign } from "lucide-react";

interface Notification {
  id: string;
  type: "call" | "appointment" | "message" | "payment";
  title: string;
  body: string;
  time: string;
  read: boolean;
}

const MOCK: Notification[] = [
  { id: "1", type: "call",        title: "Missed Call",           body: "Sarah Johnson called — no answer",       time: "2m ago",  read: false },
  { id: "2", type: "appointment", title: "Appointment Reminder",  body: "Demo with Mike Chen in 30 minutes",      time: "28m ago", read: false },
  { id: "3", type: "message",     title: "New Message",           body: 'Mike Chen: "What makes yours different?"', time: "1h ago",  read: false },
  { id: "4", type: "payment",     title: "Payment Received",      body: "$1,200 from Acme Corp",                  time: "3h ago",  read: true  },
  { id: "5", type: "call",        title: "Call Completed",        body: "12 min call with Lisa Park",             time: "5h ago",  read: true  },
];

const ICON = {
  call:        <Phone        className="h-4 w-4 text-blue-400"   />,
  appointment: <Calendar     className="h-4 w-4 text-purple-400" />,
  message:     <MessageSquare className="h-4 w-4 text-emerald-400" />,
  payment:     <DollarSign   className="h-4 w-4 text-amber-400"  />,
};

export function NotificationPanel() {
  const [open, setOpen]           = useState(false);
  const [items, setItems]         = useState(MOCK);
  const ref                       = useRef<HTMLDivElement>(null);
  const unread                    = items.filter(n => !n.read).length;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const markRead    = (id: string) => setItems(p => p.map(n => n.id === id ? { ...n, read: true } : n));
  const markAllRead = ()           => setItems(p => p.map(n => ({ ...n, read: true })));

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className="relative rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-50 w-96 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-indigo-400" />
              <span className="text-sm font-semibold text-white">Notifications</span>
              {unread > 0 && (
                <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-bold text-white">{unread} new</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {unread > 0 && (
                <button onClick={markAllRead} className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300">
                  <CheckCheck className="h-3 w-3" /> Mark all read
                </button>
              )}
              <button onClick={() => setOpen(false)} className="text-zinc-600 hover:text-zinc-300">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-80 divide-y divide-zinc-800/50 overflow-y-auto">
            {items.map(n => (
              <div
                key={n.id}
                onClick={() => markRead(n.id)}
                className={`flex cursor-pointer gap-3 px-4 py-3 transition-colors hover:bg-zinc-900 ${!n.read ? "bg-indigo-950/20" : ""}`}
              >
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-800">
                  {ICON[n.type]}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className={`truncate text-sm font-medium ${!n.read ? "text-white" : "text-zinc-300"}`}>{n.title}</p>
                    <span className="shrink-0 text-xs text-zinc-600">{n.time}</span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-zinc-500">{n.body}</p>
                </div>
                {!n.read && <div className="mt-2 h-2 w-2 shrink-0 rounded-full bg-indigo-500" />}
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="border-t border-zinc-800 px-4 py-2 text-center">
            <button className="text-xs text-indigo-400 hover:text-indigo-300">View all notifications</button>
          </div>
        </div>
      )}
    </div>
  );
}
