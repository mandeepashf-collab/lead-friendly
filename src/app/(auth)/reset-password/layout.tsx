// Per-page metadata for /reset-password. Title only — robots inherits from
// the (auth) group layout (noindex, follow).

import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Reset password',
  alternates: { canonical: 'https://www.leadfriendly.com/reset-password' },
}

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
