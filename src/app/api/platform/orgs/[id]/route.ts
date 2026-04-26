import { NextResponse, type NextRequest } from 'next/server'
import { requirePlatformStaff, logStaffRead } from '@/lib/platform-staff/auth'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ────────────────────────────────────────────────────────────────────────────
// Stage 3.5.1 — GET /api/platform/orgs/[id]
// ────────────────────────────────────────────────────────────────────────────
// Drill into a single org. Returns the full org row plus exact counts of
// profiles, contacts, calls, campaigns, and child sub-accounts. Five small
// COUNT queries — fine for a single drill-in, would be slow per-row in a
// list view (which is why /orgs doesn't enrich).
// ────────────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requirePlatformStaff()
  if (result.error) return result.error
  const { admin } = result.ctx

  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid org id' }, { status: 400 })
  }

  const { data: org, error } = await admin
    .from('organizations')
    .select(
      'id, name, plan, is_agency, parent_organization_id, is_active, agency_billed_amount, ai_minutes_limit, primary_color, portal_name, custom_domain',
    )
    .eq('id', id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!org) return NextResponse.json({ error: 'Org not found' }, { status: 404 })

  const [
    { count: profileCount },
    { count: contactCount },
    { count: callCount },
    { count: campaignCount },
    { count: subAccountCount },
  ] = await Promise.all([
    admin.from('profiles').select('*', { count: 'exact', head: true }).eq('organization_id', id),
    admin.from('contacts').select('*', { count: 'exact', head: true }).eq('organization_id', id),
    admin.from('calls').select('*', { count: 'exact', head: true }).eq('organization_id', id),
    admin.from('campaigns').select('*', { count: 'exact', head: true }).eq('organization_id', id),
    admin.from('organizations').select('*', { count: 'exact', head: true }).eq('parent_organization_id', id),
  ])

  await logStaffRead(admin, result.ctx, {
    organizationId: id,
    resourceType: 'organizations.detail',
    resourceId: id,
    resourceName: org.name,
  })

  return NextResponse.json({
    org,
    counts: {
      profiles: profileCount ?? 0,
      contacts: contactCount ?? 0,
      calls: callCount ?? 0,
      campaigns: campaignCount ?? 0,
      sub_accounts: subAccountCount ?? 0,
    },
  })
}
