'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Check, X, Sparkles } from 'lucide-react'

/**
 * Renders a success banner on /dashboard when the user just completed
 * a Stripe Checkout. Reads `subscription`, `tier`, and `interval` query
 * params from the URL.
 *
 * Shows until user dismisses. After dismissal, removes query params
 * from URL so a refresh doesn't re-show the banner.
 */
const TIER_NAMES: Record<string, string> = {
  starter: 'Starter',
  pro: 'Pro',
  agency: 'Agency',
  founding: 'Founding 100',
}

export function SubscriptionSuccessBanner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [visible, setVisible] = useState(false)
  const [tier, setTier] = useState<string>('')
  const [interval, setInterval] = useState<string>('')

  useEffect(() => {
    const subStatus = searchParams.get('subscription')
    if (subStatus === 'success') {
      setTier(searchParams.get('tier') ?? '')
      setInterval(searchParams.get('interval') ?? '')
      setVisible(true)
    }
  }, [searchParams])

  const dismiss = () => {
    setVisible(false)
    router.replace('/dashboard')
  }

  if (!visible) return null

  const tierName = TIER_NAMES[tier] || tier
  const intervalLabel = interval === 'annual' ? 'annual' : 'monthly'

  return (
    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 flex items-start gap-3">
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/20 shrink-0">
        <Check className="h-4 w-4 text-emerald-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
          Welcome to {tierName} {intervalLabel}!
        </p>
        <p className="text-xs text-emerald-200/80 mt-1">
          Your subscription is active. Your minute bundle has been credited
          and you can start making calls. A receipt has been sent to your email.
        </p>
      </div>
      <button
        onClick={dismiss}
        className="rounded p-1 text-emerald-300/60 hover:bg-emerald-500/20 hover:text-emerald-300"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
