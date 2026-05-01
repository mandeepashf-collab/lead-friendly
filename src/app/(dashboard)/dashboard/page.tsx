"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Users,
  Phone,
  Calendar,
  DollarSign,
  Clock,
  X,
  ArrowRight,
  PhoneCall,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { fetchDashboardKpis, type DashboardKpis } from "@/lib/dashboard/queries";
import { formatStatusDate, formatCurrencyCompact, localDateKey } from "@/lib/dashboard/format";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { AgentCardsSection } from "@/components/dashboard/agent-cards-section";
import { GoalWidget } from "@/components/dashboard/goal-widget";
import { ActivityPulseFeed } from "@/components/dashboard/activity-pulse-feed";
import { DailyDigestCard } from "@/components/dashboard/daily-digest-card";
import { SubscriptionSuccessBanner } from "@/components/dashboard/subscription-success-banner";

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

  const [kpis, setKpis] = useState<DashboardKpis | null>(null);
  // Stage 3.6.3 Commit B — lifted to component state so AgentCardsSection +
  // GoalWidget can read it. Resolved inside the data-fetch effect below.
  const [orgId, setOrgId] = useState<string | null>(null);
  const [recentCalls, setRecentCalls] = useState<DashCall[]>([]);
  const [weekCalls, setWeekCalls] = useState<{ created_at: string; outcome: string | null }[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [activeCampaigns, setActiveCampaigns] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [setupComplete, setSetupComplete] = useState(0);
  const [totalSteps, setTotalSteps] = useState(7);
  const [bannerDismissed, setBannerDismissed] = useState(true);
  // F1 fix: gate date-rendering on mount so SSR (UTC) and CSR (local) don't
  // produce a hydration mismatch (React #418) when the day differs.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

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

        // Stage 3.6.3 — resolve effective org id.
        // Priority:
        //   1. __LF_ORG_ID__ — set by root layout when there's an override
        //      (custom-domain visit, impersonation, or brand-preview cookie).
        //   2. profile lookup — for vanilla platform-host visits. The
        //      __LF_USER_ORG__ global doesn't yet expose an `id` field;
        //      Stage 3.3.7 will extend it and let us drop this fallback.
        const w = window as unknown as { __LF_ORG_ID__?: string | null };
        let orgId: string | null = w.__LF_ORG_ID__ ?? null;

        if (!orgId) {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { data: profile } = await supabase
              .from("profiles")
              .select("organization_id")
              .eq("id", user.id)
              .maybeSingle();
            orgId = profile?.organization_id ?? null;
          }
        }

        if (!orgId) {
          console.warn("[dashboard] Could not resolve org id (no __LF_ORG_ID__ and no profile); KPIs disabled");
        } else {
          setOrgId(orgId);
          const k = await fetchDashboardKpis(supabase, orgId);
          setKpis(k);
        }

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
      // F12 fix: bucket by user-local day, not UTC. Otherwise evening Pacific
      // calls land in tomorrow's bucket and the rightmost bar shows the
      // wrong date.
      const day = localDateKey(c.created_at);
      if (!map[day]) map[day] = { day, calls: 0, booked: 0 };
      map[day].calls++;
      if (c.outcome === "appointment_booked") map[day].booked++;
    }
    return Object.values(map).sort((a, b) => a.day.localeCompare(b.day));
  }, [weekCalls]);

  const tooltipStyle = { backgroundColor: "#18181b", border: "1px solid #3f3f46", borderRadius: 8 };

  return (
    <div className="space-y-8">
      {/* Subscription success banner — shown after Stripe Checkout */}
      <SubscriptionSuccessBanner />

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

      {/* Slim status header (Stage 3.6.3) */}
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-zinc-400">
        <span className="font-medium text-zinc-200">{mounted ? formatStatusDate() : ""}</span>
        <span className="text-zinc-600">·</span>
        <span>
          <span className="text-zinc-200 font-medium tabular-nums">{kpis?.callsToday ?? 0}</span> calls today
        </span>
        <span className="text-zinc-600">·</span>
        <span>
          <span className="text-zinc-200 font-medium tabular-nums">{kpis?.bookedLast30d ?? 0}</span> booked
        </span>
        {kpis && kpis.activeCampaigns > 0 && (
          <>
            <span className="text-zinc-600">·</span>
            <span>
              <span className="text-zinc-200 font-medium tabular-nums">{kpis.activeCampaigns}</span>{" "}
              active campaign{kpis.activeCampaigns !== 1 ? "s" : ""}
            </span>
          </>
        )}
      </div>

      {/* KPI tiles (Stage 3.6.3) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Calls today"
          value={kpis ? String(kpis.callsToday) : "—"}
          icon={Phone}
          iconClass="bg-violet-500/15 text-violet-400"
          sparkline={kpis?.sparklines.callsPerDay ?? []}
          sparklineColor="var(--violet-primary)"
        />
        <KpiCard
          label="Booked (30d)"
          value={kpis ? String(kpis.bookedLast30d) : "—"}
          icon={Calendar}
          iconClass="bg-emerald-500/15 text-emerald-400"
          sparkline={kpis?.sparklines.bookedPerDay ?? []}
          sparklineColor="rgb(52 211 153)"
        />
        <KpiCard
          label="Total contacts"
          value={kpis ? String(kpis.totalContacts) : "—"}
          icon={Users}
          iconClass="bg-blue-500/15 text-blue-400"
          sparkline={kpis?.sparklines.contactsCreatedPerDay ?? []}
          sparklineColor="rgb(96 165 250)"
        />
        <KpiCard
          label="Pipeline value"
          value={kpis ? formatCurrencyCompact(kpis.pipelineValue) : "—"}
          icon={DollarSign}
          iconClass="bg-amber-500/15 text-amber-400"
          sparkline={kpis?.sparklines.pipelineCreatedPerDay ?? []}
          sparklineColor="rgb(251 191 36)"
        />
      </div>

      {/* Live agents + weekly goals (Stage 3.6.3 Commit B) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <AgentCardsSection orgId={orgId} />
        </div>
        <div className="space-y-4">
          <GoalWidget orgId={orgId} />
          <DailyDigestCard orgId={orgId} />
        </div>
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

      {/* Activity Pulse (Stage 3.6.4) */}
      <ActivityPulseFeed orgId={orgId} />

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
