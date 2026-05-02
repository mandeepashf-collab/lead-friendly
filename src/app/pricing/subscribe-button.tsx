'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { TierId, BillingInterval } from '@/config/pricing'

interface Props {
  tierId: TierId
  priceId: string | null
  interval: BillingInterval
  isFeatured: boolean
  buttonLabel?: string
  /** Phase 8: Agency tier checkbox to add WL add-on as a second line item. */
  includeWhiteLabel?: boolean
}

/**
 * Subscribe button — handles three cases:
 *   1. priceId === null (Solo / no Stripe Price configured): redirect
 *      to /register?plan=X&interval=Y so signup flow preserves intent.
 *   2. User signed in: POST to /api/stripe/checkout with priceId,
 *      redirect to hosted Stripe Checkout.
 *   3. User signed out: redirect to /register with plan + interval +
 *      priceId in query so registration flow can complete checkout
 *      after they make an account.
 *
 * One button = one Stripe Price ID. Monthly and Annual buttons are
 * separate components on the parent card. No client-side toggle state.
 */
export function SubscribeButton({
  tierId,
  priceId,
  interval,
  isFeatured,
  buttonLabel,
  includeWhiteLabel = false,
}: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleClick = async () => {
    setLoading(true)
    setError(null)

    // No priceId — redirect to register (Solo trial or env-var-missing fallback)
    if (!priceId) {
      router.push(`/register?plan=${tierId}&interval=${interval}`)
      return
    }

    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      // Signed out — push them to register with intent preserved
      if (!user) {
        router.push(
          `/register?plan=${tierId}&interval=${interval}&priceId=${encodeURIComponent(priceId)}`,
        )
        return
      }

      // Signed in — go straight to Stripe Checkout. P9.0 (bug 4 fix): for a
      // confirmed-signed-in user, server-side auth failures route to /login
      // (with checkout intent preserved so postLoginRedirect resumes), and
      // any other server failure surfaces as an error message. Routing to
      // /register here was the pricing→signup loop bug from May 1.
      let res: Response
      try {
        res = await fetch('/api/stripe/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ priceId, tierId, interval, includeWhiteLabel }),
          // Don't auto-follow proxy redirects — detect a 307→/login from the
          // proxy as opaqueredirect so we can route to /login (resume) rather
          // than parsing an HTML login page as JSON.
          redirect: 'manual',
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Network error')
        setLoading(false)
        return
      }

      // 401/redirect → server-side session is stale. User confirmed signed-in
      // client-side moments ago, so this is a session-expiry edge case. Send
      // to /login (which knows how to resume checkout via postLoginRedirect),
      // NOT /register — they already have an account.
      if (res.type === 'opaqueredirect' || res.status === 401 || res.status === 0) {
        router.push(
          `/login?plan=${tierId}&interval=${interval}&priceId=${encodeURIComponent(priceId)}`,
        )
        return
      }

      // Try to parse JSON. A non-JSON response from a non-redirect status
      // is a server bug — surface it instead of routing them somewhere
      // confusing. Punting to /register here was the loop bug.
      let data: { url?: string; sessionId?: string; error?: string } = {}
      try {
        data = await res.json()
      } catch {
        setError(`Checkout failed (HTTP ${res.status}). Please try again or contact support.`)
        setLoading(false)
        return
      }

      if (!res.ok) {
        setError(data.error || `Checkout failed (HTTP ${res.status})`)
        setLoading(false)
        return
      }
      if (data.url) {
        window.location.href = data.url
      } else {
        setError('No checkout URL returned')
        setLoading(false)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout failed')
      setLoading(false)
    }
  }

  const baseClass =
    'w-full rounded-lg py-2.5 text-xs font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-60'
  const variantClass = isFeatured
    ? 'bg-indigo-600 text-white hover:bg-indigo-700'
    : 'border border-zinc-700 text-zinc-200 hover:bg-zinc-800'

  return (
    <>
      <button
        onClick={handleClick}
        disabled={loading}
        className={`${baseClass} ${variantClass}`}
      >
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {loading ? 'Redirecting…' : buttonLabel || 'Subscribe'}
      </button>
      {error && (
        <p className="text-[10px] text-red-400 text-center mt-1">{error}</p>
      )}
    </>
  )
}
