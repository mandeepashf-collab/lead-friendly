'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  CreditCard, Zap, AlertCircle, Loader2, ExternalLink,
  Plus, ToggleLeft, ToggleRight, Save, Check,
  ArrowUpRight, AlertTriangle, ReceiptText,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { SettingsTabs } from '@/components/settings/SettingsTabs'
import { WALLET_DEFAULTS, formatCents } from '@/config/pricing'

// ────────────────────────────────────────────────────────────────────────
// Types — match the JSON shapes returned by the billing APIs
// ────────────────────────────────────────────────────────────────────────

interface AiMinutesResponse {
  used: number
  limit: number
  overageMinutes: number
  tier: string
  billingInterval: string | null
  periodEndsAt: string | null
  wallet: WalletState | null
}

interface WalletState {
  balanceCents: number
  isBlocked: boolean
  blockedReason: string | null
  autoReloadEnabled: boolean
  autoReloadThresholdCents: number
  autoReloadAmountCents: number
}

interface ReloadAttempt {
  id: string
  triggerSource: 'auto_reload' | 'manual_topup' | 'cron_sweep'
  amountCents: number
  status: 'pending' | 'succeeded' | 'failed'
  stripePaymentIntentId: string | null
  stripeErrorCode: string | null
  stripeErrorMessage: string | null
  createdAt: string
  completedAt: string | null
}

interface StripeInvoice {
  id: string
  number: string | null
  amountPaidCents: number
  amountDueCents: number
  currency: string
  status: string | null
  hostedInvoiceUrl: string | null
  invoicePdf: string | null
  createdAt: string | null
  periodStart: string | null
  periodEnd: string | null
}


// ────────────────────────────────────────────────────────────────────────
// Helper components
// ────────────────────────────────────────────────────────────────────────

function Section({
  title,
  description,
  children,
  className,
}: {
  title?: string
  description?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 space-y-4', className)}>
      {(title || description) && (
        <div>
          {title && <h3 className="text-sm font-semibold text-white">{title}</h3>}
          {description && <p className="text-xs text-zinc-500 mt-0.5">{description}</p>}
        </div>
      )}
      {children}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    succeeded: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    pending: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    failed: 'bg-red-500/10 text-red-400 border-red-500/20',
    paid: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    open: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    void: 'bg-zinc-500/10 text-zinc-500 border-zinc-700',
    draft: 'bg-zinc-500/10 text-zinc-400 border-zinc-700',
    uncollectible: 'bg-red-500/10 text-red-400 border-red-500/20',
  }
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize',
        map[status] ?? map.draft,
      )}
    >
      {status}
    </span>
  )
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function fmtRelative(iso: string) {
  const now = Date.now()
  const then = new Date(iso).getTime()
  const diff = Math.floor((now - then) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d ago`
  return fmtDate(iso)
}


// ────────────────────────────────────────────────────────────────────────
// Plan card — shows tier, period, manage-in-Stripe button
// ────────────────────────────────────────────────────────────────────────

function PlanCard({
  data,
  onOpenPortal,
  portalLoading,
}: {
  data: AiMinutesResponse
  onOpenPortal: () => void
  portalLoading: boolean
}) {
  const tierLabel =
    data.tier === 'solo'
      ? 'Free Trial'
      : data.tier.charAt(0).toUpperCase() + data.tier.slice(1)
  const intervalLabel = data.billingInterval === 'annual' ? 'Annual' : data.billingInterval === 'monthly' ? 'Monthly' : null
  const isPaid = data.tier !== 'solo' && data.tier !== 'custom'

  return (
    <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <span className="text-lg font-bold text-white">{tierLabel}</span>
            {intervalLabel && (
              <span className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-indigo-300">
                {intervalLabel}
              </span>
            )}
            {isPaid && (
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-400">
                Active
              </span>
            )}
          </div>
          <p className="text-sm text-zinc-400">
            {isPaid && data.periodEndsAt
              ? `Renews ${fmtDate(data.periodEndsAt)}`
              : data.tier === 'solo'
              ? '30-minute trial · Upgrade to a paid plan to unlock more'
              : 'Subscription managed by your account team'}
          </p>
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          {isPaid ? (
            <button
              onClick={onOpenPortal}
              disabled={portalLoading}
              className="flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {portalLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ExternalLink className="h-4 w-4" />
              )}
              Manage in Stripe
            </button>
          ) : (
            <a
              href="/pricing"
              className="flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              <ArrowUpRight className="h-4 w-4" />
              View plans
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Usage card — minutes used vs limit, overage, period end
// ────────────────────────────────────────────────────────────────────────

function UsageCard({ data }: { data: AiMinutesResponse }) {
  const pct = data.limit > 0 ? Math.min((data.used / data.limit) * 100, 100) : 0
  const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-indigo-600'

  return (
    <Section title="This period's usage">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-zinc-300">
            <Zap className="h-4 w-4 text-indigo-400" />
            AI Call Minutes
          </div>
          <span className="text-sm font-medium text-white">
            {data.used.toLocaleString()} / {data.limit.toLocaleString()} min
          </span>
        </div>
        <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
          <div className={cn('h-full transition-all', color)} style={{ width: `${pct}%` }} />
        </div>
        {data.overageMinutes > 0 ? (
          <p className="text-xs text-amber-400">
            {data.overageMinutes.toLocaleString()} overage minutes this period · drawn from wallet
          </p>
        ) : (
          <p className="text-xs text-zinc-500">
            {Math.max(0, data.limit - data.used).toLocaleString()} minutes remaining
            {data.periodEndsAt && ` · resets ${fmtDate(data.periodEndsAt)}`}
          </p>
        )}
      </div>
    </Section>
  )
}


// ────────────────────────────────────────────────────────────────────────
// Wallet card — balance + Top Up button + blocked-state warning
// ────────────────────────────────────────────────────────────────────────

function WalletCard({
  wallet,
  onTopUp,
  topUpLoading,
  topUpError,
}: {
  wallet: WalletState
  onTopUp: () => void
  topUpLoading: boolean
  topUpError: string | null
}) {
  return (
    <Section
      title="Prepaid wallet"
      description="Used to pay for overage minutes once your bundle is exhausted"
    >
      {wallet.isBlocked && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
          <div className="text-xs text-red-300">
            <p className="font-semibold mb-0.5">Wallet blocked — outbound calls disabled</p>
            <p className="text-red-300/80">
              {wallet.blockedReason === 'auto_reload_failed'
                ? 'Last auto-reload failed. Top up manually or update your card in Stripe to resume calls.'
                : wallet.blockedReason === 'zero_balance'
                ? 'Your wallet ran out and auto-reload is disabled. Top up to resume calls.'
                : `Reason: ${wallet.blockedReason ?? 'unknown'}`}
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-4 pt-1">
        <div>
          <p className="text-xs text-zinc-500 mb-1">Current balance</p>
          <p className="text-3xl font-bold text-white">
            {formatCents(wallet.balanceCents)}
          </p>
        </div>
        <button
          onClick={onTopUp}
          disabled={topUpLoading}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60 shrink-0"
        >
          {topUpLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Top up {formatCents(wallet.autoReloadAmountCents)}
        </button>
      </div>

      {topUpError && (
        <p className="text-xs text-red-400 mt-2">{topUpError}</p>
      )}

      <p className="text-xs text-zinc-500">
        Top-up uses your card on file. Adjust the amount in auto-reload settings below.
      </p>
    </Section>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Auto-reload settings card — toggle + threshold + amount
// ────────────────────────────────────────────────────────────────────────

function AutoReloadSettingsCard({
  wallet,
  onSave,
  saving,
  saveError,
  saveSuccess,
}: {
  wallet: WalletState
  onSave: (updates: {
    auto_reload_enabled?: boolean
    auto_reload_threshold_cents?: number
    auto_reload_amount_cents?: number
  }) => void
  saving: boolean
  saveError: string | null
  saveSuccess: boolean
}) {
  // Local form state, initialized from props. Reset when props change.
  const [enabled, setEnabled] = useState(wallet.autoReloadEnabled)
  const [thresholdDollars, setThresholdDollars] = useState(
    (wallet.autoReloadThresholdCents / 100).toString(),
  )
  const [amountDollars, setAmountDollars] = useState(
    (wallet.autoReloadAmountCents / 100).toString(),
  )

  // Sync local state when wallet prop changes (e.g. after save)
  useEffect(() => {
    setEnabled(wallet.autoReloadEnabled)
    setThresholdDollars((wallet.autoReloadThresholdCents / 100).toString())
    setAmountDollars((wallet.autoReloadAmountCents / 100).toString())
  }, [wallet.autoReloadEnabled, wallet.autoReloadThresholdCents, wallet.autoReloadAmountCents])

  const tMin = WALLET_DEFAULTS.thresholdRangeCents.min / 100
  const tMax = WALLET_DEFAULTS.thresholdRangeCents.max / 100
  const aMin = WALLET_DEFAULTS.reloadRangeCents.min / 100
  const aMax = WALLET_DEFAULTS.reloadRangeCents.max / 100

  const thresholdNum = parseFloat(thresholdDollars)
  const amountNum = parseFloat(amountDollars)
  const thresholdValid =
    Number.isFinite(thresholdNum) && thresholdNum >= tMin && thresholdNum <= tMax
  const amountValid =
    Number.isFinite(amountNum) && amountNum >= aMin && amountNum <= aMax

  const dirty =
    enabled !== wallet.autoReloadEnabled ||
    Math.round(thresholdNum * 100) !== wallet.autoReloadThresholdCents ||
    Math.round(amountNum * 100) !== wallet.autoReloadAmountCents

  const canSave = dirty && thresholdValid && amountValid && !saving

  const handleSave = () => {
    const updates: {
      auto_reload_enabled?: boolean
      auto_reload_threshold_cents?: number
      auto_reload_amount_cents?: number
    } = {}
    if (enabled !== wallet.autoReloadEnabled) updates.auto_reload_enabled = enabled
    if (Math.round(thresholdNum * 100) !== wallet.autoReloadThresholdCents) {
      updates.auto_reload_threshold_cents = Math.round(thresholdNum * 100)
    }
    if (Math.round(amountNum * 100) !== wallet.autoReloadAmountCents) {
      updates.auto_reload_amount_cents = Math.round(amountNum * 100)
    }
    onSave(updates)
  }

  return (
    <Section title="Auto-reload" description="Automatically charge your card when balance drops">
      <div className="space-y-4">
        {/* Toggle */}
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-white">Enable auto-reload</p>
            <p className="text-xs text-zinc-500 mt-0.5">
              Charges your card on file when balance dips below the threshold
            </p>
          </div>
          <button
            onClick={() => setEnabled(!enabled)}
            className="flex items-center gap-1.5 shrink-0"
            aria-label={enabled ? 'Disable auto-reload' : 'Enable auto-reload'}
          >
            {enabled ? (
              <ToggleRight className="h-7 w-7 text-indigo-500" />
            ) : (
              <ToggleLeft className="h-7 w-7 text-zinc-600" />
            )}
            <span className={cn('text-xs', enabled ? 'text-indigo-400' : 'text-zinc-500')}>
              {enabled ? 'On' : 'Off'}
            </span>
          </button>
        </div>

        {/* Threshold + amount inputs (only if enabled) */}
        <div className={cn('grid grid-cols-1 sm:grid-cols-2 gap-4', !enabled && 'opacity-50')}>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">
              Trigger threshold
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500">
                $
              </span>
              <input
                type="number"
                inputMode="decimal"
                step="1"
                min={tMin}
                max={tMax}
                value={thresholdDollars}
                onChange={(e) => setThresholdDollars(e.target.value)}
                disabled={!enabled}
                className={cn(
                  'h-10 w-full rounded-lg border bg-zinc-900 pl-7 pr-3 text-sm text-zinc-200 focus:outline-none disabled:cursor-not-allowed',
                  thresholdValid
                    ? 'border-zinc-800 focus:border-indigo-500'
                    : 'border-red-500/50',
                )}
              />
            </div>
            <p className="mt-1 text-xs text-zinc-600">
              Range: ${tMin}–${tMax}. Default: ${WALLET_DEFAULTS.autoReloadThresholdCents / 100}
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">
              Reload amount
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500">
                $
              </span>
              <input
                type="number"
                inputMode="decimal"
                step="5"
                min={aMin}
                max={aMax}
                value={amountDollars}
                onChange={(e) => setAmountDollars(e.target.value)}
                disabled={!enabled}
                className={cn(
                  'h-10 w-full rounded-lg border bg-zinc-900 pl-7 pr-3 text-sm text-zinc-200 focus:outline-none disabled:cursor-not-allowed',
                  amountValid
                    ? 'border-zinc-800 focus:border-indigo-500'
                    : 'border-red-500/50',
                )}
              />
            </div>
            <p className="mt-1 text-xs text-zinc-600">
              Range: ${aMin}–${aMax}. Default: ${WALLET_DEFAULTS.autoReloadAmountCents / 100}
            </p>
          </div>
        </div>

        {/* Save row */}
        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : saveSuccess ? (
              <Check className="h-4 w-4" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {saveSuccess ? 'Saved' : 'Save changes'}
          </button>
          {saveError && <p className="text-xs text-red-400">{saveError}</p>}
        </div>
      </div>
    </Section>
  )
}


// ────────────────────────────────────────────────────────────────────────
// Reload attempts table — last N attempts, hidden when empty
// ────────────────────────────────────────────────────────────────────────

function ReloadAttemptsCard({ attempts }: { attempts: ReloadAttempt[] }) {
  if (attempts.length === 0) return null

  return (
    <Section
      title="Auto-reload activity"
      description="Recent wallet top-up attempts. Failed attempts include the reason from your card issuer."
    >
      <div className="overflow-x-auto -mx-2 px-2">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-xs uppercase tracking-wide text-zinc-500">
              <th className="px-2 py-2 text-left font-medium">When</th>
              <th className="px-2 py-2 text-left font-medium">Source</th>
              <th className="px-2 py-2 text-right font-medium">Amount</th>
              <th className="px-2 py-2 text-left font-medium">Status</th>
              <th className="px-2 py-2 text-left font-medium">Note</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/50">
            {attempts.map((a) => (
              <tr key={a.id} className="hover:bg-zinc-900/30">
                <td className="px-2 py-2 text-xs text-zinc-400 whitespace-nowrap">
                  {fmtRelative(a.createdAt)}
                </td>
                <td className="px-2 py-2 text-xs text-zinc-400 capitalize">
                  {a.triggerSource.replace('_', ' ')}
                </td>
                <td className="px-2 py-2 text-xs text-zinc-200 text-right font-medium">
                  {formatCents(a.amountCents)}
                </td>
                <td className="px-2 py-2">
                  <StatusBadge status={a.status} />
                </td>
                <td className="px-2 py-2 text-xs text-zinc-500">
                  {a.status === 'failed' && a.stripeErrorMessage
                    ? a.stripeErrorMessage
                    : a.status === 'succeeded' && a.stripePaymentIntentId
                    ? a.stripePaymentIntentId.slice(0, 18) + '…'
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Stripe invoices table
// ────────────────────────────────────────────────────────────────────────

function InvoicesCard({ invoices }: { invoices: StripeInvoice[] }) {
  if (invoices.length === 0) {
    return (
      <Section title="Invoices" description="Subscription invoices from Stripe">
        <div className="flex flex-col items-center gap-2 py-6 text-zinc-600">
          <ReceiptText className="h-8 w-8" />
          <p className="text-sm text-zinc-500">No invoices yet</p>
          <p className="text-xs text-zinc-600">Invoices appear here after your first paid period</p>
        </div>
      </Section>
    )
  }

  return (
    <Section title="Invoices" description="Subscription invoices from Stripe">
      <div className="overflow-x-auto -mx-2 px-2">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-xs uppercase tracking-wide text-zinc-500">
              <th className="px-2 py-2 text-left font-medium">Number</th>
              <th className="px-2 py-2 text-left font-medium">Date</th>
              <th className="px-2 py-2 text-right font-medium">Amount</th>
              <th className="px-2 py-2 text-left font-medium">Status</th>
              <th className="px-2 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/50">
            {invoices.map((inv) => (
              <tr key={inv.id} className="hover:bg-zinc-900/30">
                <td className="px-2 py-2 text-xs font-mono text-indigo-400">
                  {inv.number ?? inv.id.slice(0, 16)}
                </td>
                <td className="px-2 py-2 text-xs text-zinc-400 whitespace-nowrap">
                  {fmtDate(inv.createdAt)}
                </td>
                <td className="px-2 py-2 text-xs text-white text-right font-medium">
                  {formatCents(inv.amountPaidCents || inv.amountDueCents)}
                </td>
                <td className="px-2 py-2">
                  <StatusBadge status={inv.status ?? 'draft'} />
                </td>
                <td className="px-2 py-2 text-right">
                  <div className="flex items-center gap-2 justify-end">
                    {inv.hostedInvoiceUrl && (
                      <a
                        href={inv.hostedInvoiceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                      >
                        View <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    {inv.invoicePdf && (
                      <a
                        href={inv.invoicePdf}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-zinc-400 hover:text-zinc-200"
                      >
                        PDF
                      </a>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  )
}


// ────────────────────────────────────────────────────────────────────────
// Page component
// ────────────────────────────────────────────────────────────────────────

export default function BillingSettingsPage() {
  // Data state
  const [data, setData] = useState<AiMinutesResponse | null>(null)
  const [attempts, setAttempts] = useState<ReloadAttempt[]>([])
  const [invoices, setInvoices] = useState<StripeInvoice[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Action states
  const [portalLoading, setPortalLoading] = useState(false)
  const [topUpLoading, setTopUpLoading] = useState(false)
  const [topUpError, setTopUpError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Initial load
  const loadAll = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [aiRes, attemptsRes, invoicesRes] = await Promise.all([
        fetch('/api/ai-minutes'),
        fetch('/api/billing/wallet/reload-attempts?limit=10'),
        fetch('/api/billing/invoices?limit=12'),
      ])

      if (!aiRes.ok) throw new Error(`Failed to load billing data (${aiRes.status})`)
      const aiData: AiMinutesResponse = await aiRes.json()
      setData(aiData)

      if (attemptsRes.ok) {
        const j = await attemptsRes.json()
        setAttempts(j.attempts ?? [])
      }
      if (invoicesRes.ok) {
        const j = await invoicesRes.json()
        setInvoices(j.invoices ?? [])
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  // Action: open Stripe Portal
  const handleOpenPortal = async () => {
    setPortalLoading(true)
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' })
      const json = await res.json()
      if (!res.ok || !json.url) {
        throw new Error(json.error ?? 'Failed to open portal')
      }
      window.location.href = json.url
    } catch (err) {
      console.error('Portal error:', err)
      setPortalLoading(false)
    }
  }

  // Action: manual top up
  const handleTopUp = async () => {
    if (!data?.wallet) return
    setTopUpLoading(true)
    setTopUpError(null)
    try {
      // Call auto-reload endpoint with session auth (no x-internal-secret).
      // The route resolves org from the user's profile and ignores any body
      // organizationId — defense against confused-deputy. We pass only
      // triggerSource so the threshold/auto-reload-disabled checks bypass.
      const res = await fetch('/api/billing/wallet/auto-reload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ triggerSource: 'manual_topup' }),
      })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error ?? 'Top-up failed')
      }
      if (json.success === false) {
        throw new Error(json.errorMessage ?? json.error ?? 'Charge failed')
      }
      if (json.skipped) {
        // e.g. cooldown, no_payment_method
        throw new Error(`Skipped: ${json.reason}`)
      }
      // Reload data to show new balance + new attempt row
      await loadAll()
    } catch (err) {
      setTopUpError(err instanceof Error ? err.message : 'Top-up failed')
    } finally {
      setTopUpLoading(false)
    }
  }

  // Action: save auto-reload settings
  const handleSaveSettings = async (updates: {
    auto_reload_enabled?: boolean
    auto_reload_threshold_cents?: number
    auto_reload_amount_cents?: number
  }) => {
    setSaving(true)
    setSaveError(null)
    setSaveSuccess(false)
    try {
      const res = await fetch('/api/billing/wallet/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Save failed')
      // Merge updated wallet into data state
      if (data) {
        setData({
          ...data,
          wallet: {
            balanceCents: json.wallet.balanceCents,
            isBlocked: json.wallet.isBlocked,
            blockedReason: json.wallet.blockedReason,
            autoReloadEnabled: json.wallet.autoReloadEnabled,
            autoReloadThresholdCents: json.wallet.autoReloadThresholdCents,
            autoReloadAmountCents: json.wallet.autoReloadAmountCents,
          },
        })
      }
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2000)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 min-w-0">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-zinc-400">Manage your organization and account settings</p>
      </div>

      <SettingsTabs />

      {/* Page header */}
      <div>
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-indigo-400" />
          Billing & wallet
        </h2>
        <p className="text-sm text-zinc-500 mt-0.5">
          Your plan, usage, prepaid wallet, and payment history
        </p>
      </div>

      {/* Loading / error states */}
      {loading && (
        <div className="flex items-center justify-center py-16 text-zinc-500">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      )}

      {loadError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-400 mt-0.5 shrink-0" />
          <div className="text-sm text-red-300">
            <p className="font-semibold mb-1">Failed to load billing data</p>
            <p className="text-red-300/80">{loadError}</p>
          </div>
        </div>
      )}

      {/* Main content */}
      {!loading && !loadError && data && (
        <div className="space-y-6 max-w-4xl">
          <PlanCard
            data={data}
            onOpenPortal={handleOpenPortal}
            portalLoading={portalLoading}
          />

          <UsageCard data={data} />

          {data.wallet && (
            <>
              <WalletCard
                wallet={data.wallet}
                onTopUp={handleTopUp}
                topUpLoading={topUpLoading}
                topUpError={topUpError}
              />

              <AutoReloadSettingsCard
                wallet={data.wallet}
                onSave={handleSaveSettings}
                saving={saving}
                saveError={saveError}
                saveSuccess={saveSuccess}
              />
            </>
          )}

          <ReloadAttemptsCard attempts={attempts} />

          <InvoicesCard invoices={invoices} />
        </div>
      )}
    </div>
  )
}
