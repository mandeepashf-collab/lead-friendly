'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface InitialValues {
  custom_included_minutes: number | null
  custom_overage_rate_x10000: number | null
  custom_monthly_fee_cents: number | null
  custom_pricing_note: string | null
}

interface Props {
  orgId: string
  initialValues: InitialValues
}

/**
 * Phase 8: Edit form for custom pricing overrides.
 *
 * Each numeric field accepts blank (= NULL = use tier default) or a
 * non-negative integer. The "Reset to tier defaults" button blanks all
 * three numeric fields and saves NULL for each.
 *
 * Storage units:
 *   - custom_included_minutes: integer minutes (e.g. 5000 = 5,000 min/period)
 *   - custom_overage_rate_x10000: integer (e.g. 1200 = $0.12/min, 700 = $0.07/min)
 *   - custom_monthly_fee_cents: integer cents (e.g. 9900 = $99/mo)
 */
export function CustomPricingForm({ orgId, initialValues }: Props) {
  const router = useRouter()
  const [includedMin, setIncludedMin] = useState(
    initialValues.custom_included_minutes?.toString() ?? '',
  )
  const [rateX10000, setRateX10000] = useState(
    initialValues.custom_overage_rate_x10000?.toString() ?? '',
  )
  const [feeCents, setFeeCents] = useState(
    initialValues.custom_monthly_fee_cents?.toString() ?? '',
  )
  const [note, setNote] = useState(initialValues.custom_pricing_note ?? '')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)

  const parseOrNull = (s: string): number | null => {
    if (!s.trim()) return null
    const n = parseInt(s, 10)
    return Number.isFinite(n) && n >= 0 ? n : null
  }

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/platform/orgs/${orgId}/pricing`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          custom_included_minutes: parseOrNull(includedMin),
          custom_overage_rate_x10000: parseOrNull(rateX10000),
          custom_monthly_fee_cents: parseOrNull(feeCents),
          custom_pricing_note: note.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error ?? `HTTP ${res.status}` })
      } else {
        setMessage({ type: 'success', text: 'Saved.' })
        router.refresh()
      }
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Save failed',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    setIncludedMin('')
    setRateX10000('')
    setFeeCents('')
    setNote('')
  }

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 space-y-4">
      <div>
        <label className="text-xs font-semibold text-zinc-300 block mb-1.5">
          Included minutes per period
        </label>
        <input
          type="text"
          inputMode="numeric"
          value={includedMin}
          onChange={(e) => setIncludedMin(e.target.value)}
          placeholder="Blank = use tier default"
          className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
        />
        <p className="text-[10px] text-zinc-500 mt-1">
          Integer minutes, e.g. 5000. Leave blank to use the tier&apos;s default.
        </p>
      </div>

      <div>
        <label className="text-xs font-semibold text-zinc-300 block mb-1.5">
          Overage rate (x10000)
        </label>
        <input
          type="text"
          inputMode="numeric"
          value={rateX10000}
          onChange={(e) => setRateX10000(e.target.value)}
          placeholder="Blank = use tier default"
          className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
        />
        <p className="text-[10px] text-zinc-500 mt-1">
          Integer × 10000. 1200 = $0.12/min · 700 = $0.07/min · 1000 = $0.10/min.
        </p>
      </div>

      <div>
        <label className="text-xs font-semibold text-zinc-300 block mb-1.5">
          Monthly fee (cents)
        </label>
        <input
          type="text"
          inputMode="numeric"
          value={feeCents}
          onChange={(e) => setFeeCents(e.target.value)}
          placeholder="Blank = use tier default"
          className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
        />
        <p className="text-[10px] text-zinc-500 mt-1">
          Integer cents. 9900 = $99/mo · 19900 = $199/mo. Display only — actual
          billing happens via Stripe Price ID.
        </p>
      </div>

      <div>
        <label className="text-xs font-semibold text-zinc-300 block mb-1.5">
          Note (internal)
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Why is this org getting custom pricing? E.g. 'Friend of founder, 50% off perpetually.'"
          className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-indigo-500"
        />
      </div>

      {message && (
        <div
          className={`text-xs rounded-md px-3 py-2 ${
            message.type === 'success'
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
              : 'bg-red-500/10 text-red-400 border border-red-500/30'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="flex items-center gap-2 pt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save custom pricing'}
        </button>
        <button
          onClick={handleReset}
          disabled={saving}
          className="rounded-lg border border-zinc-700 px-4 py-2 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-60"
        >
          Clear all (revert to tier)
        </button>
      </div>
    </div>
  )
}
