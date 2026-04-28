"use client";

/**
 * Settings > Compliance page.
 *
 * Three sections:
 *   A. Federal requirements — locked, informational (v1 per §8.3)
 *   B. Organization soft limits — editable by owner/admin
 *   C. Activity — override stats + skip stats
 *
 * The evaluator handles timezone math per-contact, so a PST user calling an
 * EST lead at 6 AM PST (= 9 AM EST) gets cleared without any user-side config.
 */

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/lib/toast";

type Policy = {
  organization_id: string;
  quiet_hours_start: string;
  quiet_hours_end: string;
  dnc_check_enabled: boolean;
  max_attempts_ever: number;
  daily_cap_per_contact: number;
  allow_sunday: boolean;
  cooldown_minutes: number;
};

type Org = {
  id: string;
  default_timezone: string;
};

type Stats = {
  today: number;
  week: number;
  byCode: Record<string, number>;
  skippedByAutomationWeek: number;
};

const TIMEZONES = [
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Phoenix",
];

export default function CompliancePage() {
  const supabase = createClient();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [org, setOrg] = useState<Org | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);

  // form state
  const [dailyCap, setDailyCap] = useState(3);
  const [cooldown, setCooldown] = useState(240);
  const [allowSunday, setAllowSunday] = useState(false);
  const [defaultTz, setDefaultTz] = useState("America/New_York");

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id,role")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) {
      setLoading(false);
      return;
    }

    setCanEdit(profile.role === "owner" || profile.role === "admin");

    const [pol, o, statsRes] = await Promise.all([
      supabase
        .from("org_tcpa_policies")
        .select("*")
        .eq("organization_id", profile.organization_id)
        .single(),
      supabase
        .from("organizations")
        .select("id,default_timezone")
        .eq("id", profile.organization_id)
        .single(),
      fetch(`/api/tcpa/stats`).then((r) => r.json()).catch(() => null),
    ]);

    if (pol.data) {
      setPolicy(pol.data);
      setDailyCap(pol.data.daily_cap_per_contact);
      setCooldown(pol.data.cooldown_minutes);
      setAllowSunday(pol.data.allow_sunday);
    }
    if (o.data) {
      setOrg(o.data);
      setDefaultTz(o.data.default_timezone);
    }
    if (statsRes?.ok) setStats(statsRes.stats);

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const save = async () => {
    if (!policy || !org || !canEdit) return;
    setSaving(true);

    const [polRes, orgRes] = await Promise.all([
      supabase
        .from("org_tcpa_policies")
        .update({
          daily_cap_per_contact: dailyCap,
          cooldown_minutes: cooldown,
          allow_sunday: allowSunday,
        })
        .eq("organization_id", policy.organization_id),
      supabase
        .from("organizations")
        .update({ default_timezone: defaultTz })
        .eq("id", org.id),
    ]);

    setSaving(false);

    if (polRes.error || orgRes.error) {
      toast.error("Couldn't save compliance settings.");
      return;
    }
    toast.success("Compliance settings saved.");
    load();
  };

  if (loading) {
    return <div className="p-6 text-zinc-400">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-100">Compliance</h1>
        <p className="mt-1 text-sm text-zinc-400">
          TCPA and federal calling rules for your organization. Time-of-day
          checks use the <em>contact&apos;s</em> timezone — so calling a New York
          lead at 6 AM Pacific is fine (9 AM their time).
        </p>
      </div>

      {/* Section A — Federal requirements (read-only) */}
      <section className="rounded-lg border border-zinc-800 bg-zinc-900/50">
        <header className="border-b border-zinc-800 px-5 py-3">
          <h2 className="text-sm font-semibold text-zinc-200">
            Federal requirements
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Applied to every outbound call. Can&apos;t be disabled.
          </p>
        </header>
        <div className="divide-y divide-zinc-800">
          <FederalRow
            label="Quiet hours"
            value="8:00 AM – 9:00 PM (contact's local time)"
          />
          <FederalRow
            label="National DNC Registry"
            value={
              policy?.dnc_check_enabled
                ? "Federal SAN scrubbing active"
                : "Internal DNC active. FTC SAN registry recommended for outbound at scale."
            }
          />
          <FederalRow
            label="Max attempts per contact"
            value={`${policy?.max_attempts_ever ?? 10} (lifetime)`}
          />
          <FederalRow
            label="STIR/SHAKEN attestation"
            value="A (via Telnyx)"
          />
        </div>
      </section>

      {/* Section B — Organization soft limits */}
      <section className="rounded-lg border border-zinc-800 bg-zinc-900/50">
        <header className="border-b border-zinc-800 px-5 py-3">
          <h2 className="text-sm font-semibold text-zinc-200">
            Organization soft limits
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Defaults for your team. Agents can override with a recorded reason.
          </p>
        </header>
        <div className="space-y-4 px-5 py-4">
          <div>
            <label className="block text-xs font-medium text-zinc-400">
              Daily call cap per contact
            </label>
            <input
              type="number"
              min={1}
              max={10}
              value={dailyCap}
              disabled={!canEdit}
              onChange={(e) => setDailyCap(Number(e.target.value))}
              className="mt-1 w-32 rounded border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
            />
            <p className="mt-1 text-xs text-zinc-500">
              Max attempts to the same contact in a 24-hour window.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400">
              Cooldown between attempts (minutes)
            </label>
            <input
              type="number"
              min={0}
              max={1440}
              value={cooldown}
              disabled={!canEdit}
              onChange={(e) => setCooldown(Number(e.target.value))}
              className="mt-1 w-32 rounded border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
            />
            <p className="mt-1 text-xs text-zinc-500">
              Minimum gap between consecutive attempts to the same contact.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <input
              id="allow-sunday"
              type="checkbox"
              checked={allowSunday}
              disabled={!canEdit}
              onChange={(e) => setAllowSunday(e.target.checked)}
              className="h-4 w-4 appearance-none rounded border border-zinc-600 bg-zinc-950 checked:border-indigo-500 checked:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            />
            <label htmlFor="allow-sunday" className="text-sm text-zinc-200">
              Allow calls on Sundays
            </label>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400">
              Organization default timezone
            </label>
            <select
              value={defaultTz}
              disabled={!canEdit}
              onChange={(e) => setDefaultTz(e.target.value)}
              className="mt-1 w-64 rounded border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-zinc-500">
              Fallback only. Used when a contact has no timezone AND their
              phone&apos;s area code can&apos;t be resolved (rare — toll-free, 555
              fictional, or malformed numbers).
            </p>
          </div>

          {canEdit && (
            <div className="flex justify-end border-t border-zinc-800 pt-4">
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="rounded bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          )}
          {!canEdit && (
            <p className="border-t border-zinc-800 pt-4 text-xs text-zinc-500">
              Contact your admin to change these settings.
            </p>
          )}
        </div>
      </section>

      {/* Section C — Activity */}
      <section className="rounded-lg border border-zinc-800 bg-zinc-900/50">
        <header className="border-b border-zinc-800 px-5 py-3">
          <h2 className="text-sm font-semibold text-zinc-200">Activity</h2>
        </header>
        <div className="grid grid-cols-1 gap-4 px-5 py-4 sm:grid-cols-3">
          <StatTile label="Overrides today" value={stats?.today ?? 0} />
          <StatTile label="Overrides this week" value={stats?.week ?? 0} />
          <StatTile
            label="Skipped by automation (7d)"
            value={stats?.skippedByAutomationWeek ?? 0}
          />
        </div>
        <div className="border-t border-zinc-800 px-5 py-3">
          <a
            href="/settings/compliance/audit"
            className="text-xs text-indigo-400 hover:text-indigo-300"
          >
            View full override log →
          </a>
        </div>
      </section>
    </div>
  );
}

function FederalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-5 py-3">
      <div className="flex items-center gap-2">
        <span aria-hidden className="text-zinc-500">🔒</span>
        <span className="text-sm text-zinc-300">{label}</span>
      </div>
      <span className="text-sm text-zinc-400">{value}</span>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-zinc-800 bg-zinc-950/50 px-4 py-3">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-zinc-100">{value}</div>
    </div>
  );
}
