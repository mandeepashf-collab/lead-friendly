'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Receipt, CreditCard, TrendingUp,
  Download, CheckCircle, Clock, AlertTriangle,
  Users, Phone, Wallet, RefreshCw
} from 'lucide-react'

interface Invoice {
  id: string
  period_start: string
  period_end: string
  wl_base_fee: number
  sub_account_count: number
  sub_account_fees: number
  overage_minutes: number
  overage_amount: number
  total: number
  status: string
  created_at: string
  paid_at: string | null
}

interface UsageSummary {
  total_sub_accounts: number
  active_sub_accounts: number
  total_minutes_used: number
  total_wallet_balance: number
  low_wallet_count: number
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    paid:    'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    pending: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    failed:  'bg-red-500/10 text-red-400 border-red-500/20',
    void:    'bg-zinc-500/10 text-zinc-500 border-zinc-500/20',
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${map[status] || map.pending}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

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

export default function AgencyBillingPage() {
  const supabase = createClient()
  const router = useRouter()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [usage, setUsage] = useState<UsageSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentMonthCost, setCurrentMonthCost] = useState(0)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: agency } = await supabase
      .from('agencies').select('id').eq('user_id', user.id).single()
    if (!agency) { setLoading(false); return }

    // Load invoices
    const { data: invoiceData } = await supabase
      .from('agency_invoices')
      .select('*')
      .eq('agency_id', agency.id)
      .order('created_at', { ascending: false })
      .limit(12)

    setInvoices(invoiceData || [])

    // Load usage summary
    const { data: subAccounts } = await supabase
      .from('sub_accounts')
      .select('id, status, minutes_used, minutes_included, wallet_balance, wallet_min_threshold, monthly_fee')
      .eq('agency_id', agency.id)

    if (subAccounts) {
      const summary: UsageSummary = {
        total_sub_accounts: subAccounts.length,
        active_sub_accounts: subAccounts.filter((s: any) => s.status === 'active').length,
        total_minutes_used: subAccounts.reduce((s: number, a: any) => s + a.minutes_used, 0),
        total_wallet_balance: subAccounts.reduce((s: number, a: any) => s + a.wallet_balance, 0),
        low_wallet_count: subAccounts.filter((a: any) => a.wallet_balance < a.wallet_min_threshold).length,
      }
      setUsage(summary)

      // Current month estimate
      const base = 99
      const subFees = subAccounts.length * 39
      setCurrentMonthCost(base + subFees)
    }

    setLoading(false)
  }

  const thisMonthInvoice = invoices[0]

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <div className="border-b border-zinc-800 bg-zinc-900/50 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-4">
          <button onClick={() => router.push('/agency/dashboard')}
            className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-300 transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-base font-semibold">Agency billing</h1>
            <p className="text-xs text-zinc-500">Your invoices from Lead Friendly</p>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">

        {/* Stats */}
        {usage && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <StatCard label="This month" value={`$${currentMonthCost}`}
              sub="estimated total" icon={Receipt} color="indigo" />
            <StatCard label="Active clients" value={usage.active_sub_accounts}
              sub={`of ${usage.total_sub_accounts} total`} icon={Users} color="blue" />
            <StatCard label="Minutes used" value={usage.total_minutes_used}
              sub="across all clients" icon={Phone} color="emerald" />
            <StatCard label="Low wallets" value={usage.low_wallet_count}
              sub="clients below threshold" icon={Wallet}
              color={usage.low_wallet_count > 0 ? 'amber' : 'emerald'} />
          </div>
        )}

        {/* Current month breakdown */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
              <Clock size={16} className="text-indigo-400" />
              Current billing period
            </h2>
            <span className="text-xs text-zinc-500">
              {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </span>
          </div>

          <div className="space-y-2">
            {[
              {
                label: 'White-label base fee',
                note: 'Platform + branding + agency dashboard',
                amount: '$99.00',
                color: 'text-white'
              },
              {
                label: `Sub-account fees`,
                note: `${usage?.total_sub_accounts || 0} accounts × $39/mo`,
                amount: `$${((usage?.total_sub_accounts || 0) * 39).toFixed(2)}`,
                color: 'text-white'
              },
              {
                label: 'Overage charges',
                note: 'Billed per minute beyond included limit',
                amount: '$0.00',
                color: 'text-zinc-500'
              },
            ].map(row => (
              <div key={row.label} className="flex items-center justify-between py-3 border-b border-zinc-800 last:border-0">
                <div>
                  <p className="text-sm text-zinc-300">{row.label}</p>
                  <p className="text-xs text-zinc-600">{row.note}</p>
                </div>
                <span className={`text-sm font-medium ${row.color}`}>{row.amount}</span>
              </div>
            ))}
            <div className="flex items-center justify-between pt-3">
              <span className="text-sm font-semibold text-white">Estimated total</span>
              <span className="text-lg font-semibold text-indigo-400">${currentMonthCost.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Invoice history */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
            <h2 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
              <Receipt size={16} className="text-indigo-400" /> Invoice history
            </h2>
            <button onClick={loadData} className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-400">
              <RefreshCw size={12} /> Refresh
            </button>
          </div>

          {loading ? (
            <div className="p-8 text-center">
              <RefreshCw size={20} className="text-zinc-600 animate-spin mx-auto" />
            </div>
          ) : invoices.length === 0 ? (
            <div className="p-8 text-center">
              <Receipt size={32} className="text-zinc-700 mx-auto mb-3" />
              <p className="text-sm text-zinc-500">No invoices yet — first invoice generated at end of billing period</p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-800">
              {invoices.map(inv => (
                <div key={inv.id} className="px-6 py-4 flex items-center justify-between hover:bg-zinc-800/30 transition-colors">
                  <div className="flex items-center gap-4">
                    <div>
                      <p className="text-sm font-medium text-white">
                        {new Date(inv.period_start).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                      </p>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {inv.sub_account_count} accounts · {inv.overage_minutes} overage min
                      </p>
                    </div>
                    <StatusBadge status={inv.status} />
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-semibold text-white">${inv.total.toFixed(2)}</span>
                    <button className="p-2 rounded-lg hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300 transition-colors">
                      <Download size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Payment method */}
        <div className="mt-6 bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-zinc-800 rounded-lg flex items-center justify-center">
              <CreditCard size={18} className="text-zinc-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-white">Payment method</p>
              <p className="text-xs text-zinc-500">Charged monthly for base fee + sub-account fees</p>
            </div>
          </div>
          <button className="px-4 py-2 text-sm border border-zinc-700 hover:border-zinc-600 text-zinc-400 hover:text-zinc-300 rounded-lg transition-colors">
            Manage in Stripe
          </button>
        </div>
      </div>
    </div>
  )
}
