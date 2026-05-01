import Link from 'next/link'
import type { Metadata } from 'next'
import { Sparkles } from 'lucide-react'
import { JsonLd } from '@/components/seo/json-ld'
import { ensureMasterBrandOr404 } from '@/lib/seo/ensure-master'
import {
  TIER_SOLO,
  TIER_STARTER,
  TIER_PRO,
  TIER_AGENCY,
  TIER_CUSTOM,
  PRICING_PAGE_COPY,
} from '@/config/pricing'
import { PricingCard } from './pricing-card'
import { CustomTierBand } from './custom-tier-band'
import { AddOnsBand } from './add-ons-band'
import { BundledBanner } from './bundled-banner'

const SITE_URL = 'https://www.leadfriendly.com'

export const metadata: Metadata = {
  title: 'Pricing — AI sales calling CRM with built-in voice agents',
  description:
    'Bundled voice AI + CRM pricing. Starter $49/mo, Pro $99/mo, Agency $159/mo. Save 25% annually. Free CRM included. 7-day trial, no credit card required.',
  alternates: { canonical: `${SITE_URL}/pricing` },
  openGraph: {
    title: 'Lead Friendly Pricing',
    description:
      'AI sales calling, built into your CRM. Starter, Pro, and Agency plans. 7-day free trial.',
    url: `${SITE_URL}/pricing`,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Lead Friendly Pricing',
    description:
      'AI sales calling + free CRM, bundled into one predictable price.',
  },
}

function FaqSchema() {
  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: PRICING_PAGE_COPY.faq.map((item) => ({
          '@type': 'Question',
          name: item.q,
          acceptedAnswer: {
            '@type': 'Answer',
            text: item.a,
          },
        })),
      }}
    />
  )
}

export default async function PricingPage() {
  await ensureMasterBrandOr404()

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <FaqSchema />

      {/* Nav */}
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <span className="text-lg font-bold">Lead Friendly</span>
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/login" className="text-sm text-zinc-400 hover:text-white">
            Sign in
          </Link>
          <Link
            href="/register"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Get started free
          </Link>
        </div>
      </header>

      {/* Hero */}
      <div className="text-center py-16 px-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-4 py-1.5 text-xs font-medium text-indigo-400 mb-6">
          AI calling + CRM, bundled
        </div>
        <h1 className="text-4xl font-bold mb-4">
          {PRICING_PAGE_COPY.hero.title}
        </h1>
        <p className="text-zinc-400 max-w-xl mx-auto text-lg">
          {PRICING_PAGE_COPY.hero.subtitle}
        </p>
        <p className="mt-4 text-sm text-zinc-500">
          7-day free trial · No credit card required · Cancel anytime
        </p>
      </div>

      {/* Pricing cards */}
      <div className="max-w-7xl mx-auto px-6 pb-20">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4 mb-3">
          <PricingCard tier={TIER_SOLO} />
          <PricingCard tier={TIER_STARTER} />
          <PricingCard tier={TIER_PRO} />
          <PricingCard tier={TIER_AGENCY} />
        </div>

        {/* Bundled-pricing banner */}
        <BundledBanner />

        {/* Custom tier band */}
        <CustomTierBand tier={TIER_CUSTOM} />

        {/* Add-ons band */}
        <AddOnsBand />

        {/* Wallet explainer */}
        <div className="mt-12 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-8">
          <h2 className="text-xl font-bold text-white mb-4">
            How overage and the prepaid wallet work
          </h2>
          <p className="text-sm text-zinc-300 leading-relaxed">
            {PRICING_PAGE_COPY.walletExplainer}
          </p>
        </div>

        {/* FAQ */}
        <div className="mt-12 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-8">
          <h2 className="text-xl font-bold text-white mb-6 text-center">
            Common questions
          </h2>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {PRICING_PAGE_COPY.faq.map(({ q, a }) => (
              <div key={q}>
                <p className="text-sm font-semibold text-white mb-1">{q}</p>
                <p className="text-sm text-zinc-400 leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom CTA */}
        <div className="mt-12 text-center">
          <p className="text-zinc-400 text-sm mb-4">
            Questions about which plan is right for you?
          </p>
          <Link
            href="mailto:hello@leadfriendly.com"
            className="text-indigo-400 hover:text-indigo-300 text-sm font-medium"
          >
            Talk to us → hello@leadfriendly.com
          </Link>
        </div>
      </div>
    </div>
  )
}
