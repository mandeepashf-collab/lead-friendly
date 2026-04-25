'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  Users, Plus, ArrowRight, Phone, AlertTriangle, CheckCircle, Clock,
  Building2, RefreshCw, MoreVertical, TrendingUp, DollarSign,
} from 'lucide-react'
import CustomDomainManager from '@/components/agency/CustomDomainManager'
import type { AgencyClientRow, AgencyMrrSummary } from '@/lib/schemas/stage3'

// ────────────────────────────────────────────────────────────────────────────
// Stage 3.3 — Agency dashboard
// ────────────────────────────────────────────────────────────────────────────
// Reads from two views:
//   - agency_clients_v       (one row per sub-account, RLS-scoped)
//   - agency_mrr_summary_v   (one row, the agency's aggregate metrics)
//
// Schema migration vs. pre-Stage-3.1 dashboard:
//   - Old shape: agencies table + sub_accounts table, with hand-rolled minutes
//     accounting (minutes_used / minutes_included), wallet (wallet_balance /
//     wallet_min_threshold), and per-client overage rates. All of those
//     columns belonged to the dropped sub_accounts table.
//   - New shape: organizations rows with parent_organization_id set, plus
//     ai_minutes_limit / ai_minutes_used / agency_billed_amount columns.
//     Wallet concept is deferred — when Stage 3.5 ships Stripe billing, that
//     becomes the metering surface, not a per-client wallet table.
//
// Switch-to-account button: POSTs to /api/agency/impersonate which sets the
// httpOnly lf_impersonation_token cookie. We never touch document.cookie here.
// ────────────────────────────────────────────────────────────────────────────

function statusBadge(isActive: boolean) {
  return isActive
    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
    : 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
}

function minutesPercent(used: number | null, included: number | null) {
  const u = used ?? 0
  const i = included ?? 0
  if (i <= 0) return 0
  return Math.min(100, Math.round((u / i) * 100))
}

function minutesBarColor(pct: number) {
  if (pct >= 90) return 'bg-red-500'
  if (pct >= 70) return 'bg-amber-500'
  return 'bg-indigo-500'
}

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

// ── Stat Card ─────────────────────────────────────────────────
function StatCard({ label, value, sub, icon: Icon, color = 'indigo' }: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; color?: string
}) {
  const colors: Record<string, string> = {
    indigo: 'bg-indigo-500/10 text-indigo-400',
    emerald: 'bg-emerald-500/10 text-emerald-400',
    amber: 'bg-amber-500/10 text-amber-400',
    blue: 'bg-blue-500/10 text-blue-400',
  }
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-zinc-500 uppercase tracking-wider">{label}</span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${colors[color]}`}>
          <Icon size={16} />
        </div>
      </div>
      <p className="text-2xl font-semibold text-white">{value}</p>
      {sub && <p className="text-xs text-zinc-500 mt-1">{sub}</p>}
    </div>
  )
}

// ── Sub-Account Card ──────────────────────────────────────────
function SubAccountCard({ account, onSwitch, onSettings }: {
  account: AgencyClientRow
  onSwitch: (orgId: string) => void
  onSettings: (orgId: string) => void
}) {
  const used = account.ai_minutes_used ?? 0
  const limit = account.ai_minutes_limit ?? 0
  const pct = minutesPercent(used, limit)
  const barColor = minutesBarColor(pct)

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition-all group">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
            {initials(account.name)}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-white leading-tight truncate">{account.name}</p>
            {account.custom_domain && (
              <p className="text-xs text-zinc-500 truncate">{account.custom_domain}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`text-xs px-2 py-0.5 rounded-full border ${statusBadge(account.is_active)}`}>
            {account.is_active ? 'active' : 'suspended'}
          </span>
          {account.is_being_impersonated && (
            <span className="text-xs px-2 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-400">
              live
            </span>
          )}
          <button
            onClick={() => onSettings(account.organization_id)}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300">
            <MoreVertical size={14} />
          </button>
        </div>
      </div>

      {/* Plan + billed */}
      <div className="flex items-center justify-between mb-3 text-xs">
        <span className="text-zinc-500">Plan</span>
        <span className="text-zinc-300 font-medium capitalize">{account.plan ?? 'starter'}</span>
      </div>
      {account.agency_billed_amount != null && (
        <div className="flex items-center justify-between mb-3 text-xs">
          <span className="text-zinc-500">Your fee</span>
          <span className="text-emerald-400 font-medium">
            ${Number(account.agency_billed_amount).toFixed(2)}/mo
          </span>
        </div>
      )}

      {/* Minutes */}
      <div className="mb-3">
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-xs text-zinc-500">Voice minutes</span>
          <span className="text-xs text-zinc-400">
            {used} / {limit} min
          </span>
        </div>
        <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${barColor}`}
            style={{ width: `${pct}%` }} />
        </div>
        {pct >= 90 && (
          <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
            <AlertTriangle size={10} /> Near limit
          </p>
        )}
      </div>

      {/* Activity */}
      <div className="grid grid-cols-3 gap-2 mb-3 pt-3 border-t border-zinc-800">
        <div>
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Calls/mo</p>
          <p className="text-sm font-medium text-white">{account.calls_this_month}</p>
        </div>
        <div>
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Contacts</p>
          <p className="text-sm font-medium text-white">{account.contact_count}</p>
        </div>
        <div>
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Agents</p>
          <p className="text-sm font-medium text-white">{account.agent_count}</p>
        </div>
      </div>

      {/* Last activity */}
      {account.last_call_at && (
        <p className="text-[10px] text-zinc-600 mb-3 flex items-center gap-1">
          <Clock size={10} /> Last call {new Date(account.last_call_at).toLocaleDateString()}
        </p>
      )}

      {/* Switch-to button */}
      <button
        onClick={() => onSwitch(account.organization_id)}
        disabled={!account.is_active}
        className="w-full py-2 text-sm bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-900 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center justify-center gap-2 font-medium">
        Switch to account <ArrowRight size={14} />
      </button>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────
export default function AgencyDashboardPage() {
  const supabase = createClient()
  const router = useRouter()

  const [summary, setSummary] = useState<AgencyMrrSummary | null>(null)
  const [subAccounts, setSubAccounts] = useState<AgencyClientRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [switching, setSwitching] = useState<string | null>(null)

  useEffect(() => { loadData() }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  async function loadData() {
    setLoading(true)
    setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      // Resolve own org to verify is_agency=true and to filter the views
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', user.id)
        .maybeSingle()

      if (!profile?.organization_id) {
        setError('Your profile is not linked to an organization. Contact support.')
        return
      }

      const { data: org } = await supabase
        .from('organizations')
        .select('id, is_agency')
        .eq('id', profile.organization_id)
        .maybeSingle()

      if (!org) {
        setError('Organization not found.')
        return
      }
      if (!org.is_agency) {
        setError('This dashboard is only available for agency accounts.')
        return
      }

      // Load aggregate + per-client rows in parallel
      const [{ data: summaryRow }, { data: clientRows }] = await Promise.all([
        supabase
          .from('agency_mrr_summary_v')
          .select('*')
          .eq('agency_organization_id', org.id)
          .maybeSingle<AgencyMrrSummary>(),
        supabase
          .from('agency_clients_v')
          .select('*')
          .eq('parent_organization_id', org.id)
          .order('updated_at', { ascending: false })
          .returns<AgencyClientRow[]>(),
      ])

      setSummary(summaryRow ?? null)
      setSubAccounts(clientRows ?? [])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load agency data')
    } finally {
      setLoading(false)
    }
  }

  async function handleSwitch(subOrgId: string) {
    setSwitching(subOrgId)
    try {
      const res = await fetch('/api/agency/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sub_organization_id: subOrgId }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `start_impersonation ${res.status}`)
      }
      // Full reload so the root layout re-resolves brand from the new
      // middleware-injected impersonation headers. The cookie was set by
      // the route handler (httpOnly).
      window.location.href = '/dashboard'
    } catch (err) {
      console.error('Impersonation failed:', err)
      setSwitching(null)
    }
  }

  function handleSettings(subOrgId: string) {
    router.push(`/agency/sub-accounts/${subOrgId}/settings`)
  }

  // Header metrics (defaults if summary not loaded yet)
  const totalSubs = summary?.total_sub_accounts ?? subAccounts.length
  const activeCount = summary?.active_sub_accounts ?? subAccounts.filter(a => a.is_active).length
  const totalMrr = summary?.total_mrr ?? 0
  const totalMinutesUsed = summary?.total_minutes_used ?? 0
  const callsThisMonth = summary?.calls_this_month ?? 0

  // Near-limit count: clients at >=90% minutes (stage 3.5 will replace this with
  // a wallet/billing alert once Stripe is wired)
  const alertCount = subAccounts.filter(a => {
    const pct = minutesPercent(a.ai_minutes_used, a.ai_minutes_limit)
    return pct >= 90 || !a.is_active
  }).length

  if (loading) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="flex items-center gap-3 text-zinc-400">
        <RefreshCw size={20} className="animate-spin" />
        <span>Loading agency dashboard...</span>
      </div>
    </div>
  )

  if (error) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
      <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 max-w-md text-center">
        <AlertTriangle size={32} className="text-red-400 mx-auto mb-3" />
        <p className="text-red-400 font-medium mb-2">Agency access required</p>
        <p className="text-zinc-400 text-sm">{error}</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <div className="border-b border-zinc-800 bg-zinc-900/50 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-white">
              {summary?.agency_name ?? 'Agency'} — Dashboard
            </h1>
            <p className="text-sm text-zinc-500 mt-0.5">
              White-label portal · {totalSubs} client account{totalSubs === 1 ? '' : 's'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/agency/billing')}
              className="flex items-center gap-2 px-4 py-2 text-sm text-zinc-400 hover:text-zinc-300 border border-zinc-700 hover:border-zinc-600 rounded-lg transition-colors">
              <DollarSign size={14} /> Billing
            </button>
            <button onClick={() => router.push('/agency/sub-accounts/new')}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors font-medium">
              <Plus size={14} /> Add client
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard label="Active clients" value={activeCount} sub={`of ${totalSubs} total`} icon={Users} color="indigo" />
          <StatCard label="Monthly recurring" value={`$${Number(totalMrr).toFixed(0)}`} sub="from active clients" icon={TrendingUp} color="emerald" />
          <StatCard label="Calls this month" value={callsThisMonth} sub={`${totalMinutesUsed} min total`} icon={Phone} color="blue" />
          <StatCard
            label="Alerts"
            value={alertCount}
            sub={alertCount > 0 ? "clients need attention" : "all clear"}
            icon={alertCount > 0 ? AlertTriangle : CheckCircle}
            color={alertCount > 0 ? "amber" : "emerald"} />
        </div>

        {/* Custom Domain */}
        <div className="mb-8 p-6 bg-zinc-900/50 border border-zinc-800 rounded-xl">
          <CustomDomainManager />
        </div>

        {/* Sub-account grid */}
        {subAccounts.length === 0 ? (
          <div className="border border-dashed border-zinc-800 rounded-xl p-16 text-center">
            <Building2 size={40} className="text-zinc-700 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-zinc-400 mb-2">No client accounts yet</h3>
            <p className="text-sm text-zinc-600 mb-6 max-w-sm mx-auto">
              Add your first client to start reselling Lead Friendly under your brand
            </p>
            <button onClick={() => router.push('/agency/sub-accounts/new')}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors font-medium">
              <Plus size={16} /> Add first client
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-medium text-zinc-300">Client accounts</h2>
              <button onClick={loadData} className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-400 transition-colors">
                <RefreshCw size={12} /> Refresh
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {subAccounts.map(account => (
                <SubAccountCard
                  key={account.organization_id}
                  account={account}
                  onSwitch={handleSwitch}
                  onSettings={handleSettings}
                />
              ))}
            </div>
            {switching && (
              <p className="text-center text-xs text-zinc-500 mt-4">Switching to account…</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
