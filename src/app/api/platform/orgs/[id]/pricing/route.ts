import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformStaff } from '@/lib/platform-staff/auth'

/**
 * Phase 8: Custom pricing admin endpoints (platform-staff only).
 *
 * GET  /api/platform/orgs/[id]/pricing
 *   Returns current custom pricing values + audit history (last 20 changes).
 *
 * PATCH /api/platform/orgs/[id]/pricing
 *   Body: {
 *     custom_included_minutes?: number | null,
 *     custom_overage_rate_x10000?: number | null,
 *     custom_monthly_fee_cents?: number | null,
 *     custom_pricing_note?: string | null,
 *   }
 *   Setting any field to null clears that override (revert to tier default).
 *   Records an audit row in custom_pricing_audit.
 *
 * Authorization: requirePlatformStaff() returns either an error response
 * (401/403) or a ctx with a service-role Supabase client.
 */

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const auth = await requirePlatformStaff()
  if (auth.error) return auth.error
  const supabase = auth.ctx.admin

  const { id: orgId } = await ctx.params

  const [orgRes, auditRes] = await Promise.all([
    supabase
      .from('organizations')
      .select(
        'id, name, tier, custom_included_minutes, custom_overage_rate_x10000, custom_monthly_fee_cents, custom_pricing_note, custom_pricing_set_at, custom_pricing_set_by',
      )
      .eq('id', orgId)
      .maybeSingle(),
    supabase
      .from('custom_pricing_audit')
      .select('*')
      .eq('organization_id', orgId)
      .order('changed_at', { ascending: false })
      .limit(20),
  ])

  if (orgRes.error || !orgRes.data) {
    return NextResponse.json({ error: 'Org not found' }, { status: 404 })
  }

  return NextResponse.json({
    org: orgRes.data,
    audit: auditRes.data ?? [],
  })
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const auth = await requirePlatformStaff()
  if (auth.error) return auth.error
  const supabase = auth.ctx.admin
  const userId = auth.ctx.userId

  const { id: orgId } = await ctx.params

  let body: {
    custom_included_minutes?: number | null
    custom_overage_rate_x10000?: number | null
    custom_monthly_fee_cents?: number | null
    custom_pricing_note?: string | null
  } = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Validate: numeric fields must be non-negative integers if not null
  for (const [key, value] of Object.entries(body)) {
    if (value === null || value === undefined) continue
    if (key === 'custom_pricing_note') continue
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
      return NextResponse.json(
        {
          error: `Invalid value for ${key}: must be a non-negative integer or null. Got: ${JSON.stringify(value)}`,
        },
        { status: 400 },
      )
    }
  }

  // Read current values so we can audit the diff
  const { data: before, error: beforeErr } = await supabase
    .from('organizations')
    .select(
      'custom_included_minutes, custom_overage_rate_x10000, custom_monthly_fee_cents',
    )
    .eq('id', orgId)
    .maybeSingle()

  if (beforeErr || !before) {
    return NextResponse.json({ error: 'Org not found' }, { status: 404 })
  }

  // Build update — only set fields that were explicitly provided
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updatePayload: Record<string, any> = {
    custom_pricing_set_by: userId,
    custom_pricing_set_at: new Date().toISOString(),
  }
  if ('custom_included_minutes' in body) {
    updatePayload.custom_included_minutes = body.custom_included_minutes
  }
  if ('custom_overage_rate_x10000' in body) {
    updatePayload.custom_overage_rate_x10000 = body.custom_overage_rate_x10000
  }
  if ('custom_monthly_fee_cents' in body) {
    updatePayload.custom_monthly_fee_cents = body.custom_monthly_fee_cents
  }
  if ('custom_pricing_note' in body) {
    updatePayload.custom_pricing_note = body.custom_pricing_note
  }

  const { error: updateErr } = await supabase
    .from('organizations')
    .update(updatePayload)
    .eq('id', orgId)

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  // Write audit row
  await supabase.from('custom_pricing_audit').insert({
    organization_id: orgId,
    changed_by: userId,
    old_included_minutes: before.custom_included_minutes,
    new_included_minutes:
      'custom_included_minutes' in body
        ? body.custom_included_minutes
        : before.custom_included_minutes,
    old_overage_rate_x10000: before.custom_overage_rate_x10000,
    new_overage_rate_x10000:
      'custom_overage_rate_x10000' in body
        ? body.custom_overage_rate_x10000
        : before.custom_overage_rate_x10000,
    old_monthly_fee_cents: before.custom_monthly_fee_cents,
    new_monthly_fee_cents:
      'custom_monthly_fee_cents' in body
        ? body.custom_monthly_fee_cents
        : before.custom_monthly_fee_cents,
    note: body.custom_pricing_note ?? null,
  })

  return NextResponse.json({ ok: true })
}
