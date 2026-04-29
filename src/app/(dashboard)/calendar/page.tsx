"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppointments } from "@/hooks/use-appointments";
import { AppointmentDialog } from "./appointment-dialog";
import { CalcomCard } from "@/components/calendar/CalcomCard";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    scheduled: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    completed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    cancelled: "bg-red-500/10 text-red-400 border-red-500/20",
    "no-show": "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  };
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize", map[status] || map.scheduled)}>
      {status.replace(/-/g, " ")}
    </span>
  );
}

export default function CalendarPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [showCreate, setShowCreate] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const { appointments, loading, refetch } = useAppointments(month + 1, year);

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = Array.from({ length: firstDay + daysInMonth }, (_, i) => i >= firstDay ? i - firstDay + 1 : null);

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); };

  const apptsByDay: Record<number, typeof appointments> = {};
  appointments.forEach((a) => {
    // appointment_date is "YYYY-MM-DD" — parse as local date, NOT through new Date()
    // (which interprets it as UTC midnight and shifts to previous day in negative-UTC zones).
    const d = Number(a.appointment_date.split("-")[2]);
    if (!apptsByDay[d]) apptsByDay[d] = [];
    apptsByDay[d].push(a);
  });

  const upcoming = appointments
    .filter((a) => new Date(a.appointment_date) >= today && a.status !== "cancelled")
    .sort((a, b) => new Date(a.appointment_date).getTime() - new Date(b.appointment_date).getTime())
    .slice(0, 8);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Calendar</h1>
          <p className="text-zinc-400">Appointments and scheduling</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
          <Plus className="h-4 w-4" />New Appointment
        </button>
      </div>

      <div className="flex gap-6">
        {/* Calendar grid */}
        <div className="flex-1 rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
          {/* Month nav */}
          <div className="flex items-center justify-between mb-5">
            <button onClick={prevMonth} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <h2 className="text-base font-semibold text-white">{MONTHS[month]} {year}</h2>
            <button onClick={nextMonth} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white">
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
          {/* Day headers */}
          <div className="grid grid-cols-7 mb-2">
            {DAYS.map((d) => (
              <div key={d} className="py-1.5 text-center text-xs font-medium uppercase tracking-wide text-zinc-600">{d}</div>
            ))}
          </div>
          {/* Calendar cells */}
          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, i) => {
              if (!day) return <div key={i} />;
              const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
              const dayAppts = apptsByDay[day] || [];
              return (
                <div key={day} onClick={() => { setSelectedDate(`${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`); }}
                  className={cn("min-h-[72px] rounded-lg p-1.5 cursor-pointer transition-colors hover:bg-zinc-800/50",
                    isToday ? "bg-indigo-600/10 border border-indigo-500/30" : "border border-transparent")}>
                  <span className={cn("flex h-6 w-6 items-center justify-center rounded-full text-sm font-medium",
                    isToday ? "bg-indigo-600 text-white" : "text-zinc-400")}>
                    {day}
                  </span>
                  <div className="mt-1 space-y-0.5">
                    {dayAppts.slice(0, 2).map((a) => (
                      <div key={a.id} className="truncate rounded bg-indigo-600/20 px-1 py-0.5 text-xs text-indigo-400">
                        {a.start_time} {a.title || "Appt"}
                      </div>
                    ))}
                    {dayAppts.length > 2 && (
                      <p className="text-xs text-zinc-600">+{dayAppts.length - 2} more</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Upcoming sidebar */}
        <div className="w-64 shrink-0 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <h3 className="text-sm font-semibold text-white mb-3">Upcoming</h3>
          {loading ? (
            <div className="flex items-center justify-center py-8 text-zinc-600 text-sm">Loading...</div>
          ) : upcoming.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-zinc-600 text-center">
              <Clock className="h-8 w-8 mb-2" />
              <p className="text-xs">No upcoming appointments</p>
            </div>
          ) : (
            <div className="space-y-2">
              {upcoming.map((a) => (
                <div key={a.id} className="rounded-lg border border-zinc-800 p-3 space-y-1.5 hover:border-zinc-700 transition-colors">
                  <p className="text-sm font-medium text-white">{a.title || "Appointment"}</p>
                  <p className="text-xs text-zinc-500">
                    {new Date(a.appointment_date).toLocaleDateString()} · {a.start_time}
                  </p>
                  <StatusBadge status={a.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Calendar integrations */}
      <div className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-zinc-300">Integrations</h2>
          <p className="text-xs text-zinc-500">Connect external calendars so AI agent bookings sync automatically.</p>
        </div>
        <CalcomCard />
      </div>

      {showCreate && (
        <AppointmentDialog appointment={null}
          selectedDate={selectedDate || undefined}
          onClose={() => { setShowCreate(false); setSelectedDate(null); }}
          onSaved={() => { setShowCreate(false); setSelectedDate(null); refetch(); }}
        />
      )}
    </div>
  );
}
