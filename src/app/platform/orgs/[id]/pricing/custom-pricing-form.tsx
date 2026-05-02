'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * D2: Contract builder for /platform/orgs/[id]/pricing.
 *
 * Replaces the prior tier-override form. Captures a full custom contract:
 *   - monthly platform fee
 *   - included minutes (bundle)
 *   - framing rate (display only)
 *   - overage rate (charged from wallet above bundle)
 *   - billing interval (monthly | annual)
 *   - optional white-label add-on (separate Stripe Price)
 *   - internal notes
 *
 * Auto-compute math: founder picks two of {monthly_fee, framing_rate,
 * included_minutes} to "lock" and types those values. The third derives
 * automatically from `monthly_fee_cents = framing_rate_x10000 × included_minutes / 10000`.
 *
 * Default lock: minutes + rate (most natural sales-call thinking — "I'll
 * give you 5,000 minutes at 8 cents", fee derives to $400).
 *
 * Save calls PATCH /api/platform/orgs/[id]/pricing which creates Stripe
 * Product + Price(s) on material edits and stamps the org row. After a
 * successful save, "Send checkout link" appears, calling
 * POST /api/platform/orgs/[id]/pricing/checkout-link to mint a Stripe
 * Checkout Session URL the founder copies into email.
 *
 * Founding mutex: if org.tier === 'founding', an amber banner + required
 * checkbox surfaces. Save sends force_replace_founding=true to the server.
 */

interface InitialValues {
  // From organizations row
  tier: string | null
  custom_monthly_fee_cents: number | null
  custom_included_minutes: number | null
  custom_framing_rate_x10000: number | null
  custom_overage_rate_x10000: number | null
  custom_wl_fee_cents: number | null
  custom_billing_interval: string | null
  custom_pricing_note: string | null
  custom_stripe_price_id: string | null
  custom_contract_archived_at: string | null
}

interface Props {
  orgId: string
  initialValues: InitialValues
}

type LockKey = 'fee+minutes' | 'fee+rate' | 'minutes+rate'

// ─── helpers ───
const fmtDollars = (cents: number) =>
  `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const fmtRate = (rateX10000: number) => {
  // rate × 10000 → dollars/min with up to 4 decimals, trimmed
  const dollars = rateX10000 / 10000
  return `$${dollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
}

const parseDollarsToCents = (s: string): number | null => {
  const trimmed = s.trim()
  if (!trimmed) return null
  const n = Number(trimmed)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100)
}

const parseRateToX10000 = (s: string): number | null => {
  const trimmed = s.trim()
  if (!trimmed) return null
  const n = Number(trimmed)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 10000)
}

const parseInteger = (s: string): number | null => {
  const trimmed = s.trim()
  if (!trimmed) return null
  const n = parseInt(trimmed, 10)
  if (!Number.isFinite(n) || n < 0) return null
  return n
}

export function CustomPricingForm({ orgId, initialValues }: Props) {
  const router = useRouter()
  const isFounding = initialValues.tier === 'founding'
  const hasExistingContract = initialValues.custom_stripe_price_id !== null

  // ─── Form state ───
  // Inputs are stored as strings for clean editing; derived values render
  // as readonly strings.
  const [feeStr, setFeeStr] = useState(
    initialValues.custom_monthly_fee_cents !== null
      ? (initialValues.custom_monthly_fee_cents / 100).toString()
      : '',
  )
  const [minutesStr, setMinutesStr] = useState(
    initialValues.custom_included_minutes !== null
      ? initialValues.custom_included_minutes.toString()
      : '',
  )
  const [rateStr, setRateStr] = useState(
    initialValues.custom_framing_rate_x10000 !== null
      ? (initialValues.custom_framing_rate_x10000 / 10000).toString()
      : '',
  )
  const [overageStr, setOverageStr] = useState(
    initialValues.custom_overage_rate_x10000 !== null
      ? (initialValues.custom_overage_rate_x10000 / 10000).toString()
      : '',
  )
  const [interval, setInterval] = useState<'monthly' | 'annual'>(
    initialValues.custom_billing_interval === 'annual' ? 'annual' : 'monthly',
  )
  const [wlEnabled, setWlEnabled] = useState(
    initialValues.custom_wl_fee_cents !== null,
  )
  const [wlFeeStr, setWlFeeStr] = useState(
    initialValues.custom_wl_fee_cents !== null
      ? (initialValues.custom_wl_fee_cents / 100).toString()
      : '',
  )
  const [note, setNote] = useState(initialValues.custom_pricing_note ?? '')
  const [lock, setLock] = useState<LockKey>('minutes+rate')

  const [foundingAck, setFoundingAck] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)

  const [linkLoading, setLinkLoading] = useState(false)
  const [linkUrl, setLinkUrl] = useState<string | null>(null)
  const [linkErr, setLinkErr] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // ─── Derived field computation ───
  // Three "raw" parsed values from the inputs, then we derive the third
  // based on the lock setting. Derived fields display the computed value
  // and ignore typed input.
  const feeRaw = parseDollarsToCents(feeStr)
  const minutesRaw = parseInteger(minutesStr)
  const rateRaw = parseRateToX10000(rateStr)

  const computed = useMemo(() => {
    let fee = feeRaw
    let minutes = minutesRaw
    let rate = rateRaw

    if (lock === 'minutes+rate' && minutes !== null && rate !== null) {
      // monthly_fee_cents = (rate × minutes) / 100  (because rate is per
      // minute in cents × 100, i.e. rate=850 = $0.085 = 8.5 cents/min, and
      // 8.5 cents × 5000 min = 42,500 cents = $425 = rate*minutes/100).
      fee = Math.round((rate * minutes) / 100)
    } else if (lock === 'fee+minutes' && fee !== null && minutes !== null) {
      // rate_x10000 = fee_cents × 100 / minutes
      rate = minutes > 0 ? Math.round((fee * 100) / minutes) : 0
    } else if (lock === 'fee+rate' && fee !== null && rate !== null) {
      // minutes = fee_cents × 100 / rate_x10000
      minutes = rate > 0 ? Math.round((fee * 100) / rate) : 0
    }

    return { fee, minutes, rate }
  }, [feeRaw, minutesRaw, rateRaw, lock])

  const overageX10000 = parseRateToX10000(overageStr)
  const wlFeeCents = wlEnabled ? parseDollarsToCents(wlFeeStr) : null

  // ─── Validity gate ───
  const errors: string[] = []
  if (computed.fee === null) errors.push('Monthly fee is required')
  if (computed.minutes === null) errors.push('Included minutes is required')
  if (computed.rate === null) errors.push('Framing rate is required')
  if (overageX10000 === null) errors.push('Overage rate is required')
  if (wlEnabled && wlFeeCents === null) {
    errors.push('White-label fee is required when WL is enabled')
  }
  if (isFounding && !foundingAck) {
    errors.push('Acknowledge Founding-replacement to save')
  }
  const canSave = errors.length === 0 && !saving

  // ─── Display values ───
  const customerPaysCents =
    (computed.fee ?? 0) + (wlEnabled ? (wlFeeCents ?? 0) : 0)

  // ─── Handlers ───
  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    setSaveMsg(null)
    setLinkUrl(null)
    setLinkErr(null)

    const body = {
      monthly_fee_cents: computed.fee,
      included_minutes: computed.minutes,
      framing_rate_x10000: computed.rate,
      overage_rate_x10000: overageX10000,
      billing_interval: interval,
      wl_enabled: wlEnabled,
      wl_fee_cents: wlEnabled ? wlFeeCents : null,
      note: note.trim() || null,
      ...(isFounding ? { force_replace_founding: true } : {}),
    }

    try {
      const res = await fetch(`/api/platform/orgs/${orgId}/pricing`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        setSaveMsg({
          type: 'error',
          text: data.error ?? `HTTP ${res.status}`,
        })
      } else {
        const stripeNote =
          data.material === false
            ? ' (non-material edit, Stripe Prices unchanged)'
            : ' (Stripe Product + Price(s) created)'
        setSaveMsg({ type: 'success', text: `Saved.${stripeNote}` })
        router.refresh()
      }
    } catch (err) {
      setSaveMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Save failed',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleGenerateLink = async () => {
    setLinkLoading(true)
    setLinkErr(null)
    setLinkUrl(null)
    setCopied(false)
    try {
      const res = await fetch(
        `/api/platform/orgs/${orgId}/pricing/checkout-link`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' } },
      )
      const data = await res.json()
      if (!res.ok) {
        setLinkErr(data.error ?? `HTTP ${res.status}`)
      } else {
        setLinkUrl(data.url)
      }
    } catch (err) {
      setLinkErr(err instanceof Error ? err.message : 'Failed to generate link')
    } finally {
      setLinkLoading(false)
    }
  }

  const handleCopy = async () => {
    if (!linkUrl) return
    try {
      await navigator.clipboard.writeText(linkUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  // ─── Derived field rendering ───
  // For each of the three coupled fields we want an editable input when it's
  // part of the lock pair, and a readonly display showing the computed value
  // when it's the derived one.
  const isFeeLocked = lock !== 'minutes+rate'
  const isMinutesLocked = lock !== 'fee+rate'
  const isRateLocked = lock !== 'fee+minutes'
  // "Locked" inputs are editable. "Not locked" is the derived (readonly) one.
  const feeDerived = !isFeeLocked
  const minutesDerived = !isMinutesLocked
  const rateDerived = !isRateLocked

  return (
    <div className="space-y-6">
      {isFounding && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4">
          <div className="flex items-start gap-3">
            <div className="text-amber-400 mt-0.5">⚠</div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-200">
                This org is on the Founding tier
              </p>
              <p className="text-xs text-amber-100/80 mt-1.5 leading-relaxed">
                Saving a custom contract replaces Founding and forfeits the
                locked-in perpetual rate. The Founding slot stays consumed
                (it does not return to the pool), so this is not reversible
                even if you renegotiate later.
              </p>
              <label className="flex items-center gap-2 mt-3 text-xs text-amber-100">
                <input
                  type="checkbox"
                  checked={foundingAck}
                  onChange={(e) => setFoundingAck(e.target.checked)}
                  className="rounded border-amber-500/50"
                />
                I understand. Replace Founding with this custom contract.
              </label>
            </div>
          </div>
        </div>
      )}

      {hasExistingContract && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-3 text-xs text-zinc-400">
          <span className="text-zinc-300 font-medium">Existing contract on file.</span>
          {' '}Editing values that change billing (fee, minutes, overage,
          interval, WL) will archive the current Stripe Price(s) and create
          new ones. Existing subscriptions on this contract are not migrated;
          they continue on the old Price until cancelled and re-checked out.
        </div>
      )}

      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 space-y-6">
        {/* Lock selector */}
        <div>
          <label className="text-xs font-semibold text-zinc-300 block mb-2">
            Auto-compute mode
          </label>
          <div className="flex flex-wrap gap-2">
            {(['minutes+rate', 'fee+minutes', 'fee+rate'] as LockKey[]).map(
              (k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setLock(k)}
                  className={`rounded-lg px-3 py-1.5 text-xs border transition-colors ${
                    lock === k
                      ? 'border-indigo-500 bg-indigo-500/10 text-indigo-200'
                      : 'border-zinc-700 text-zinc-400 hover:border-zinc-600'
                  }`}
                >
                  {k === 'minutes+rate' && 'Lock minutes + rate → derive fee'}
                  {k === 'fee+minutes' && 'Lock fee + minutes → derive rate'}
                  {k === 'fee+rate' && 'Lock fee + rate → derive minutes'}
                </button>
              ),
            )}
          </div>
          <p className="text-[10px] text-zinc-500 mt-1.5">
            Pick which two of fee / minutes / rate you set explicitly. The
            third is computed live.
          </p>
        </div>

        {/* Three coupled fields */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Monthly fee */}
          <div>
            <label className="text-xs font-semibold text-zinc-300 block mb-1.5">
              Monthly platform fee {feeDerived && <span className="text-zinc-500 font-normal">(derived)</span>}
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">$</span>
              {feeDerived ? (
                <input
                  type="text"
                  readOnly
                  value={
                    computed.fee !== null
                      ? (computed.fee / 100).toFixed(2)
                      : '—'
                  }
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950/40 pl-6 pr-3 py-2 text-sm text-zinc-400"
                />
              ) : (
                <input
                  type="text"
                  inputMode="decimal"
                  value={feeStr}
                  onChange={(e) => setFeeStr(e.target.value)}
                  placeholder="49.00"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 pl-6 pr-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
                />
              )}
            </div>
            <p className="text-[10px] text-zinc-500 mt-1">
              Dollars/{interval === 'annual' ? 'year' : 'month'}. Can be 0.
            </p>
          </div>

          {/* Included minutes */}
          <div>
            <label className="text-xs font-semibold text-zinc-300 block mb-1.5">
              Included minutes {minutesDerived && <span className="text-zinc-500 font-normal">(derived)</span>}
            </label>
            {minutesDerived ? (
              <input
                type="text"
                readOnly
                value={computed.minutes !== null ? computed.minutes.toLocaleString() : '—'}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm text-zinc-400"
              />
            ) : (
              <input
                type="text"
                inputMode="numeric"
                value={minutesStr}
                onChange={(e) => setMinutesStr(e.target.value)}
                placeholder="5000"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
              />
            )}
            <p className="text-[10px] text-zinc-500 mt-1">
              Per period. No rollover.
            </p>
          </div>

          {/* Framing rate */}
          <div>
            <label className="text-xs font-semibold text-zinc-300 block mb-1.5">
              Framing rate {rateDerived && <span className="text-zinc-500 font-normal">(derived)</span>}
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">$</span>
              {rateDerived ? (
                <input
                  type="text"
                  readOnly
                  value={
                    computed.rate !== null
                      ? (computed.rate / 10000).toFixed(4)
                      : '—'
                  }
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950/40 pl-6 pr-3 py-2 text-sm text-zinc-400"
                />
              ) : (
                <input
                  type="text"
                  inputMode="decimal"
                  value={rateStr}
                  onChange={(e) => setRateStr(e.target.value)}
                  placeholder="0.085"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 pl-6 pr-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
                />
              )}
            </div>
            <p className="text-[10px] text-zinc-500 mt-1">
              $/min. Display only — billing is the flat fee.
            </p>
          </div>
        </div>

        {/* Overage rate */}
        <div>
          <label className="text-xs font-semibold text-zinc-300 block mb-1.5">
            Overage rate (above bundle, charged from wallet)
          </label>
          <div className="relative max-w-[200px]">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">$</span>
            <input
              type="text"
              inputMode="decimal"
              value={overageStr}
              onChange={(e) => setOverageStr(e.target.value)}
              placeholder="0.10"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 pl-6 pr-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <p className="text-[10px] text-zinc-500 mt-1">
            $/min. Drawn from prepaid wallet once bundle is consumed.
          </p>
        </div>

        {/* Billing interval */}
        <div>
          <label className="text-xs font-semibold text-zinc-300 block mb-2">
            Billing interval
          </label>
          <div className="flex gap-2">
            {(['monthly', 'annual'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setInterval(v)}
                className={`rounded-lg px-3 py-1.5 text-xs border transition-colors ${
                  interval === v
                    ? 'border-indigo-500 bg-indigo-500/10 text-indigo-200'
                    : 'border-zinc-700 text-zinc-400 hover:border-zinc-600'
                }`}
              >
                {v === 'monthly' ? 'Monthly' : 'Annual'}
              </button>
            ))}
          </div>
        </div>

        {/* WL toggle + fee */}
        <div>
          <label className="flex items-center gap-2 text-xs font-semibold text-zinc-300 mb-2">
            <input
              type="checkbox"
              checked={wlEnabled}
              onChange={(e) => setWlEnabled(e.target.checked)}
              className="rounded border-zinc-700"
            />
            White-label add-on
          </label>
          {wlEnabled && (
            <div className="ml-6">
              <div className="relative max-w-[200px]">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={wlFeeStr}
                  onChange={(e) => setWlFeeStr(e.target.value)}
                  placeholder="99.00"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-950 pl-6 pr-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <p className="text-[10px] text-zinc-500 mt-1">
                Separate Stripe Price line item. Dollars/{interval === 'annual' ? 'year' : 'month'}.
              </p>
            </div>
          )}
        </div>

        {/* Note */}
        <div>
          <label className="text-xs font-semibold text-zinc-300 block mb-1.5">
            Internal notes
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Why this contract? Negotiation context, customer constraints, anything you'll want to remember in 6 months."
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Computed summary */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-5">
        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
          Contract summary
        </h3>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs text-zinc-500">Customer pays per {interval === 'annual' ? 'year' : 'month'}</dt>
            <dd className="text-white font-semibold mt-0.5">
              {fmtDollars(customerPaysCents)}
              {wlEnabled && wlFeeCents !== null && computed.fee !== null && (
                <span className="ml-2 text-xs text-zinc-500 font-normal">
                  ({fmtDollars(computed.fee)} platform + {fmtDollars(wlFeeCents)} WL)
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Bundle</dt>
            <dd className="text-zinc-300 mt-0.5">
              {computed.minutes !== null ? `${computed.minutes.toLocaleString()} min` : '—'}
              {' @ '}
              {computed.rate !== null ? `${fmtRate(computed.rate)}/min` : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Overage rate</dt>
            <dd className="text-zinc-300 mt-0.5">
              {overageX10000 !== null ? `${fmtRate(overageX10000)}/min` : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Billing</dt>
            <dd className="text-zinc-300 mt-0.5">
              {interval === 'annual' ? 'Annual' : 'Monthly'} via Stripe
            </dd>
          </div>
        </dl>
      </div>

      {/* Save status */}
      {saveMsg && (
        <div
          className={`text-xs rounded-lg px-3 py-2 ${
            saveMsg.type === 'success'
              ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
              : 'bg-red-500/10 text-red-300 border border-red-500/30'
          }`}
        >
          {saveMsg.text}
        </div>
      )}
      {errors.length > 0 && (
        <div className="text-[11px] text-zinc-500">
          To save: {errors.join(' · ')}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={handleSave}
          disabled={!canSave}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving…' : hasExistingContract ? 'Update contract' : 'Save contract'}
        </button>
        {hasExistingContract && saveMsg?.type !== 'error' && (
          <button
            onClick={handleGenerateLink}
            disabled={linkLoading}
            className="rounded-lg border border-zinc-700 px-4 py-2 text-xs text-zinc-200 hover:bg-zinc-800 disabled:opacity-60"
          >
            {linkLoading ? 'Generating…' : 'Send checkout link'}
          </button>
        )}
      </div>

      {/* Generated checkout URL */}
      {linkUrl && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-2">
          <p className="text-xs font-semibold text-emerald-200">
            Checkout link ready (single-use, expires when used or in ~24h)
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              readOnly
              value={linkUrl}
              onClick={(e) => (e.target as HTMLInputElement).select()}
              className="flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-200 font-mono"
            />
            <button
              onClick={handleCopy}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-xs text-zinc-200 hover:bg-zinc-800 whitespace-nowrap"
            >
              {copied ? '✓ Copied' : 'Copy URL'}
            </button>
          </div>
          <p className="text-[10px] text-zinc-500">
            Paste this into your email to the customer. They&apos;ll complete
            payment and the webhook will set tier=&apos;custom&apos; on this org.
          </p>
        </div>
      )}
      {linkErr && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-300">
          {linkErr}
        </div>
      )}
    </div>
  )
}
