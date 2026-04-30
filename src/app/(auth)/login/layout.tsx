// Per-page metadata for /login. Title only — robots inherits from the
// (auth) group layout (noindex, follow).

import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Sign in',
  alternates: { canonical: 'https://www.leadfriendly.com/login' },
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
