import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadOrgBrand } from '@/lib/branding/load'
import { BrandingClient } from './BrandingClient'

// ────────────────────────────────────────────────────────────────────────────
// /settings/branding — Stage 3.2 / 3.3.1
// ────────────────────────────────────────────────────────────────────────────
// Server shell: authenticate, fetch the current brand, hand off to the
// client form with hydrated initial state. Only owners/admins reach the form.
//
// Stage 3.3.1: defense-in-depth — sub-account users are bounced back to
// /settings before any data fetch. Reads the middleware-injected header
// because BrandContext is client-only and won't run in a server component.
// ────────────────────────────────────────────────────────────────────────────

export default async function BrandingSettingsPage() {
  const h = await headers()
  if (h.get('x-lf-user-is-sub-account') === '1') {
    redirect('/settings')
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id, role')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.organization_id) redirect('/login')
  if (profile.role !== 'owner' && profile.role !== 'admin') {
    redirect('/settings?denied=branding')
  }

  const brand = await loadOrgBrand(profile.organization_id)

  return (
    <BrandingClient
      orgId={profile.organization_id}
      initialBrand={brand}
    />
  )
}
