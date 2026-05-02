import { NextResponse, type NextRequest } from 'next/server'
import { requirePlatformStaff, logStaffRead } from '@/lib/platform-staff/auth'

// ────────────────────────────────────────────────────────────────────────────
// Stage 3.5.1 — GET /api/platform/orgs
// ────────────────────────────────────────────────────────────────────────────
// Paginated list of every organization. Cursor pagination by id (uuid order
// is stable). Optional ?search=<substring> matches against name (case-
// insensitive). Default limit 50, capped at 200.
//
// No per-row enrichment (counts, etc) — the drill-in route handles that.
// ────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const result = await requirePlatformStaff()
  if (result.error) return result.error
  const { admin } = result.ctx

  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search')?.trim() ?? ''
  const cursor = searchParams.get('cursor')
  const limitRaw = parseInt(searchParams.get('limit') ?? '50', 10)
  const limit = Math.min(Math.max(isNaN(limitRaw) ? 50 : limitRaw, 1), 200)

  let q = admin
    .from('organizations')
    .select(
      // P9.0 bug 3: include both `tier` (canonical billing column, set by
      // Stripe webhook) and `plan` (agency-set label via create_sub_account
      // RPC). They diverge for free orgs and agency-created sub-accounts.
      // Platform admin shows both so divergence is visible.
      'id, name, tier, plan, is_agency, parent_organization_id, is_active, agency_billed_amount, ai_minutes_limit',
    )
    .order('id', { ascending: true })
    .limit(limit)

  if (search) q = q.ilike('name', `%${search}%`)
  if (cursor) q = q.gt('id', cursor)

  const { data: orgs, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logStaffRead(admin, result.ctx, {
    organizationId: null,
    resourceType: 'organizations.list',
    details: { search, limit, cursor, returned: orgs?.length ?? 0 },
  })

  return NextResponse.json({
    orgs: orgs ?? [],
    nextCursor:
      orgs && orgs.length === limit ? orgs[orgs.length - 1].id : null,
  })
}
