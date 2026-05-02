'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, AlertCircle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Global billing-status banner mounted in (dashboard)/layout.tsx.
 *
 * Shows the highest-priority condition that applies:
 *   1. subscription_status === 'past_due'    — sticky, not dismissible (red)
 *   2. used / limit >= 1.0 (overage active)  — dismissible (orange)
 *   3. used / limit >= 0.9 (warning)         — dismissible (amber)
 *
 * Does its own fetch from /api/ai-minutes; isolated from page-level state so
 * it works on every dashboard route. Re-fetches every 60s to catch status
 * changes without a full page reload.
 *
 * P9.1 5.2 + 5.3
 */

type Snapshot = {
  used: number
  limit: number
  tier: string
  subscriptionStatus: string | null
}

type DismissedKey = 'overage' | 'warn-90'

const DISMISS_TTL_MS = 1000 * 60 * 60 * 6 // 6 hours, then nag again

function readDismissed(key: DismissedKey): boolean {
  if (typeof window === 'undefined') return false
  try {
    const raw = window.sessionStorage.getItem(`lf_billing_banner_dismiss_${key}`)
    if (!raw) return false
    const at = parseInt(raw, 10)
    return Number.isFinite(at) && Date.now() - at < DISMISS_TTL_MS
  } catch {
    return false
  }
}

function writeDismissed(key: DismissedKey) {
  try {
    window.sessionStorage.setItem(
      `lf_billing_banner_dismiss_${key}`,
      String(Date.now()),
    )
  } catch {
    /* ignore (private mode, etc.) */
  }
}

export function BillingBanner() {
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [portalLoading, setPortalLoading] = useState(false)
  const [overageDismissed, setOverageDismissed] = useState(() =>
    readDismissed('overage'),
  )
  const [warn90Dismissed, setWarn90Dismissed] = useState(() =>
    readDismissed('warn-90'),
  )

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const res = await fetch('/api/ai-minutes', { cache: 'no-store' })
        if (!res.ok) return
        const json = await res.json()
        if (cancelled) return
        setSnap({
          used: json.used ?? 0,
          limit: json.limit ?? 0,
          tier: json.tier ?? '',
          subscriptionStatus: json.subscriptionStatus ?? null,
        })
      } catch {
        /* network blip — leave previous state */
      }
    }

    load()
    const id = setInterval(load, 60_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  if (!snap) return null

  const isPastDue = snap.subscriptionStatus === 'past_due'
  const pct = snap.limit > 0 ? snap.used / snap.limit : 0
  const isOverage = pct >= 1
  const isWarn90 = !isOverage && pct >= 0.9

  // Hide on solo/custom — past_due doesn't apply to free trial, and overage
  // banners are noisy on a 30-minute trial bucket. Custom pricing handles
  // its own messaging.
  const tierEligibleForUsageBanner =
    snap.tier === 'starter' || snap.tier === 'pro' ||
    snap.tier === 'agency' || snap.tier === 'founding'

  // Priority: past_due > overage > warn-90
  if (isPastDue) {
    return (
      <PastDueBanner
        portalLoading={portalLoading}
        onOpenPortal={async () => {
          setPortalLoading(true)
          try {
            const res = await fetch('/api/stripe/portal', { method: 'POST' })
            const j = await res.json()
            if (res.ok && j.url) {
              window.location.href = j.url
              return
            }
          } catch {
            /* fall through */
          }
          setPortalLoading(false)
        }}
      />
    )
  }

  if (isOverage && tierEligibleForUsageBanner && !overageDismissed) {
    return (
      <OverageBanner
        used={snap.used}
        limit={snap.limit}
        onDismiss={() => {
          writeDismissed('overage')
          setOverageDismissed(true)
        }}
      />
    )
  }

  if (isWarn90 && tierEligibleForUsageBanner && !warn90Dismissed) {
    return (
      <Warn90Banner
        used={snap.used}
        limit={snap.limit}
        onDismiss={() => {
          writeDismissed('warn-90')
          setWarn90Dismissed(true)
        }}
      />
    )
  }

  return null
}

// ────────────────────────────────────────────────────────────────────────
// Variants
// ────────────────────────────────────────────────────────────────────────

function PastDueBanner({
  portalLoading,
  onOpenPortal,
}: {
  portalLoading: boolean
  onOpenPortal: () => void
}) {
  return (
    <div
      className={cn(
        'sticky top-0 z-30 w-full',
        'border-b border-red-500/40 bg-red-500/10',
      )}
      role="alert"
    >
      <div className="px-6 py-2.5 flex items-center justify-between gap-4">
        <div className="flex items-start gap-2 text-sm text-red-200 min-w-0">
          <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
          <p>
            <span className="font-semibold">Your last payment failed.</span>{' '}
            <span className="text-red-200/80">
              Update your card to avoid losing access to outbound calls.
            </span>
          </p>
        </div>
        <button
          onClick={onOpenPortal}
          disabled={portalLoading}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-md bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 px-3 py-1 text-xs font-medium text-red-100 disabled:opacity-60"
        >
          {portalLoading && <Loader2 className="h-3 w-3 animate-spin" />}
          Fix in Stripe →
        </button>
      </div>
    </div>
  )
}

function OverageBanner({
  used,
  limit,
  onDismiss,
}: {
  used: number
  limit: number
  onDismiss: () => void
}) {
  const over = used - limit
  return (
    <div
      className="sticky top-0 z-30 w-full border-b border-orange-500/40 bg-orange-500/10"
      role="status"
    >
      <div className="px-6 py-2.5 flex items-center justify-between gap-4">
        <div className="flex items-start gap-2 text-sm text-orange-200 min-w-0">
          <AlertCircle className="h-4 w-4 text-orange-400 mt-0.5 shrink-0" />
          <p>
            <span className="font-semibold">
              You&apos;re {over.toLocaleString()} minutes over your bundle.
            </span>{' '}
            <span className="text-orange-200/80">
              Overage minutes draw from your prepaid wallet.
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <a
            href="/pricing"
            className="inline-flex items-center rounded-md bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/40 px-3 py-1 text-xs font-medium text-orange-100"
          >
            Upgrade plan →
          </a>
          <button
            onClick={onDismiss}
            className="text-xs text-orange-200/70 hover:text-orange-100 px-2"
            aria-label="Dismiss"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  )
}

function Warn90Banner({
  used,
  limit,
  onDismiss,
}: {
  used: number
  limit: number
  onDismiss: () => void
}) {
  const remaining = Math.max(0, limit - used)
  return (
    <div
      className="sticky top-0 z-30 w-full border-b border-amber-500/40 bg-amber-500/10"
      role="status"
    >
      <div className="px-6 py-2.5 flex items-center justify-between gap-4">
        <div className="flex items-start gap-2 text-sm text-amber-200 min-w-0">
          <AlertCircle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
          <p>
            <span className="font-semibold">
              {remaining.toLocaleString()} minutes left this period.
            </span>{' '}
            <span className="text-amber-200/80">
              Overage rate kicks in once you hit your bundle.
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <a
            href="/pricing"
            className="inline-flex items-center rounded-md bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 px-3 py-1 text-xs font-medium text-amber-100"
          >
            Upgrade plan →
          </a>
          <button
            onClick={onDismiss}
            className="text-xs text-amber-200/70 hover:text-amber-100 px-2"
            aria-label="Dismiss"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  )
}
