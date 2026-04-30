"use client";

/**
 * AppointmentEventCard — Phase 3c
 *
 * Renders an Appointment row from the appointments table as a timeline
 * card. Combines appointment_date + start_time into a human-readable
 * "booked for {weekday}, {month} {day} at {time}".
 */

import { Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Appointment } from "@/types/database";

const APPT_STATUS_STYLES: Record<string, string> = {
  scheduled: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  confirmed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  completed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  cancelled: "bg-red-500/10 text-red-400 border-red-500/20",
  no_show:   "bg-amber-500/10 text-amber-400 border-amber-500/20",
};

function bookedByLabel(rawValue: string): string {
  if (rawValue === "ai_agent") return "AI agent";
  if (rawValue === "user") return "user";
  if (rawValue === "team") return "team";
  return rawValue;
}

function formatApptDateTime(dateStr: string, timeStr: string): string {
  // dateStr is "YYYY-MM-DD"; timeStr is "HH:MM" or "HH:MM:SS".
  // We render in the user's browser timezone for friendliness.
  // Safari struggles with bare "YYYY-MM-DD HH:MM" — use ISO with 'T'.
  const iso = `${dateStr}T${timeStr.length === 5 ? timeStr + ":00" : timeStr}`;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return `${dateStr} ${timeStr}`;
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

interface Props {
  appointment: Appointment;
  relativeTime: string;
}

export function AppointmentEventCard({ appointment, relativeTime }: Props) {
  const when = formatApptDateTime(appointment.appointment_date, appointment.start_time);
  const status = appointment.status ?? "scheduled";
  const statusClass = APPT_STATUS_STYLES[status] ?? APPT_STATUS_STYLES.scheduled;
  const title = appointment.title ?? "Meeting";

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 hover:border-zinc-700 transition-colors">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-violet-500/10 border border-violet-500/20 flex items-center justify-center flex-shrink-0">
          <Calendar size={13} className="text-violet-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-white">{title}</p>
              <p className="text-xs text-zinc-400 mt-0.5">{when}</p>
            </div>
            <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize", statusClass)}>
              {status.replace(/_/g, " ")}
            </span>
          </div>
          <p className="text-xs text-zinc-500 mt-1.5">
            Booked by {bookedByLabel(appointment.booked_by)} · {relativeTime}
          </p>
        </div>
      </div>
    </div>
  );
}
