import Link from 'next/link'
import type { Metadata } from 'next'
import { Sparkles, Check, Award, Lock, Zap, Star, AlertCircle } from 'lucide-react'
import { ensureMasterBrandOr404 } from '@/lib/seo/ensure-master'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { TIER_FOUNDING, TIER_PRO } from '@/config/pricing'
import { FoundingCard } from './founding-card'
import { FoundingCounter } from './founding-counter'

const SITE_URL = 'https://www.leadfriendly.com'

/**
 * /founding — exclusive launch page for the Founding 100 tier.
 *
 * Hidden from /pricing (TIER_FOUNDING.isVisible = false) and excluded
 * from sitemap.xml. Marked noindex so it doesn't get crawled. Customers
 * reach this page only via direct URL share.
 *
 * Pricing: $684/year flat (price baked into Stripe Price object —
 * STRIPE_PRICE_FOUNDING_ANNUAL). Locked at this rate for life. Counter
 * caps the program at 100 customers.
 *
 * After successful checkout, the Stripe webhook calls claim_founding_spot
 * which atomically increments the counter, assigns a member number 1..100,
 * and sets organizations.is_founding_member = true.
 */

export const metadata: Metadata = {
  title: 'Founding 100 — Lead Friendly',
  description:
    'Limited to the first 100 customers. $684/year locked at this price for life. Pro features at Founding rates.',
  alternates: { canonical: `${SITE_URL}/founding` },
  // Critical: this is an exclusive launch wedge, not for SEO.
  // Don't index, don't follow.
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
  openGraph: {
    title: 'Founding 100 — Lead Friendly',
    description:
      'Be one of our first 100 customers. Lifetime price lock at $684/year.',
    url: `${SITE_URL}/founding`,
    type: 'website',
  },
}


const supabase = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

interface CounterSnapshot {
  spotsClaimed: number
  spotsTotal: number
  spotsRemaining: number
  soldOut: boolean
}

async function fetchCounterSnapshot(): Promise<CounterSnapshot> {
  const { data } = await supabase
    .from('founding_member_counter')
    .select('spots_claimed, spots_total')
    .eq('id', true)
    .single()

  const spotsClaimed = data?.spots_claimed ?? 0
  const spotsTotal = data?.spots_total ?? 100
  const spotsRemaining = Math.max(0, spotsTotal - spotsClaimed)
  return {
    spotsClaimed,
    spotsTotal,
    spotsRemaining,
    soldOut: spotsRemaining <= 0,
  }
}

export default async function FoundingPage() {
  await ensureMasterBrandOr404()

  // Detect signed-in state for the header (Phase 5 polish — same pattern
  // as /pricing). Doesn't affect the rest of the page; subscribe-button
  // handles the auth flow itself.
  const userClient = await createClient()
  const {
    data: { user },
  } = await userClient.auth.getUser()
  const isSignedIn = !!user

  // Server-render the initial counter so the page has valid data on first
  // paint, even if the client poll hasn't kicked in yet.
  const initialCounter = await fetchCounterSnapshot()

  // Pro Annual is the comparison anchor — Founding members get the same
  // 750 min bundle but at $684 vs $888.
  const proAnnual = TIER_PRO.annualPrice
  const proMonthlyEquiv = TIER_PRO.monthlyEquivalent
  const foundingAnnual = TIER_FOUNDING.annualPrice
  const foundingMonthlyEquiv = TIER_FOUNDING.monthlyEquivalent
  const annualSavings = proAnnual - foundingAnnual  // $204/year savings

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Nav */}
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-amber-700">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <span className="text-lg font-bold">Lead Friendly</span>
        </Link>
        <div className="flex items-center gap-4">
          {isSignedIn ? (
            <Link
              href="/dashboard"
              className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
            >
              Go to dashboard
            </Link>
          ) : (
            <>
              <Link href="/login" className="text-sm text-zinc-400 hover:text-white">
                Sign in
              </Link>
              <Link
                href="/register"
                className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
              >
                Get started
              </Link>
            </>
          )}
        </div>
      </header>

      {/* Hero */}
      <div className="text-center pt-20 pb-10 px-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-amber-400 mb-6">
          <Award className="h-3.5 w-3.5" />
          Founding 100 — by invitation
        </div>
        <h1 className="text-5xl font-bold mb-5 max-w-3xl mx-auto leading-tight">
          Be one of our first 100 customers.
          <br />
          <span className="bg-gradient-to-r from-amber-400 to-amber-200 bg-clip-text text-transparent">
            Locked at this price forever.
          </span>
        </h1>
        <p className="text-zinc-400 max-w-2xl mx-auto text-lg leading-relaxed">
          Pay <span className="text-white font-semibold">${foundingAnnual}/year</span>, get the same Pro
          features at a permanent discount. As long as you stay subscribed, your
          rate never increases — even when we raise prices for everyone else.
        </p>

        {/* Live counter */}
        <div className="mt-10 flex justify-center">
          <FoundingCounter initial={initialCounter} />
        </div>
      </div>


      {/* Pricing card or sold-out message */}
      <div className="max-w-4xl mx-auto px-6 pb-16">
        {initialCounter.soldOut ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-12 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/10 px-4 py-1.5 text-xs font-semibold text-amber-400 mb-6">
              <Lock className="h-3.5 w-3.5" />
              All 100 spots claimed
            </div>
            <h2 className="text-3xl font-bold mb-3">Thank you to our Founding 100.</h2>
            <p className="text-zinc-400 max-w-md mx-auto mb-6">
              The Founding program is now closed. Our standard plans are still
              available and include the same features at our regular pricing.
            </p>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700"
            >
              View regular plans
            </Link>
          </div>
        ) : (
          <FoundingCard tier={TIER_FOUNDING} />
        )}
      </div>

      {/* Comparison band */}
      {!initialCounter.soldOut && (
        <div className="max-w-4xl mx-auto px-6 pb-16">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-8">
            <h2 className="text-xl font-bold mb-2 text-center">
              Founding pricing vs Pro Annual
            </h2>
            <p className="text-sm text-zinc-500 text-center mb-6">
              Same features, same minute bundle. ${annualSavings} less per year.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Pro Annual */}
              <div className="rounded-xl border border-zinc-800 p-5 bg-zinc-950/50">
                <p className="text-xs uppercase tracking-wider text-zinc-500 mb-2">
                  Pro Annual
                </p>
                <p className="text-3xl font-bold text-white">${proAnnual}</p>
                <p className="text-sm text-zinc-400 mt-1">
                  ${proMonthlyEquiv}/mo equivalent
                </p>
                <p className="text-xs text-zinc-500 mt-3">
                  Standard pricing — what we charge everyone after Founding 100 closes
                </p>
              </div>

              {/* Founding 100 */}
              <div className="rounded-xl border-2 border-amber-500 bg-amber-500/5 p-5 relative">
                <span className="absolute -top-3 left-5 rounded-full bg-amber-500 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-950">
                  You save ${annualSavings}/year forever
                </span>
                <p className="text-xs uppercase tracking-wider text-amber-400 mb-2">
                  Founding 100
                </p>
                <p className="text-3xl font-bold text-white">${foundingAnnual}</p>
                <p className="text-sm text-amber-300/80 mt-1">
                  ${foundingMonthlyEquiv}/mo equivalent · ${TIER_FOUNDING.effectiveRatePerMinute.toFixed(3)}/min effective
                </p>
                <p className="text-xs text-amber-300/60 mt-3">
                  Lifetime price lock. Never increases.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}


      {/* What you get */}
      {!initialCounter.soldOut && (
        <div className="max-w-4xl mx-auto px-6 pb-16">
          <h2 className="text-2xl font-bold mb-6 text-center">What Founding members get</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              {
                icon: Lock,
                title: 'Lifetime price lock',
                body: '$684/year forever. Even if we raise prices for everyone else, your rate never changes as long as you stay subscribed.',
              },
              {
                icon: Star,
                title: 'Founding member badge',
                body: 'Numbered membership (#1 to #100) recorded on your account. Shows in your dashboard.',
              },
              {
                icon: Zap,
                title: 'All Pro features',
                body: '750 min/month bundle, $0.14/min overage, full CRM, AI agents, recordings, transcripts, AI summaries, calendar integrations.',
              },
              {
                icon: Award,
                title: 'Priority support',
                body: 'Direct line to the founder. Feature requests get heard.',
              },
              {
                icon: Sparkles,
                title: 'Early access',
                body: 'New features land in your account first. Your feedback shapes what we build next.',
              },
              {
                icon: Check,
                title: 'No commitment',
                body: 'Cancel anytime. Annual plan is non-refundable after 30 days but won\'t auto-renew if cancelled.',
              },
            ].map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5"
              >
                <Icon className="h-5 w-5 text-amber-400 mb-3" />
                <h3 className="text-sm font-semibold text-white mb-1">{title}</h3>
                <p className="text-xs text-zinc-400 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* FAQ */}
      <div className="max-w-3xl mx-auto px-6 pb-20">
        <h2 className="text-xl font-bold mb-6 text-center">Common questions</h2>
        <div className="space-y-4">
          {FOUNDING_FAQ.map(({ q, a }) => (
            <div key={q} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
              <p className="text-sm font-semibold text-white mb-2">{q}</p>
              <p className="text-sm text-zinc-400 leading-relaxed">{a}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom CTA */}
      {!initialCounter.soldOut && (
        <div className="max-w-3xl mx-auto px-6 pb-20 text-center">
          <div className="rounded-2xl border-2 border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-amber-700/5 p-10">
            <h2 className="text-2xl font-bold mb-3">
              {initialCounter.spotsRemaining} spot{initialCounter.spotsRemaining === 1 ? '' : 's'} left.
            </h2>
            <p className="text-zinc-400 mb-6 max-w-md mx-auto">
              Once we hit 100, the program closes. The savings are forever.
            </p>
            <FoundingCard tier={TIER_FOUNDING} compact />
          </div>
        </div>
      )}

      {/* Footer note */}
      <div className="max-w-2xl mx-auto px-6 pb-12 text-center">
        <div className="flex items-start gap-2 justify-center text-xs text-zinc-600">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <p>
            Founding 100 is a limited-time program. Pricing and counter are
            tracked in real-time. After 100 spots claim, the program permanently
            closes.
          </p>
        </div>
      </div>
    </div>
  )
}

const FOUNDING_FAQ = [
  {
    q: 'How is this different from Pro Annual?',
    a: 'Same features, same minute bundle, same overage rate. The only difference is price: $684/year vs $888/year. The Founding pricing is locked at $684 for as long as you stay subscribed — even if we raise Pro pricing later.',
  },
  {
    q: 'What if I cancel and come back later?',
    a: 'The lifetime lock requires continuous subscription. If you cancel, you lose the Founding rate. If you re-subscribe later, you pay the then-current Pro rate.',
  },
  {
    q: 'Can I upgrade to Agency later?',
    a: 'Yes. Switching to Agency gets you white-label and the higher minute bundle, but you forfeit the Founding price lock since Agency is a different tier.',
  },
  {
    q: 'Is there a refund window?',
    a: 'Yes — full refund within 30 days, no questions asked. After that, the annual subscription runs to its scheduled end date but won\'t auto-renew if you cancel.',
  },
  {
    q: 'What happens at renewal?',
    a: 'Your card on file is charged $684 once a year. The same rate, every year, for as long as you stay subscribed. We email a reminder 14 days before each renewal.',
  },
  {
    q: 'Why limit to 100?',
    a: 'We want a small group of believers we can actually talk to as we shape the product. Once we hit 100, we close the program and focus on growing the standard tiers.',
  },
]
