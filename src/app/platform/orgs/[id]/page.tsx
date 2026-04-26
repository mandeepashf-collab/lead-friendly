import { headers, cookies } from 'next/headers'
import Link from 'next/link'
import {
  ArrowLeft,
  Building2,
  Users,
  Phone,
  Megaphone,
  GitBranch,
} from 'lucide-react'

// ────────────────────────────────────────────────────────────────────────────
// Stage 3.5.2 — Platform / orgs / [id] (detail)
// ────────────────────────────────────────────────────────────────────────────
// Server component. Two parallel fetches against the 3.5.1 routes:
//   - /api/platform/orgs/[id]      → org row + counts
//   - /api/platform/orgs/[id]/audit-log?limit=20  → recent activity
// Forwards the caller's cookie for staff-session validation server-side.
// ────────────────────────────────────────────────────────────────────────────

interface OrgDetail {
  id: string
  name: string
  plan: string | null
  is_agency: boolean
  parent_organization_id: string | null
  is_active: boolean
  agency_billed_amount: number | null
  ai_minutes_limit: number | null
  primary_color: string | null
  portal_name: string | null
  custom_domain: string | null
}

interface DetailResponse {
  org: OrgDetail
  counts: {
    profiles: number
    contacts: number
    calls: number
    campaigns: number
    sub_accounts: number
  }
}

interface AuditRow {
  id: string
  action: string
  resource_type: string
  resource_name: string | null
  resource_id: string | null
  user_name: string | null
  details: unknown
  ip_address: string | null
  created_at: string
}

interface AuditResponse {
  rows: AuditRow[]
}

export default async function PlatformOrgDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const h = await headers()
  const protocol = h.get('x-forwarded-proto') ?? 'http'
  const host = h.get('host')
  const baseUrl = `${protocol}://${host}`
  const cookieHeader = (await cookies()).toString()

  const [detailRes, auditRes] = await Promise.all([
    fetch(`${baseUrl}/api/platform/orgs/${id}`, {
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    }),
    fetch(`${baseUrl}/api/platform/orgs/${id}/audit-log?limit=20`, {
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    }),
  ])

  if (detailRes.status === 404) {
    return (
      <div className="space-y-4">
        <Link
          href="/platform/orgs"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-100"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to orgs
        </Link>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 text-zinc-300">
          Organization not found.
        </div>
      </div>
    )
  }
  if (!detailRes.ok) {
    return (
      <div className="text-red-400 text-sm">
        Failed to load org (HTTP {detailRes.status})
      </div>
    )
  }
  const { org, counts } = (await detailRes.json()) as DetailResponse
  const audit: AuditResponse = auditRes.ok
    ? await auditRes.json()
    : { rows: [] }

  return (
    <div className="space-y-6">
      <Link
        href="/platform/orgs"
        className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-100"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to orgs
      </Link>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 space-y-3">
        <div className="flex items-center gap-3">
          <Building2 className="h-5 w-5 text-zinc-500" />
          <h1 className="text-xl font-semibold">{org.name}</h1>
          <span
            className={
              org.is_active
                ? 'inline-flex items-center rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400'
                : 'inline-flex items-center rounded-md bg-zinc-700/40 px-2 py-0.5 text-xs font-medium text-zinc-400'
            }
          >
            {org.is_active ? 'Active' : 'Inactive'}
          </span>
        </div>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-zinc-500">ID</dt>
            <dd className="font-mono text-xs text-zinc-300">{org.id}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-zinc-500">Plan</dt>
            <dd className="text-zinc-300">{org.plan ?? '—'}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-zinc-500">Type</dt>
            <dd className="text-zinc-300">
              {org.is_agency
                ? 'Agency'
                : org.parent_organization_id
                ? 'Sub-account'
                : 'Standard'}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-zinc-500">AI Minutes Limit</dt>
            <dd className="text-zinc-300">{org.ai_minutes_limit ?? '—'}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-zinc-500">Agency Billed</dt>
            <dd className="text-zinc-300">
              {org.agency_billed_amount != null
                ? `$${org.agency_billed_amount}`
                : '—'}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-zinc-500">Custom Domain</dt>
            <dd className="text-zinc-300">{org.custom_domain ?? '—'}</dd>
          </div>
        </dl>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <CountCard icon={<Users className="h-4 w-4" />} label="Profiles" value={counts.profiles} />
        <CountCard icon={<Users className="h-4 w-4" />} label="Contacts" value={counts.contacts} />
        <CountCard icon={<Phone className="h-4 w-4" />} label="Calls" value={counts.calls} />
        <CountCard icon={<Megaphone className="h-4 w-4" />} label="Campaigns" value={counts.campaigns} />
        <CountCard icon={<GitBranch className="h-4 w-4" />} label="Sub-accounts" value={counts.sub_accounts} />
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
          Recent activity (last 20)
        </h2>
        <div className="overflow-hidden rounded-xl border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/50 text-left text-xs uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-4 py-2.5">When</th>
                <th className="px-4 py-2.5">Action</th>
                <th className="px-4 py-2.5">Resource</th>
                <th className="px-4 py-2.5">By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {audit.rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-zinc-500">
                    No recent activity.
                  </td>
                </tr>
              )}
              {audit.rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-2.5 text-zinc-400 whitespace-nowrap font-mono text-xs">
                    {new Date(row.created_at).toISOString().slice(0, 19).replace('T', ' ')}
                  </td>
                  <td className="px-4 py-2.5 text-zinc-200 font-mono text-xs">{row.action}</td>
                  <td className="px-4 py-2.5 text-zinc-300">
                    {row.resource_name ?? row.resource_type}
                  </td>
                  <td className="px-4 py-2.5 text-zinc-400">{row.user_name ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function CountCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: number
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex items-center gap-2 text-xs text-zinc-500">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-1.5 text-2xl font-semibold text-zinc-100">
        {value.toLocaleString()}
      </div>
    </div>
  )
}
