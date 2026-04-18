"use client";

import { useState, useEffect, useMemo } from "react";
import { BarChart3, TrendingUp, Phone, Users, Calendar, Download, Bot } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, CartesianGrid,
} from "recharts";

interface Stats {
  totalContacts: number;
  totalCalls: number;
  totalAppointments: number;
  answeredCalls: number;
  avgCallDuration: number;
  callsThisWeek: number;
  contactsThisWeek: number;
}

interface CallRow {
  id: string;
  status: string;
  outcome: string | null;
  duration_seconds: number;
  created_at: string;
  ai_agent_id: string | null;
  sentiment: string | null;
}

interface AgentRow {
  id: string;
  name: string;
}

function StatCard({ label, value, sub, icon: Icon, color }: { label: string; value: string | number; sub?: string; icon: React.ElementType; color: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
          <p className="mt-2 text-3xl font-bold text-white">{value}</p>
          {sub && <p className="mt-1 text-xs text-zinc-600">{sub}</p>}
        </div>
        <Icon className={`h-5 w-5 mt-0.5 ${color}`} />
      </div>
    </div>
  );
}

const CHART_COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];
const tooltipStyle = { backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: 8 };

export default function ReportingPage() {
  const [range, setRange] = useState<"7d" | "30d" | "90d">("30d");
  const [stats, setStats] = useState<Stats>({ totalContacts: 0, totalCalls: 0, totalAppointments: 0, answeredCalls: 0, avgCallDuration: 0, callsThisWeek: 0, contactsThisWeek: 0 });
  const [callRows, setCallRows] = useState<CallRow[]>([]);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      const supabase = createClient();
      const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
      const since = new Date(Date.now() - days * 86400000).toISOString();
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();

      const [contacts, calls, appointments, agentsRes] = await Promise.all([
        supabase.from("contacts").select("id", { count: "exact", head: true }).gte("created_at", since),
        supabase.from("calls").select("id, status, outcome, duration_seconds, created_at, ai_agent_id, sentiment").gte("created_at", since).order("created_at", { ascending: true }),
        supabase.from("appointments").select("id", { count: "exact", head: true }).gte("created_at", since),
        supabase.from("ai_agents").select("id, name"),
      ]);

      const callList = (calls.data || []) as CallRow[];
      const answered = callList.filter(c => c.status === "completed" || c.status === "answered");
      const avgDur = answered.length > 0 ? Math.round(answered.reduce((s, c) => s + (c.duration_seconds || 0), 0) / answered.length) : 0;
      const weekCalls = callList.filter(c => c.created_at >= weekAgo).length;

      setCallRows(callList);
      setAgents((agentsRes.data || []) as AgentRow[]);
      setStats({
        totalContacts: contacts.count || 0,
        totalCalls: callList.length,
        totalAppointments: appointments.count || 0,
        answeredCalls: answered.length,
        avgCallDuration: avgDur,
        callsThisWeek: weekCalls,
        contactsThisWeek: 0,
      });
      setLoading(false);
    };
    fetchStats();
  }, [range]);

  // ---- Derived chart data ----

  // Call volume by day
  const volumeByDay = useMemo(() => {
    const map: Record<string, { date: string; calls: number; answered: number; appointments: number }> = {};
    for (const c of callRows) {
      const day = c.created_at.slice(0, 10);
      if (!map[day]) map[day] = { date: day, calls: 0, answered: 0, appointments: 0 };
      map[day].calls++;
      if (c.status === "completed" || c.status === "answered") map[day].answered++;
      if (c.outcome === "appointment_booked") map[day].appointments++;
    }
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
  }, [callRows]);

  // Outcome breakdown (pie chart)
  const outcomePie = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of callRows) {
      const key = c.outcome || c.status || "unknown";
      map[key] = (map[key] || 0) + 1;
    }
    return Object.entries(map).map(([name, value]) => ({
      name: name.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase()),
      value,
    })).sort((a, b) => b.value - a.value);
  }, [callRows]);

  // Agent performance
  const agentPerf = useMemo(() => {
    const map: Record<string, { name: string; calls: number; answered: number; appointments: number; totalDur: number }> = {};
    for (const c of callRows) {
      const aid = c.ai_agent_id || "no-agent";
      if (!map[aid]) {
        const agent = agents.find(a => a.id === aid);
        map[aid] = { name: agent?.name || "Manual", calls: 0, answered: 0, appointments: 0, totalDur: 0 };
      }
      map[aid].calls++;
      if (c.status === "completed" || c.status === "answered") map[aid].answered++;
      if (c.outcome === "appointment_booked") map[aid].appointments++;
      map[aid].totalDur += c.duration_seconds || 0;
    }
    return Object.values(map).sort((a, b) => b.calls - a.calls);
  }, [callRows, agents]);

  // Sentiment breakdown
  const sentimentData = useMemo(() => {
    const map: Record<string, number> = { positive: 0, neutral: 0, negative: 0 };
    for (const c of callRows) {
      if (c.sentiment && map[c.sentiment] !== undefined) map[c.sentiment]++;
    }
    return Object.entries(map).filter(([, v]) => v > 0).map(([name, value]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1), value,
    }));
  }, [callRows]);

  const answerRate = stats.totalCalls > 0 ? Math.round((stats.answeredCalls / stats.totalCalls) * 100) : 0;
  const fmtDur = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Reporting</h1>
          <p className="text-zinc-400">Analytics and performance metrics</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-zinc-800 bg-zinc-900 p-0.5">
            {(["7d","30d","90d"] as const).map(r => (
              <button key={r} onClick={() => setRange(r)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${range === r ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-200"}`}>
                {r === "7d" ? "7 days" : r === "30d" ? "30 days" : "90 days"}
              </button>
            ))}
          </div>
          <button className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-400 hover:text-white">
            <Download className="h-4 w-4" />Export
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-zinc-500">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-600 border-t-indigo-500 mr-2" />Loading…
        </div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Total Contacts" value={stats.totalContacts} sub={`Last ${range}`} icon={Users} color="text-indigo-400" />
            <StatCard label="Total Calls" value={stats.totalCalls} sub={`${stats.callsThisWeek} this week`} icon={Phone} color="text-blue-400" />
            <StatCard label="Answer Rate" value={`${answerRate}%`} sub={`${stats.answeredCalls} answered`} icon={TrendingUp} color="text-emerald-400" />
            <StatCard label="Appointments" value={stats.totalAppointments} sub={`Last ${range}`} icon={Calendar} color="text-purple-400" />
          </div>

          {/* Call Volume Chart */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white">Call Volume</h3>
              <div className="flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-indigo-500" />Calls</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" />Answered</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-purple-500" />Appointments</span>
              </div>
            </div>
            {volumeByDay.length === 0 ? (
              <div className="flex h-48 items-center justify-center text-zinc-600 text-sm">No call data for this period</div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={volumeByDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis dataKey="date" tick={{ fill: "#71717a", fontSize: 11 }} tickFormatter={(v: string) => v.slice(5)} />
                  <YAxis tick={{ fill: "#71717a", fontSize: 11 }} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: "#a1a1aa" }} />
                  <Area type="monotone" dataKey="calls" stroke="#6366f1" fill="#6366f1" fillOpacity={0.15} strokeWidth={2} />
                  <Area type="monotone" dataKey="answered" stroke="#10b981" fill="#10b981" fillOpacity={0.1} strokeWidth={2} />
                  <Area type="monotone" dataKey="appointments" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.1} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-2 gap-4">
            {/* Outcome pie */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-white">Call Outcomes</h3>
                <BarChart3 className="h-4 w-4 text-zinc-600" />
              </div>
              {outcomePie.length === 0 ? (
                <div className="flex h-48 items-center justify-center text-zinc-600 text-sm">No data</div>
              ) : (
                <div className="flex items-center">
                  <ResponsiveContainer width="50%" height={200}>
                    <PieChart>
                      <Pie data={outcomePie} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={2}>
                        {outcomePie.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-1.5">
                    {outcomePie.slice(0, 6).map((o, i) => (
                      <div key={o.name} className="flex items-center gap-2 text-xs">
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                        <span className="text-zinc-400 truncate">{o.name}</span>
                        <span className="ml-auto text-white font-medium">{o.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="pt-2 border-t border-zinc-800 mt-2">
                <p className="text-xs text-zinc-500">Avg call duration: <span className="text-white font-medium">{fmtDur(stats.avgCallDuration)}</span></p>
              </div>
            </div>

            {/* Conversion funnel */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">Conversion Funnel</h3>
                <TrendingUp className="h-4 w-4 text-zinc-600" />
              </div>
              <div className="space-y-3">
                {[
                  { label: "Contacts", value: stats.totalContacts, color: "bg-indigo-500", width: 100 },
                  { label: "Called", value: stats.totalCalls, color: "bg-blue-500", width: stats.totalContacts > 0 ? (stats.totalCalls / stats.totalContacts) * 100 : 0 },
                  { label: "Answered", value: stats.answeredCalls, color: "bg-emerald-500", width: stats.totalContacts > 0 ? (stats.answeredCalls / stats.totalContacts) * 100 : 0 },
                  { label: "Appointments", value: stats.totalAppointments, color: "bg-purple-500", width: stats.totalContacts > 0 ? (stats.totalAppointments / stats.totalContacts) * 100 : 0 },
                ].map(f => (
                  <div key={f.label} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-zinc-400">{f.label}</span>
                      <span className="text-white font-medium">{f.value}</span>
                    </div>
                    <div className="h-2 rounded-full bg-zinc-800">
                      <div className={`h-2 rounded-full ${f.color}`} style={{ width: `${Math.min(f.width, 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Sentiment mini chart */}
              {sentimentData.length > 0 && (
                <div className="pt-3 border-t border-zinc-800">
                  <p className="text-xs font-medium text-zinc-500 mb-2">Sentiment Breakdown</p>
                  <div className="flex gap-3">
                    {sentimentData.map(s => (
                      <div key={s.name} className="flex-1 text-center">
                        <p className="text-lg font-bold text-white">{s.value}</p>
                        <p className={`text-[10px] font-medium ${s.name === "Positive" ? "text-emerald-400" : s.name === "Negative" ? "text-red-400" : "text-amber-400"}`}>{s.name}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Agent Performance */}
          {agentPerf.length > 0 && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-white">Agent Performance</h3>
                <Bot className="h-4 w-4 text-zinc-600" />
              </div>
              {agentPerf.length <= 3 ? (
                <div className="grid grid-cols-3 gap-4">
                  {agentPerf.map(a => {
                    const rate = a.calls > 0 ? Math.round((a.answered / a.calls) * 100) : 0;
                    const avgD = a.answered > 0 ? Math.round(a.totalDur / a.answered) : 0;
                    return (
                      <div key={a.name} className="rounded-lg border border-zinc-800 bg-zinc-800/30 p-4 space-y-3">
                        <p className="text-sm font-medium text-white">{a.name}</p>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div><p className="text-zinc-500">Calls</p><p className="text-white font-bold text-lg">{a.calls}</p></div>
                          <div><p className="text-zinc-500">Answer Rate</p><p className="text-white font-bold text-lg">{rate}%</p></div>
                          <div><p className="text-zinc-500">Appointments</p><p className="text-white font-bold text-lg">{a.appointments}</p></div>
                          <div><p className="text-zinc-500">Avg Duration</p><p className="text-white font-bold text-lg">{fmtDur(avgD)}</p></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={agentPerf}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis dataKey="name" tick={{ fill: "#71717a", fontSize: 11 }} />
                    <YAxis tick={{ fill: "#71717a", fontSize: 11 }} allowDecimals={false} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="calls" fill="#6366f1" radius={[4, 4, 0, 0]} name="Calls" />
                    <Bar dataKey="answered" fill="#10b981" radius={[4, 4, 0, 0]} name="Answered" />
                    <Bar dataKey="appointments" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="Appointments" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          )}

          {/* Summary */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
            <h3 className="text-sm font-semibold text-white mb-4">Performance Summary</h3>
            <div className="grid grid-cols-3 gap-6">
              {[
                { label: "Contacts per day", value: stats.totalContacts > 0 ? (stats.totalContacts / (range === "7d" ? 7 : range === "30d" ? 30 : 90)).toFixed(1) : "0" },
                { label: "Calls per contact", value: stats.totalContacts > 0 ? (stats.totalCalls / stats.totalContacts).toFixed(1) : "0" },
                { label: "Appt. conversion rate", value: stats.answeredCalls > 0 ? `${Math.round((stats.totalAppointments / stats.answeredCalls) * 100)}%` : "0%" },
              ].map(s => (
                <div key={s.label} className="text-center">
                  <p className="text-2xl font-bold text-white">{s.value}</p>
                  <p className="text-xs text-zinc-500 mt-1">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
