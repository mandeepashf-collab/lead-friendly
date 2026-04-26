import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  BRAND_PREVIEW_COOKIE_NAME,
  BRAND_PREVIEW_COOKIE_MAX_AGE,
} from '@/lib/schemas/stage3'

// ────────────────────────────────────────────────────────────────────────────
// Stage 3.4 — POST/DELETE /api/brand-preview
// ────────────────────────────────────────────────────────────────────────────
// POST   → set lf_brand_preview=1 cookie, gated to agency admins server-side.
// DELETE → clear cookie. No auth check — anyone can opt themselves out.
//
// "Agency admin" matches the same rule middleware uses for is-agency-admin:
//   role IN ('owner','admin') AND organizations.parent_organization_id IS NULL.
// (There is no is_agency column on organizations.)
// ────────────────────────────────────────────────────────────────────────────

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, organization_id, organizations!inner(parent_organization_id)')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile) {
    return NextResponse.json({ error: 'profile_not_found' }, { status: 404 })
  }

  const orgRow = (Array.isArray(profile.organizations)
    ? profile.organizations[0]
    : profile.organizations) as
    | { parent_organization_id: string | null }
    | null
    | undefined

  const isAgencyAdmin =
    ['owner', 'admin'].includes(((profile.role as string) ?? '')) &&
    orgRow?.parent_organization_id == null

  if (!isAgencyAdmin) {
    return NextResponse.json(
      { error: 'only_agency_admins_can_preview_branding' },
      { status: 403 },
    )
  }

  const cookieStore = await cookies()
  cookieStore.set({
    name: BRAND_PREVIEW_COOKIE_NAME,
    value: '1',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: BRAND_PREVIEW_COOKIE_MAX_AGE,
  })
  return NextResponse.json({ active: true })
}

export async function DELETE() {
  const cookieStore = await cookies()
  cookieStore.delete(BRAND_PREVIEW_COOKIE_NAME)
  return NextResponse.json({ active: false })
}
