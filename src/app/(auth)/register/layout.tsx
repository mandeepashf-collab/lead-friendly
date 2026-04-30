// Per-page metadata for /register. UNLIKE /login and /reset-password, the
// signup surface is intentionally indexable — useful landing for branded
// "lead friendly signup" / "free trial" queries.

import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Start your free trial',
  description:
    'Create your Lead Friendly account. 14-day free trial. No credit card required. Cancel anytime.',
  robots: { index: true, follow: true },
  alternates: { canonical: 'https://www.leadfriendly.com/register' },
  openGraph: {
    title: 'Start your Lead Friendly free trial',
    description:
      'AI sales calling, built into your CRM. 14-day free trial. No credit card required.',
    url: 'https://www.leadfriendly.com/register',
    type: 'website',
  },
}

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
