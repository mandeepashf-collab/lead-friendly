import { NextResponse, type NextRequest } from 'next/server'
import { requirePlatformStaff, logStaffRead } from '@/lib/platform-staff/auth'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ────────────────────────────────────────────────────────────────────────────
// Stage 3.5.1 — GET /api/platform/orgs/[id]/audit-log
// ────────────────────────────────────────────────────────────────────────────
// Recent audit_logs rows scoped to this org, newest first. Default 50, max 200.
// ────────────────────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requirePlatformStaff()
  if (result.error) return result.error
  const { admin } = result.ctx

  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid org id' }, { status: 400 })
  }
  const { searchParams } = new URL(req.url)
  const limitRaw = parseInt(searchParams.get('limit') ?? '50', 10)
  const limit = Math.min(Math.max(isNaN(limitRaw) ? 50 : limitRaw, 1), 200)

  const { data: rows, error } = await admin
    .from('audit_logs')
    .select(
      'id, action, resource_type, resource_name, resource_id, user_name, details, ip_address, created_at',
    )
    .eq('organization_id', id)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logStaffRead(admin, result.ctx, {
    organizationId: id,
    resourceType: 'organizations.audit_log',
    resourceId: id,
    details: { limit, returned: rows?.length ?? 0 },
  })

  return NextResponse.json({ rows: rows ?? [] })
}
