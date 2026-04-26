import { redirect } from 'next/navigation'
import Link from 'next/link'
import { headers } from 'next/headers'
import { Shield, ArrowLeft } from 'lucide-react'

// ────────────────────────────────────────────────────────────────────────────
// Stage 3.5.2 — Platform-staff console layout
// ────────────────────────────────────────────────────────────────────────────
// Defense-in-depth gate: middleware already sets x-lf-platform-staff based on
// the platform_staff table. A direct URL visit by a non-staff user gets
// bounced to /dashboard before any data fetch. The /api/platform/* routes
// also gate via requirePlatformStaff(), so even if this layout were somehow
// bypassed, no data leaks.
// ────────────────────────────────────────────────────────────────────────────

export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const h = await headers()
  const isStaff = h.get('x-lf-platform-staff') === '1'
  if (!isStaff) redirect('/dashboard')

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="border-b border-zinc-800 bg-zinc-900/50">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3 text-sm">
            <Shield className="h-4 w-4 text-indigo-400" />
            <Link href="/platform/orgs" className="font-semibold hover:text-indigo-300">Platform</Link>
            <span className="text-zinc-500">— staff console</span>
          </div>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-100"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to app
          </Link>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-6 py-6">{children}</div>
    </div>
  )
}
