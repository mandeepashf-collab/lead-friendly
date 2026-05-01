'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

/**
 * Auto-fires Stripe Checkout when user lands on /pricing with intent
 * params already in URL. Triggered after OAuth round-trip:
 *
 *   1. User clicks Subscribe Pro Annual while signed out
 *   2. Subscribe button redirects to /login?priceId=X&plan=pro&interval=annual
 *   3. User clicks "Continue with Google" → OAuth → callback → /pricing?priceId=...
 *   4. THIS COMPONENT detects intent params + signed-in state → fires checkout
 *
 * Idempotent — only runs once per page load. If checkout fails, shows
 * a banner with retry hint.
 */
export function AutoCheckoutOnPricing() {
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<'idle' | 'loading' | 'error' | 'cancel' | 'retry'>('idle')
  const [error, setError] = useState<string>('')

  useEffect(() => {
    const subStatus = searchParams.get('subscription')
    if (subStatus === 'cancel') {
      setStatus('cancel')
      return
    }

    const retry = searchParams.get('retry')
    if (retry) {
      setStatus('retry')
    }

    const priceId = searchParams.get('priceId')
    const tierId = searchParams.get('plan')
    const interval = searchParams.get('interval')
    if (!priceId || !tierId || !interval) return

    let cancelled = false
    ;(async () => {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user || cancelled) return

      setStatus('loading')
      try {
        const res = await fetch('/api/stripe/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ priceId, tierId, interval }),
        })
        const data = await res.json()
        if (!res.ok) {
          setError(data.error || 'Checkout failed')
          setStatus('error')
          return
        }
        if (data.url) {
          window.location.href = data.url
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Checkout failed')
        setStatus('error')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [searchParams])

  if (status === 'loading') {
    return (
      <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-4 mb-6 flex items-center gap-3">
        <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />
        <p className="text-sm text-indigo-300">Continuing to checkout…</p>
      </div>
    )
  }
  if (status === 'cancel') {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 mb-6">
        <p className="text-sm text-amber-300">
          Checkout canceled. Pick a plan below when you&apos;re ready.
        </p>
      </div>
    )
  }

  if (status === 'retry') {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 mb-6">
        <p className="text-sm text-emerald-300">
          You&apos;re signed in! Click your plan below to continue checkout.
        </p>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 mb-6">
        <p className="text-sm text-red-300">
          Couldn&apos;t start checkout: {error}. Click your plan below to try again.
        </p>
      </div>
    )
  }

  return null
}
