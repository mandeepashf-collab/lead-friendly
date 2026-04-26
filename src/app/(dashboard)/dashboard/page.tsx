"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Users,
  Phone,
  Calendar,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  Bot,
  Clock,
  X,
  ArrowRight,
  PhoneCall,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useBrand } from "@/contexts/BrandContext";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

interface Stat {
  name: string;
  value: string;
  change: string;
  trend: "up" | "down";
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}

interface DashCall {
  id: string;
  status: string;
  outcome: string | null;
  duration_seconds: number;
  created_at: string;
  ai_agent_id: string | null;
  contacts: {
    first_name: string;
    last_name: string;
  } | null;
}

interface Appointment {
  id: string;
  title: string | null;
  appointment_date: string;
  start_time: string;
  end_time: string;
  status: string;
  contacts: { first_name: string | null; last_name: string | null } | null;
}

export default function DashboardPage() {
  const brand = useBrand();
  const router = useRouter();

  // First-login redirect
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const [contacts, agents, campaigns] = await Promise.all([
          supabase.from("contacts").select("id", { head: true, count: "exact" }).limit(1),
          supabase.from("ai_agents").select("id", { head: true, count: "exact" }).limit(1),
          supabase.from("campaigns").select("id", { head: true, count: "exact" }).limit(1),
        ]);
        const totalRows =
          (contacts.count || 0) + (agents.count || 0) + (campaigns.count || 0);
        if (!cancelled && totalRows === 0) {
          const dismissed =
            typeof window !== "undefined"
              ? window.sessionStorage.getItem("lf-skip-launchpad") === "1"
              : false;
          if (!dismissed) router.replace("/launchpad");
        }
      } catch {
        /* non-fatal */
      }
    })();
    return () => { cancelled = true; };
  }, [router]);

  const [stats, setStats] = useState<Stat[]>([
    { name: "Total Contacts", value: "0", change: "+0%", trend: "up", icon: Users, color: "bg-indigo-600/10 text-indigo-400" },
    { name: "Calls Today", value: "0", change: "+0%", trend: "up", icon: Phone, color: "bg-emerald-600/10 text-emerald-400" },
    { name: "Appointments", value: "0", change: "+0%", trend: "up", icon: Calendar, color: "bg-cyan-600/10 text-cyan-400" },
    { name: "Pipeline Value", value: "$0", change: "+0%", trend: "up", icon: DollarSign, color: "bg-amber-600/10 text-amber-400" },
    { name: "AI Minutes Used", value: "0", change: "+0%", trend: "up" as const, icon: Bot, color: "bg-violet-600/10 text-violet-400" },
  ]);
  const [recentCalls, setRecentCalls] = useState<DashCall[]>([]);
  const [weekCalls, setWeekCalls] = useState<{ created_at: string; outcome: string | null }[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [activeCampaigns, setActiveCampaigns] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [setupComplete, setSetupComplete] = useState(0);
  const [totalSteps, setTotalSteps] = useState(7);
  const [bannerDismissed, setBannerDismissed] = useState(true);

  useEffect(() => {
    async function fetchDashboardData() {
      try {
        const supabase = createClient();
        const today = new Date().toISOString().split("T")[0];
        const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();

        // Pull call stats from the unified source (call_stats_by_org view)
        // so Dashboard agrees with Call Logs / AI Agents / Billing.
        const unifiedStatsPromise = fetch("/api/stats/calls", { cache: "no-store" })
          .then(r => (r.ok ? r.json() : null))
          .catch(() => null);

        const [
          contactsRes, oppsRes, recentCallsRes,
          appointmentsRes, campaignsRes, weekCallsRes,
          unifiedStats,
        ] = await Promise.all([
          supabase.from("contacts").select("id", { count: "exact", head: true }),
          supabase.from("opportunities").select("value"),
          supabase.from("calls")
            .select("id, status, outcome, duration_seconds, created_at, ai_agent_id, contacts:contact_id(first_name, last_name)")
            .order("created_at", { ascending: false }).limit(10),
          supabase.from("appointments")
            .select("id, title, appointment_date, start_time, end_time, status, contacts:contact_id(first_name, last_name)")
            .gte("appointment_date", today)
            .order("appointment_date", { ascending: true }).order("start_time", { ascending: true }).limit(5),
          supabase.from("campaigns").select("id", { count: "exact", head: true }).eq("status", "active"),
          supabase.from("calls").select("created_at, outcome").gte("created_at", weekAgo),
          unifiedStatsPromise,
        ]);

        const contactCount = contactsRes.count || 0;
        const callsToday = unifiedStats?.calls_today ?? 0;
        const pipelineValue = (oppsRes.data || []).reduce((sum: number, o: { value?: number }) => sum + (o.value || 0), 0);
        const totalMins = unifiedStats?.minutes_this_month ?? 0;

        // Appointments booked (all time) — keep separate since it's not in the call_stats view
        const { count: apptCount } = await supabase.from("appointments").select("id", { count: "exact", head: true });

        setStats((prev) => [
          { ...prev[0], value: String(contactCount) },
          { ...prev[1], value: String(callsToday) },
          { ...prev[2], value: String(apptCount || 0) },
          { ...prev[3], value: `$${pipelineValue.toLocaleString()}` },
          { ...prev[4], value: String(totalMins) },
        ]);

        const formattedCalls = (recentCallsRes.data || []).map((c: Record<string, unknown>) => ({
          ...c,
          contacts: Array.isArray(c.contacts) ? (c.contacts as Record<string, unknown>[])[0] || null : c.contacts,
        }));
        setRecentCalls(formattedCalls as DashCall[]);
        setActiveCampaigns(campaignsRes.count || 0);

        const formattedAppts = (appointmentsRes.data || []).map((a: Record<string, unknown>) => ({
          ...a,
          contacts: Array.isArray(a.contacts) ? (a.contacts as Record<string, unknown>[])[0] || null : a.contacts,
        }));
        setAppointments(formattedAppts as Appointment[]);
        setWeekCalls((weekCallsRes.data || []) as { created_at: string; outcome: string | null }[]);
      } catch (error) {
        console.error("Error fetching dashboard data:", error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchDashboardData();

    // Check launchpad progress. Total step count must mirror /launchpad's
    // logic — paid users (active sub or in-trial) skip step 5 (Choose plan),
    // landing on 6 total instead of 7.
    async function checkSetup() {
      try {
        const supabase = createClient();
        const [c, a, cl, ca, org] = await Promise.all([
          supabase.from("contacts").select("id").limit(1),
          supabase.from("ai_agents").select("id").limit(1),
          supabase.from("calls").select("id").limit(1),
          supabase.from("campaigns").select("id").limit(1),
          supabase.from("organizations").select("subscription_status, trial_ends_at").limit(1).maybeSingle(),
        ]);
        let done = 0;
        if ((c.data?.length || 0) > 0) done++;
        if ((a.data?.length || 0) > 0) done++;
        if ((cl.data?.length || 0) > 0) done++;
        if ((ca.data?.length || 0) > 0) done++;
        setSetupComplete(done);

        const subStatus = org.data?.subscription_status;
        const trialEndsAt = org.data?.trial_ends_at;
        const hasActiveSub =
          subStatus === "active" ||
          subStatus === "trialing" ||
          (!!trialEndsAt && new Date(trialEndsAt) > new Date());
        setTotalSteps(hasActiveSub ? 6 : 7);
      } catch { /* ignore */ }
    }
    checkSetup();

    if (typeof window !== "undefined") {
      setBannerDismissed(localStorage.getItem("lf_launchpad_dismissed") === "true");
    }
  }, []);

  // Weekly call volume chart data
  const chartData = useMemo(() => {
    const map: Record<string, { day: string; calls: number; booked: number }> = {};
    for (const c of weekCalls) {
      const day = c.created_at.slice(0, 10);
      if (!map[day]) map[day] = { day, calls: 0, booked: 0 };
      map[day].calls++;
      if (c.outcome === "appointment_booked") map[day].booked++;
    }
    return Object.values(map).sort((a, b) => a.day.localeCompare(b.day));
  }, [weekCalls]);

  const tooltipStyle = { backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: 8 };

  return (
    <div className="space-y-8">
      {/* Launchpad Banner */}
      {!bannerDismissed && setupComplete < totalSteps && (
        <div className="flex items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="flex-1">
            <p className="text-sm font-medium text-white">Setup guide — {setupComplete} of {totalSteps} steps complete</p>
            <div className="mt-2 h-1.5 w-full max-w-xs rounded-full bg-zinc-800">
              <div className="h-1.5 rounded-full bg-indigo-600 transition-all" style={{ width: `${(setupComplete / totalSteps) * 100}%` }} />
            </div>
          </div>
          <Link href="/launchpad" className="flex items-center gap-1 text-sm font-medium text-indigo-400 hover:text-indigo-300">
            Continue setup <ArrowRight className="h-4 w-4" />
          </Link>
          <button onClick={() => { setBannerDismissed(true); localStorage.setItem("lf_launchpad_dismissed", "true"); }} className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Welcome Header */}
      <div className="rounded-xl bg-gradient-to-r from-indigo-600/20 to-purple-600/20 border border-indigo-500/20 p-6">
        <div className="flex items-center gap-2 text-sm font-medium text-indigo-400">
          <Bot className="h-4 w-4" />
          {brand.brandName.toUpperCase()}
        </div>
        <h1 className="mt-1 text-2xl font-bold text-white">
          Welcome back, Mandeep
        </h1>
        <p className="mt-1 text-zinc-400">
          Your AI sales platform is ready. Here&apos;s your daily briefing.
        </p>
        {activeCampaigns > 0 && (
          <p className="mt-2 text-xs text-indigo-300">{activeCampaigns} active campaign{activeCampaigns !== 1 ? "s" : ""} running</p>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map((stat) => (
          <div key={stat.name} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
            <div className="flex items-center justify-between">
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${stat.color}`}>
                <stat.icon className="h-5 w-5" />
              </div>
              <span className={`flex items-center gap-1 text-xs font-medium ${stat.trend === "up" ? "text-emerald-400" : "text-red-400"}`}>
                {stat.trend === "up" ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                {stat.change}
              </span>
            </div>
            <p className="mt-3 text-2xl font-bold text-white">{stat.value}</p>
            <p className="text-sm text-zinc-500">{stat.name}</p>
          </div>
        ))}
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Call Activity Chart */}
        <div className="col-span-2 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-white">Call Activity</h3>
              <p className="text-sm text-zinc-500">Last 7 days</p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-indigo-500" />Calls</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" />Booked</span>
            </div>
          </div>
          <div className="mt-4">
            {isLoading ? (
              <div className="flex h-48 items-center justify-center text-zinc-600">
                <p className="text-sm">Loading call data...</p>
              </div>
            ) : chartData.length === 0 ? (
              <div className="flex h-48 items-center justify-center text-zinc-600">
                <div className="text-center">
                  <Phone className="mx-auto h-8 w-8" />
                  <p className="mt-2 text-sm">No calls this week</p>
                </div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis dataKey="day" tick={{ fill: "#71717a", fontSize: 11 }} tickFormatter={(v: string) => v.slice(5)} />
                  <YAxis tick={{ fill: "#71717a", fontSize: 11 }} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: "#a1a1aa" }} />
                  <Bar dataKey="calls" fill="#6366f1" radius={[4, 4, 0, 0]} name="Calls" />
                  <Bar dataKey="booked" fill="#10b981" radius={[4, 4, 0, 0]} name="Booked" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Upcoming Appointments */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-white">Upcoming Appointments</h3>
            <Link href="/calendar" className="text-xs text-indigo-400 hover:text-indigo-300">View all</Link>
          </div>
          <p className="text-sm text-zinc-500">Scheduled</p>
          <div className="mt-4 space-y-3">
            {isLoading ? (
              <div className="flex h-48 items-center justify-center text-zinc-600">
                <p className="text-sm">Loading...</p>
              </div>
            ) : appointments.length === 0 ? (
              <div className="flex h-48 items-center justify-center text-zinc-600">
                <div className="text-center">
                  <Calendar className="mx-auto h-8 w-8" />
                  <p className="mt-2 text-sm">No upcoming appointments</p>
                </div>
              </div>
            ) : (
              appointments.map((appt) => {
                const name = appt.contacts
                  ? [appt.contacts.first_name, appt.contacts.last_name].filter(Boolean).join(" ") || "Unknown"
                  : "Unknown";
                return (
                  <div key={appt.id} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-800/30 p-3">
                    <div>
                      <p className="text-sm font-medium text-white">{appt.title || name}</p>
                      <p className="text-xs text-zinc-500">{name} &middot; {appt.appointment_date}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-zinc-400">{appt.start_time?.slice(0, 5)}</p>
                      <span className={`text-[10px] font-medium capitalize ${appt.status === "confirmed" ? "text-emerald-400" : appt.status === "cancelled" ? "text-red-400" : "text-amber-400"}`}>{appt.status}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Recent Calls */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-white">Recent Calls</h3>
          <Link href="/calls" className="text-xs text-indigo-400 hover:text-indigo-300">View all</Link>
        </div>
        <div className="mt-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-zinc-600">
              <p className="text-sm">Loading activity...</p>
            </div>
          ) : recentCalls.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-zinc-600">
              <div className="text-center">
                <Clock className="mx-auto h-8 w-8" />
                <p className="mt-2 text-sm">Activity will appear here as you use the platform</p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {recentCalls.map((call) => {
                const name = call.contacts
                  ? [call.contacts.first_name, call.contacts.last_name].filter(Boolean).join(" ") || "Unknown"
                  : "Unknown";
                const dur = call.duration_seconds > 0 ? `${Math.floor(call.duration_seconds / 60)}:${String(call.duration_seconds % 60).padStart(2, "0")}` : "0:00";
                return (
                  <div key={call.id}
                    onClick={() => router.push(`/calls/${call.id}`)}
                    className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-800/20 p-3 cursor-pointer hover:bg-zinc-800/40 transition-colors">
                    <div className="flex items-center gap-3">
                      <PhoneCall className={`h-4 w-4 ${call.status === "completed" ? "text-emerald-400" : "text-zinc-500"}`} />
                      <div>
                        <p className="text-sm font-medium text-white">{name}</p>
                        <p className="text-xs text-zinc-500">
                          {new Date(call.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          {call.outcome ? ` \u00b7 ${call.outcome.replace(/_/g, " ")}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-zinc-400">{dur}</p>
                      <span className={`text-[10px] font-medium capitalize ${call.status === "completed" ? "text-emerald-400" : "text-zinc-500"}`}>{call.status}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
