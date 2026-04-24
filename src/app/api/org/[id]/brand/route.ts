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
// ────────────────────────────────────────────────────────────────────────────

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
  const { error: updateErr } = await svc
    .from('organizations')
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq('id', orgId)

  if (updateErr) {
    console.error('[PATCH /api/org/brand] update failed:', updateErr)
    return NextResponse.json({ error: 'update_failed' }, { status: 500 })
  }

  invalidateOrgBrand(orgId)
  const fresh = await loadOrgBrand(orgId)
  return NextResponse.json(fresh)
}
