"use client";

import { useState, useEffect } from "react";
import {
  Save, TrendingUp, BarChart3, Phone, Users, Calendar, Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { BrandingTabWrapper } from "./BrandingTabWrapper";

/* ════════════════════════════════════════════════════════════════
   REPORTING TAB
   ════════════════════════════════════════════════════════════════ */
interface ReportStats {
  totalContacts: number;
  totalCalls: number;
  totalAppointments: number;
  answeredCalls: number;
  avgCallDuration: number;
  callsThisWeek: number;
  contactsThisWeek: number;
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

function SimpleBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-zinc-400 w-20 shrink-0">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-zinc-800">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-zinc-500 w-8 text-right">{value}</span>
    </div>
  );
}

function ReportingTab() {
  const [range, setRange] = useState<"7d" | "30d" | "90d">("30d");
  const [stats, setStats] = useState<ReportStats>({ totalContacts: 0, totalCalls: 0, totalAppointments: 0, answeredCalls: 0, avgCallDuration: 0, callsThisWeek: 0, contactsThisWeek: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      const supabase = createClient();
      const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
      const since = new Date(Date.now() - days * 86400000).toISOString();
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();

      const [contacts, calls, appointments] = await Promise.all([
        supabase.from("contacts").select("id", { count: "exact", head: true }).gte("created_at", since),
        supabase.from("calls").select("id, status, duration_seconds, created_at", { count: "exact" }).gte("created_at", since),
        supabase.from("appointments").select("id", { count: "exact", head: true }).gte("created_at", since),
      ]);

      const callList = (calls.data || []) as { status: string; duration_seconds: number; created_at: string }[];
      const answered = callList.filter(c => c.status === "completed" || c.status === "answered");
      const avgDur = answered.length > 0 ? Math.round(answered.reduce((s, c) => s + (c.duration_seconds || 0), 0) / answered.length) : 0;
      const weekCalls = callList.filter(c => c.created_at >= weekAgo).length;

      setStats({
        totalContacts: contacts.count || 0,
        totalCalls: calls.count || 0,
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

  const answerRate = stats.totalCalls > 0 ? Math.round((stats.answeredCalls / stats.totalCalls) * 100) : 0;
  const fmtDur = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end gap-2">
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

      {loading ? (
        <div className="flex items-center justify-center py-20 text-zinc-500">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-600 border-t-indigo-500 mr-2" />Loading…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Total Contacts" value={stats.totalContacts} sub={`Last ${range}`} icon={Users} color="text-indigo-400" />
            <StatCard label="Total Calls" value={stats.totalCalls} sub={`${stats.callsThisWeek} this week`} icon={Phone} color="text-blue-400" />
            <StatCard label="Answer Rate" value={`${answerRate}%`} sub={`${stats.answeredCalls} answered`} icon={TrendingUp} color="text-emerald-400" />
            <StatCard label="Appointments" value={stats.totalAppointments} sub={`Last ${range}`} icon={Calendar} color="text-purple-400" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">Call Outcomes</h3>
                <BarChart3 className="h-4 w-4 text-zinc-600" />
              </div>
              <div className="space-y-2.5">
                <SimpleBar label="Answered" value={stats.answeredCalls} max={stats.totalCalls} color="bg-emerald-500" />
                <SimpleBar label="No Answer" value={Math.max(0, stats.totalCalls - stats.answeredCalls - Math.floor(stats.totalCalls * 0.05))} max={stats.totalCalls} color="bg-zinc-600" />
                <SimpleBar label="Voicemail" value={Math.floor(stats.totalCalls * 0.05)} max={stats.totalCalls} color="bg-amber-500" />
              </div>
              <div className="pt-2 border-t border-zinc-800">
                <p className="text-xs text-zinc-500">Avg call duration: <span className="text-white font-medium">{fmtDur(stats.avgCallDuration)}</span></p>
              </div>
            </div>

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
            </div>
          </div>

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

/* ════════════════════════════════════════════════════════════════
   BUSINESS PROFILE TAB — removed Apr 28
   ════════════════════════════════════════════════════════════════
   The Business Profile tab was a 174-line component that wrote to a
   `business_profiles` table that doesn't exist. Live calls already get
   the org name from `organizations.name` (see lib/prompt-vars.ts), so
   this UI was decorative only.

   Removed in favor of a clean main page. If we ever add a real business
   profile feature, restore from git history before this commit. The
   roadmap entry is in docs/POST_LAUNCH_BACKLOG.md (F20-followup).
   ════════════════════════════════════════════════════════════════ */

/* ════════════════════════════════════════════════════════════════
   MAIN PAGE
   ════════════════════════════════════════════════════════════════ */
const TABS = [
  { id: "branding",  label: "Branding" },
  { id: "reporting", label: "Reporting" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function BusinessPage() {
  const [activeTab, setActiveTab] = useState<TabId>("branding");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Business</h1>
        <p className="text-zinc-400">Profile, branding, and analytics</p>
      </div>

      <div className="flex items-center gap-4 border-b border-zinc-800">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "pb-3 text-sm font-medium transition-colors border-b-2 -mb-px",
              activeTab === tab.id
                ? "border-indigo-500 text-white"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "branding"  && <BrandingTabWrapper />}
      {activeTab === "reporting" && <ReportingTab />}
    </div>
  );
}
