// Server component that owns the (auth) route group's robots default.
//
// IMPORTANT: do NOT set `title` (string or object) here. Setting a title at
// an intermediate layout level consumes the parent template (root's
// `%s | Lead Friendly` / `%s | <portalName>`), so deeper page layouts
// (login/register/reset-password) lose template inheritance and render
// bare titles. Title is set per-page via (auth)/<page>/layout.tsx instead.
//
// robots: { index: false, follow: true } cascades to login + reset-password.
// /register overrides via its own layout to index,follow (it's the indexable
// signup landing surface).

import type { Metadata } from 'next'

export const metadata: Metadata = {
  robots: { index: false, follow: true },
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
