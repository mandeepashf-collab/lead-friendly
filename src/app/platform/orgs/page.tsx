import { headers, cookies } from 'next/headers'
import Link from 'next/link'
import { ChevronRight, Building2 } from 'lucide-react'

// ────────────────────────────────────────────────────────────────────────────
// Stage 3.5.2 — Platform / orgs (list)
// ────────────────────────────────────────────────────────────────────────────
// Server component. Fetches /api/platform/orgs (Pattern A) so audit logging
// + pagination + search clamping live in one place. Forwards the caller's
// session cookie so the API route can validate the staff session.
// ────────────────────────────────────────────────────────────────────────────

interface OrgRow {
  id: string
  name: string
  plan: string | null
  is_agency: boolean
  parent_organization_id: string | null
  is_active: boolean
  agency_billed_amount: number | null
  ai_minutes_limit: number | null
}

interface OrgListResponse {
  orgs: OrgRow[]
  nextCursor: string | null
}

export default async function PlatformOrgsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; cursor?: string }>
}) {
  const sp = await searchParams
  const h = await headers()
  const protocol = h.get('x-forwarded-proto') ?? 'http'
  const host = h.get('host')
  const baseUrl = `${protocol}://${host}`

  const cookieHeader = (await cookies()).toString()
  const params = new URLSearchParams()
  if (sp.search) params.set('search', sp.search)
  if (sp.cursor) params.set('cursor', sp.cursor)
  params.set('limit', '50')

  const res = await fetch(`${baseUrl}/api/platform/orgs?${params}`, {
    headers: { cookie: cookieHeader },
    cache: 'no-store',
  })
  if (!res.ok) {
    return (
      <div className="text-red-400 text-sm">
        Failed to load orgs (HTTP {res.status})
      </div>
    )
  }
  const { orgs, nextCursor } = (await res.json()) as OrgListResponse

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <h1 className="text-2xl font-semibold">Organizations</h1>
        <span className="text-sm text-zinc-500">
          {orgs.length} {orgs.length === 1 ? 'result' : 'results'}
          {nextCursor ? ' (more available)' : ''}
        </span>
      </div>

      <form className="flex gap-2" action="/platform/orgs">
        <input
          type="search"
          name="search"
          defaultValue={sp.search ?? ''}
          placeholder="Search by name…"
          className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-indigo-500 focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          Search
        </button>
      </form>

      <div className="overflow-hidden rounded-xl border border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/50 text-left text-xs uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="px-4 py-2.5">Name</th>
              <th className="px-4 py-2.5">Plan</th>
              <th className="px-4 py-2.5">Type</th>
              <th className="px-4 py-2.5">Active</th>
              <th className="px-4 py-2.5">Billed</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {orgs.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-zinc-500">
                  No organizations match.
                </td>
              </tr>
            )}
            {orgs.map((org) => (
              <tr key={org.id} className="hover:bg-zinc-900/50 transition-colors">
                <td className="px-4 py-2.5">
                  <Link
                    href={`/platform/orgs/${org.id}`}
                    className="flex items-center gap-2 font-medium text-zinc-100 hover:text-indigo-400"
                  >
                    <Building2 className="h-4 w-4 text-zinc-500" />
                    {org.name}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-zinc-300">{org.plan ?? '—'}</td>
                <td className="px-4 py-2.5 text-zinc-300">
                  {org.is_agency
                    ? 'Agency'
                    : org.parent_organization_id
                    ? 'Sub-account'
                    : 'Standard'}
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className={
                      org.is_active
                        ? 'inline-flex items-center rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400'
                        : 'inline-flex items-center rounded-md bg-zinc-700/40 px-2 py-0.5 text-xs font-medium text-zinc-400'
                    }
                  >
                    {org.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-zinc-300">
                  {org.agency_billed_amount != null ? `$${org.agency_billed_amount}` : '—'}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <Link
                    href={`/platform/orgs/${org.id}`}
                    className="inline-flex items-center text-zinc-400 hover:text-indigo-400"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {nextCursor && (
        <Link
          href={`/platform/orgs?${new URLSearchParams({
            ...(sp.search ? { search: sp.search } : {}),
            cursor: nextCursor,
          })}`}
          className="inline-flex items-center text-sm text-indigo-400 hover:text-indigo-300"
        >
          Next page →
        </Link>
      )}
    </div>
  )
}
