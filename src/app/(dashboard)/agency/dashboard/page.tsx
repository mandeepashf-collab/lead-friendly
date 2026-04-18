'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  Users, Plus, Settings, ArrowRight, Phone, Wallet,
  AlertTriangle, CheckCircle, Clock, TrendingUp,
  Building2, ChevronRight, RefreshCw, MoreVertical
} from 'lucide-react'
import CustomDomainManager from '@/components/agency/CustomDomainManager'

// ── Types ────────────────────────────────────────────────────
interface SubAccount {
  id: string
  name: string
  company_name: string | null
  logo_url: string | null
  primary_color: string
  plan: string
  status: string
  minutes_included: number
  minutes_used: number
  wallet_balance: number
  wallet_min_threshold: number
  client_overage_rate: number
  agency_overage_rate: number
  custom_domain: string | null
  email: string | null
  created_at: string
}

interface Agency {
  id: string
  name: string
  plan: string
  status: string
}

// ── Helpers ──────────────────────────────────────────────────
function walletColor(balance: number, threshold: number) {
  if (balance <= 0) return 'text-red-400'
  if (balance < threshold) return 'text-amber-400'
  return 'text-emerald-400'
}

function walletBg(balance: number, threshold: number) {
  if (balance <= 0) return 'bg-red-500/10 border-red-500/20'
  if (balance < threshold) return 'bg-amber-500/10 border-amber-500/20'
  return 'bg-emerald-500/10 border-emerald-500/20'
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    active:    'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    trial:     'bg-blue-500/10 text-blue-400 border-blue-500/20',
    paused:    'bg-amber-500/10 text-amber-400 border-amber-500/20',
    suspended: 'bg-red-500/10 text-red-400 border-red-500/20',
  }
  return map[status] || 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
}

function minutesPercent(used: number, included: number) {
  return Math.min(100, Math.round((used / Math.max(included, 1)) * 100))
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
  account: SubAccount
  onSwitch: (id: string) => void
  onSettings: (id: string) => void
}) {
  const pct = minutesPercent(account.minutes_used, account.minutes_included)
  const barColor = minutesBarColor(pct)
  const margin = ((account.client_overage_rate - account.agency_overage_rate) * 100).toFixed(0)

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition-all group">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          {account.logo_url ? (
            <img src={account.logo_url} alt={account.name}
              className="w-10 h-10 rounded-lg object-cover border border-zinc-700" />
          ) : (
            <div className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-semibold text-white"
              style={{ backgroundColor: account.primary_color + '33', border: `1px solid ${account.primary_color}44` }}>
              <span style={{ color: account.primary_color }}>{initials(account.company_name || account.name)}</span>
            </div>
          )}
          <div>
            <p className="text-sm font-medium text-white leading-tight">{account.company_name || account.name}</p>
            {account.custom_domain && (
              <p className="text-xs text-zinc-500">{account.custom_domain}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded-full border ${statusBadge(account.status)}`}>
            {account.status}
          </span>
          <button onClick={() => onSettings(account.id)}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300">
            <MoreVertical size={14} />
          </button>
        </div>
      </div>

      {/* Minutes */}
      <div className="mb-3">
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-xs text-zinc-500">Voice minutes</span>
          <span className="text-xs text-zinc-400">
            {account.minutes_used} / {account.minutes_included} min
          </span>
        </div>
        <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${barColor}`}
            style={{ width: `${pct}%` }} />
        </div>
        {pct >= 90 && (
          <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
            <AlertTriangle size={10} /> Near limit — overage will be charged
          </p>
        )}
      </div>

      {/* Wallet */}
      <div className={`rounded-lg border p-3 mb-3 ${walletBg(account.wallet_balance, account.wallet_min_threshold)}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Wallet size={12} className={walletColor(account.wallet_balance, account.wallet_min_threshold)} />
            <span className="text-xs text-zinc-400">Client wallet</span>
          </div>
          <span className={`text-sm font-semibold ${walletColor(account.wallet_balance, account.wallet_min_threshold)}`}>
            ${account.wallet_balance.toFixed(2)}
          </span>
        </div>
        {account.wallet_balance < account.wallet_min_threshold && account.wallet_balance > 0 && (
          <p className="text-xs text-amber-400 mt-1">Auto-reload triggers below ${account.wallet_min_threshold}</p>
        )}
        {account.wallet_balance <= 0 && (
          <p className="text-xs text-red-400 mt-1">Calls paused — wallet empty</p>
        )}
      </div>

      {/* Rates */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="bg-zinc-800/50 rounded-lg p-2">
          <p className="text-xs text-zinc-500 mb-0.5">You pay us</p>
          <p className="text-xs font-medium text-zinc-300">${account.agency_overage_rate}/min</p>
        </div>
        <div className="bg-zinc-800/50 rounded-lg p-2">
          <p className="text-xs text-zinc-500 mb-0.5">Client pays you</p>
          <p className="text-xs font-medium text-emerald-400">${account.client_overage_rate}/min</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={() => onSwitch(account.id)}
          className="flex-1 flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium py-2 rounded-lg transition-colors">
          Switch to account <ArrowRight size={12} />
        </button>
        <button
          onClick={() => onSettings(account.id)}
          className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-300 rounded-lg transition-colors">
          <Settings size={14} />
        </button>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────
export default function AgencyDashboard() {
  const supabase = createClient()
  const router = useRouter()
  const [agency, setAgency] = useState<Agency | null>(null)
  const [subAccounts, setSubAccounts] = useState<SubAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: agencyData, error: agencyErr } = await supabase
        .from('agencies').select('*').eq('user_id', user.id).single()

      if (agencyErr || !agencyData) {
        setError('No agency account found. Contact support to enable white-label.')
        setLoading(false)
        return
      }
      setAgency(agencyData)

      const { data: accounts, error: accErr } = await supabase
        .from('sub_accounts').select('*')
        .eq('agency_id', agencyData.id).order('created_at', { ascending: false })

      if (accErr) throw accErr
      setSubAccounts(accounts || [])
    } catch (err: any) {
      setError(err.message || 'Failed to load agency data')
    } finally {
      setLoading(false)
    }
  }

  async function handleSwitch(subAccountId: string) {
    try {
      const res = await fetch('/api/agency/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sub_account_id: subAccountId })
      })
      const data = await res.json()
      if (data.token) {
        document.cookie = `impersonation_token=${data.token}; path=/; max-age=7200`
        document.cookie = `impersonation_sub_account=${subAccountId}; path=/; max-age=7200`
        router.push('/dashboard')
      }
    } catch (err) {
      console.error('Impersonation failed:', err)
    }
  }

  function handleSettings(subAccountId: string) {
    router.push(`/agency/sub-accounts/${subAccountId}/settings`)
  }

  // ── Stats ──────────────────────────────────────────────────
  const totalMinutes = subAccounts.reduce((s, a) => s + a.minutes_used, 0)
  const totalWallet = subAccounts.reduce((s, a) => s + a.wallet_balance, 0)
  const activeCount = subAccounts.filter(a => a.status === 'active').length
  const alertCount = subAccounts.filter(a =>
    a.wallet_balance < a.wallet_min_threshold || minutesPercent(a.minutes_used, a.minutes_included) >= 90
  ).length
  const monthlyRevenue = subAccounts.reduce((s, a) => s + 39, 0) + 99 // $39/sub + $99 base

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
            <h1 className="text-xl font-semibold text-white">{agency?.name} — Agency Dashboard</h1>
            <p className="text-sm text-zinc-500 mt-0.5">White-label portal · {subAccounts.length} client accounts</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/agency/billing')}
              className="flex items-center gap-2 px-4 py-2 text-sm text-zinc-400 hover:text-zinc-300 border border-zinc-700 hover:border-zinc-600 rounded-lg transition-colors">
              <Wallet size={14} /> Billing
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
          <StatCard label="Active clients" value={activeCount} sub={`of ${subAccounts.length} total`} icon={Users} color="indigo" />
          <StatCard label="Monthly revenue" value={`$${monthlyRevenue}`} sub="from us to you" icon={TrendingUp} color="emerald" />
          <StatCard label="Minutes used" value={totalMinutes} sub="this month across all clients" icon={Phone} color="blue" />
          <StatCard label="Alerts" value={alertCount} sub={alertCount > 0 ? "clients need attention" : "all clear"} icon={AlertTriangle} color={alertCount > 0 ? "amber" : "emerald"} />
        </div>

        {/* Alert banner */}
        {alertCount > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 mb-6 flex items-center gap-3">
            <AlertTriangle size={18} className="text-amber-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-400">{alertCount} client{alertCount > 1 ? 's' : ''} need attention</p>
              <p className="text-xs text-amber-400/70 mt-0.5">Low wallet balance or near minute limit — review below</p>
            </div>
          </div>
        )}

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
                  key={account.id}
                  account={account}
                  onSwitch={handleSwitch}
                  onSettings={handleSettings}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
