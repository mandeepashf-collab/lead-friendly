import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { invalidateOrgBrand, loadOrgBrand } from '@/lib/branding/load'
import { UpdateOrgBrandInputSchema } from '@/lib/schemas/stage3'

// ────────────────────────────────────────────────────────────────────────────
// Stage 3.2 — /api/org/[id]/brand
// ────────────────────────────────────────────────────────────────────────────
// GET   → return the org's current OrgBrand (cached 60s server-side).
// PATCH → update branding fields; owners/admins of the org only.
//         Validates via UpdateOrgBrandInputSchema; writes snake_case to DB.
//         Stage 3.5.4 — writes a branding.updated audit row with a from/to
//         diff. Long string fields (custom_css, signed logo URLs) are
//         truncated to keep audit rows compact. No-op saves (every field
//         unchanged) skip the audit insert entirely.
// ────────────────────────────────────────────────────────────────────────────

// Audit-log diff payload truncation. Branding fields are short by convention
// (colors, font names, portal_name) but custom_css and signed logo URLs can
// blow up the audit row. Strings over 500 chars get sliced to 500 + a marker
// that preserves the original length for forensic purposes; non-strings pass
// through untouched.
function truncateValue(v: unknown): unknown {
  if (typeof v === 'string' && v.length > 500) {
    return v.slice(0, 500) + `...[truncated, ${v.length} chars total]`
  }
  return v
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: orgId } = await params

  // AuthZ: caller must be a member of the org.
  const supabase = await createClient()
  const { data: { user }, error: userErr } = await supabase.auth.getUser()
  if (!user || userErr) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.organization_id || profile.organization_id !== orgId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const brand = await loadOrgBrand(orgId)
  return NextResponse.json(brand, {
    headers: { 'Cache-Control': 'private, max-age=60' },
  })
}

// ────────────────────────────────────────────────────────────────────────────

const CAMEL_TO_SNAKE: Record<string, string> = {
  portalName: 'portal_name',
  primaryLogoUrl: 'primary_logo_url',
  faviconUrl: 'favicon_url',
  primaryColor: 'primary_color',
  secondaryColor: 'secondary_color',
  accentColor: 'accent_color',
  backgroundColor: 'background_color',
  textColor: 'text_color',
  sidebarColor: 'sidebar_color',
  headingFont: 'heading_font',
  bodyFont: 'body_font',
  supportEmail: 'support_email',
  supportPhone: 'support_phone',
  footerText: 'footer_text',
  customCss: 'custom_css',
  hidePlatformBranding: 'hide_platform_branding',
  customDomain: 'custom_domain',
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: orgId } = await params

  const supabase = await createClient()
  const { data: { user }, error: userErr } = await supabase.auth.getUser()
  if (!user || userErr) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  // AuthZ: user must be owner/admin of the org (matches Stage 3.1 policy Q1).
  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id, role')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.organization_id || profile.organization_id !== orgId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  if (profile.role !== 'owner' && profile.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden_role' }, { status: 403 })
  }

  // Validate body.
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const parsed = UpdateOrgBrandInputSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', issues: parsed.error.issues },
      { status: 400 },
    )
  }

  // Build snake_case update payload. Skip keys not in the whitelist.
  const update: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(parsed.data)) {
    const col = CAMEL_TO_SNAKE[k]
    if (!col) continue
    update[col] = v
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'empty_update' }, { status: 400 })
  }

  // Use service client to write — RLS on organizations is tight, and the
  // auth check above is sufficient for Stage 3.2. After Stage 3.1 ships,
  // this should migrate to RLS-backed writes with a role-gated policy.
  const svc = createServiceClient()

  // Read pre-update snapshot of just the columns being written, so the
  // audit log below can record from/to diffs. Run this BEFORE the update.
  const updateCols = Object.keys(update)
  const { data: beforeRow } = await svc
    .from('organizations')
    .select(updateCols.join(', '))
    .eq('id', orgId)
    .maybeSingle()

  const { error: updateErr } = await svc
    .from('organizations')
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq('id', orgId)

  if (updateErr) {
    console.error('[PATCH /api/org/brand] update failed:', updateErr)
    return NextResponse.json({ error: 'update_failed' }, { status: 500 })
  }

  // Audit log — best-effort. Don't block on failure; the brand update has
  // already committed. Skip the insert entirely for no-op saves where every
  // field in the patch matched the existing value (the client may diff
  // imperfectly — e.g. user edits then reverts a field — and we don't want
  // to fill the audit log with empty-change rows).
  try {
    if (beforeRow) {
      // supabase-js infers a GenericStringError union when .select() is
      // called with a dynamically-built column list (vs a literal). Cast
      // through unknown — by this point updateErr was null, so the row
      // shape is known to be Record<column, value>.
      const before = beforeRow as unknown as Record<string, unknown>
      const changes: Record<string, { from: unknown; to: unknown }> = {}
      for (const col of updateCols) {
        const beforeVal = before[col]
        const afterVal = update[col]
        if (beforeVal !== afterVal) {
          changes[col] = {
            from: truncateValue(beforeVal),
            to: truncateValue(afterVal),
          }
        }
      }
      if (Object.keys(changes).length > 0) {
        const { error: auditErr } = await svc.from('audit_logs').insert({
          organization_id: orgId,
          user_id: user.id,
          user_name: user.email ?? null,
          action: 'branding.updated',
          resource_type: 'organizations.brand',
          resource_id: orgId,
          details: { changes },
        })
        if (auditErr) {
          console.warn('[PATCH /api/org/brand] audit log insert failed:', auditErr.message)
        }
      }
    }
  } catch (e) {
    console.warn('[PATCH /api/org/brand] audit log block threw:', e)
  }

  invalidateOrgBrand(orgId)
  const fresh = await loadOrgBrand(orgId)
  return NextResponse.json(fresh)
}
