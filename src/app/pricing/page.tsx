import Link from "next/link";
import { Check, Sparkles, Zap, Building2 } from "lucide-react";
import { SubscribeButton } from "./subscribe-button";

// Stripe Price IDs pulled from env vars — configured per plan.
// Set these in Vercel: STRIPE_PRICE_STARTER, STRIPE_PRICE_GROWTH, STRIPE_PRICE_AGENCY
// All three must be live-mode prices for a Subscription product.
const plans = [
  {
    name: "Starter",
    price: 97,
    priceId: process.env.STRIPE_PRICE_STARTER || null,
    desc: "Perfect for solo agents and small teams getting started with AI calling.",
    icon: Sparkles,
    color: "border-zinc-700",
    badge: null,
    features: [
      "1,000 contacts",
      "100 AI call minutes / month",
      "1 AI voice agent",
      "1 user seat",
      "Call recordings & transcripts",
      "Basic CRM (contacts, calls)",
      "Email support",
    ],
  },
  {
    name: "Growth",
    price: 297,
    priceId: process.env.STRIPE_PRICE_GROWTH || null,
    desc: "For growing teams that need unlimited contacts and full automation.",
    icon: Zap,
    color: "border-indigo-500",
    badge: "Most Popular",
    features: [
      "Unlimited contacts",
      "500 AI call minutes / month",
      "5 AI voice agents",
      "5 user seats",
      "Full CRM + Pipelines",
      "Campaigns & automation workflows",
      "Calendar integrations (Google, Outlook, Cal.com)",
      "Reputation management",
      "Priority email & chat support",
    ],
  },
  {
    name: "Agency",
    price: 497,
    priceId: process.env.STRIPE_PRICE_AGENCY || null,
    desc: "White-label platform for agencies managing multiple client accounts.",
    icon: Building2,
    color: "border-zinc-700",
    badge: null,
    features: [
      "Unlimited contacts",
      "2,000 AI call minutes / month",
      "Unlimited AI voice agents",
      "Unlimited user seats",
      "White-label branding & custom domain",
      "Sub-account management",
      "Everything in Growth",
      "Dedicated onboarding call",
      "Priority phone & Slack support",
      "SLA guarantee",
    ],
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Nav */}
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <span className="text-lg font-bold">Lead Friendly</span>
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/login" className="text-sm text-zinc-400 hover:text-white">Sign in</Link>
          <Link href="/register" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            Get started free
          </Link>
        </div>
      </header>

      {/* Hero */}
      <div className="text-center py-16 px-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-4 py-1.5 text-xs font-medium text-indigo-400 mb-6">
          Simple, transparent pricing
        </div>
        <h1 className="text-4xl font-bold mb-4">
          AI-powered sales calling,<br />
          <span className="text-indigo-400">built into your CRM</span>
        </h1>
        <p className="text-zinc-400 max-w-xl mx-auto text-lg">
          No Retell. No Twilio. No separate voice AI subscriptions. Everything you need to close more deals is included.
        </p>
        <p className="mt-4 text-sm text-zinc-500">14-day free trial · No credit card required · Cancel anytime</p>
      </div>

      {/* Plans */}
      <div className="max-w-6xl mx-auto px-6 pb-20">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {plans.map((plan) => {
            const Icon = plan.icon;
            const isPopular = !!plan.badge;
            return (
              <div key={plan.name}
                className={`relative rounded-2xl border ${plan.color} bg-zinc-900/50 p-8 flex flex-col ${isPopular ? "ring-1 ring-indigo-500/50" : ""}`}>
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="rounded-full bg-indigo-600 px-4 py-1 text-xs font-semibold text-white">
                      {plan.badge}
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-3 mb-4">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${isPopular ? "bg-indigo-600" : "bg-zinc-800"}`}>
                    <Icon className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white">{plan.name}</h2>
                  </div>
                </div>
                <div className="mb-4">
                  <span className="text-4xl font-bold text-white">${plan.price}</span>
                  <span className="text-zinc-500 text-sm ml-1">/month</span>
                </div>
                <p className="text-sm text-zinc-400 mb-6">{plan.desc}</p>
                <SubscribeButton
                  planName={plan.name}
                  priceId={plan.priceId}
                  isPopular={isPopular}
                />
                <ul className="space-y-3 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-3 text-sm text-zinc-300">
                      <Check className="h-4 w-4 text-indigo-400 shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {/* FAQ strip */}
        <div className="mt-16 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-8">
          <h2 className="text-xl font-bold text-white mb-6 text-center">Common questions</h2>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {[
              { q: "What counts as an AI call minute?", a: "One minute of an active AI voice call with a contact. Unanswered calls and voicemails don't count." },
              { q: "Do I need to sign up for Telnyx or ElevenLabs separately?", a: "No — voice calling, phone numbers, and AI voices are built in. One subscription covers everything." },
              { q: "Can I bring my own phone number?", a: "Yes. You can port your existing number to Lead Friendly or add numbers purchased through your Telnyx account." },
              { q: "What happens if I go over my AI minute limit?", a: "Calls continue — overage is billed at $0.05/min. We'll notify you when you reach 90% of your plan limit." },
            ].map(({ q, a }) => (
              <div key={q}>
                <p className="text-sm font-semibold text-white mb-1">{q}</p>
                <p className="text-sm text-zinc-400">{a}</p>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="mt-12 text-center">
          <p className="text-zinc-400 text-sm mb-4">Questions about which plan is right for you?</p>
          <Link href="mailto:hello@leadfriendly.com" className="text-indigo-400 hover:text-indigo-300 text-sm font-medium">
            Talk to us → hello@leadfriendly.com
          </Link>
        </div>
      </div>
    </div>
  );
}
