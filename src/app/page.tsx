// Marketing homepage. v0.1 — uses copy already approved on /pricing.
// Replace with a richer marketing site as positioning matures.
//
// Authed users hitting "/" are bounced to /dashboard inside src/proxy.ts (Step 4)
// before this page renders, so this stays static + edge-cacheable for the
// dominant unauthed-marketing-traffic case.

import Link from "next/link";
import type { Metadata } from "next";
import { SoftwareApplicationSchema } from "@/components/seo/json-ld";
import { isMasterBrandRequest, SITE_URL } from "@/lib/seo/master-brand";
import { ensureMasterBrandOr404 } from "@/lib/seo/ensure-master";

export const metadata: Metadata = {
  title: "Lead Friendly — AI-powered sales calling, built into your CRM",
  description:
    "AI voice agents, telephony, and CRM in one platform. No Retell. No Twilio. Everything you need to close more deals — included.",
  alternates: { canonical: `${SITE_URL}/` },
  openGraph: {
    title: "Lead Friendly — AI-powered sales calling, built into your CRM",
    description:
      "AI voice agents, telephony, and CRM in one platform. No Retell. No Twilio. Everything included.",
    url: `${SITE_URL}/`,
    siteName: "Lead Friendly",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Lead Friendly — AI sales calling, built into your CRM",
    description:
      "AI voice agents, telephony, and CRM in one platform. No Retell. No Twilio.",
  },
};

const features = [
  {
    title: "AI voice agents",
    body:
      "Make and answer sales calls automatically. Built-in voice AI — no separate ElevenLabs or Retell account.",
  },
  {
    title: "Built-in telephony",
    body:
      "Phone numbers, calling, recording, and transcripts come included. Bring your own Telnyx number or buy one in-platform.",
  },
  {
    title: "Full CRM",
    body:
      "Contacts, pipelines, campaigns, and automation workflows. Everything connected to your call activity.",
  },
  {
    title: "Calendar integrations",
    body:
      "Google Calendar, Outlook, and Cal.com — agents book directly during the call.",
  },
  {
    title: "Reputation management",
    body:
      "Track and respond to reviews from one inbox. Built into the same CRM.",
  },
  {
    title: "White-label for agencies",
    body:
      "Brand the platform as your own, run multiple sub-accounts, custom domain support.",
  },
];

export default async function HomePage() {
  // Tenants must not see Lead Friendly marketing — 404 the route on tenant
  // hosts. Proxy already redirects authed `/` to /dashboard and unauthed
  // tenant `/` to /login, so this guard only fires for an unauthed tenant
  // request that somehow slips past (defensive).
  await ensureMasterBrandOr404();

  // We're definitely on master from here on — but the SoftwareApplication
  // schema still uses isMasterBrandRequest() so the value flows through the
  // shared cache() helper alongside generateMetadata.
  const isMaster = await isMasterBrandRequest();

  return (
    <>
      {isMaster && <SoftwareApplicationSchema />}
      <main className="min-h-screen bg-zinc-950 text-zinc-100">
        {/* Header */}
        <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-white"
                aria-hidden="true"
              >
                <path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z" />
                <path d="M20 2v4" />
                <path d="M22 4h-4" />
                <circle cx="4" cy="20" r="2" />
              </svg>
            </span>
            Lead Friendly
          </Link>
          <nav className="flex items-center gap-6 text-sm text-zinc-300">
            <Link href="/pricing" className="hover:text-white">
              Pricing
            </Link>
            <Link href="/login" className="hover:text-white">
              Sign in
            </Link>
            <Link
              href="/register"
              className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500"
            >
              Start free trial
            </Link>
          </nav>
        </header>

        {/* Hero */}
        <section className="mx-auto max-w-4xl px-6 pt-16 pb-24 text-center">
          <h1 className="text-5xl font-bold tracking-tight text-white sm:text-6xl">
            AI sales calling,{" "}
            <span className="text-indigo-400">built into your CRM</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-zinc-400">
            No Retell. No Twilio. No separate voice AI subscriptions. Everything
            you need to close more deals is included in one platform.
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <Link
              href="/register"
              className="rounded-lg bg-indigo-600 px-5 py-3 text-sm font-medium text-white hover:bg-indigo-500"
            >
              Start free trial
            </Link>
            <Link
              href="/pricing"
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-5 py-3 text-sm font-medium text-zinc-200 hover:bg-zinc-800"
            >
              View pricing
            </Link>
          </div>
          <p className="mt-6 text-sm text-zinc-500">
            14-day free trial · No credit card required · Cancel anytime
          </p>
        </section>

        {/* Features */}
        <section className="mx-auto max-w-6xl px-6 pb-24">
          <h2 className="text-3xl font-bold text-white">
            Everything in one platform
          </h2>
          <p className="mt-3 max-w-2xl text-zinc-400">
            Stop stitching together voice AI, telephony, CRM, and scheduling.
            Lead Friendly bundles all of it under one subscription.
          </p>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div
                key={f.title}
                className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6"
              >
                <h3 className="text-lg font-semibold text-white">{f.title}</h3>
                <p className="mt-2 text-sm text-zinc-400">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-4xl px-6 pb-24 text-center">
          <div className="rounded-3xl border border-zinc-800 bg-gradient-to-br from-indigo-950 to-zinc-900 p-12">
            <h2 className="text-3xl font-bold text-white">
              Start closing more deals today
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-zinc-400">
              Try Lead Friendly free for 14 days. No credit card required.
            </p>
            <div className="mt-8 flex items-center justify-center gap-4">
              <Link
                href="/register"
                className="rounded-lg bg-indigo-600 px-5 py-3 text-sm font-medium text-white hover:bg-indigo-500"
              >
                Start free trial
              </Link>
              <Link
                href="/pricing"
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-5 py-3 text-sm font-medium text-zinc-200 hover:bg-zinc-800"
              >
                See pricing
              </Link>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-zinc-900">
          <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10 text-sm text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
            <div>
              &copy; {new Date().getFullYear()} Lead Friendly. All rights reserved.
            </div>
            <div className="flex gap-6">
              <Link href="/pricing" className="hover:text-zinc-300">
                Pricing
              </Link>
              <Link href="/terms" className="hover:text-zinc-300">
                Terms
              </Link>
              <Link href="/privacy" className="hover:text-zinc-300">
                Privacy
              </Link>
              <a
                href="mailto:hello@leadfriendly.com"
                className="hover:text-zinc-300"
              >
                Contact
              </a>
            </div>
          </div>
        </footer>
      </main>
    </>
  );
}
