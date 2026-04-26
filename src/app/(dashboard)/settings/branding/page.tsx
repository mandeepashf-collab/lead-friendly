import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadOrgBrand } from '@/lib/branding/load'
import { BrandingClient } from './BrandingClient'

// ────────────────────────────────────────────────────────────────────────────
// /settings/branding — Stage 3.2
// ────────────────────────────────────────────────────────────────────────────
// Server shell: authenticate, fetch the current brand, hand off to the
// client form with hydrated initial state. Only owners/admins reach the form.
// ────────────────────────────────────────────────────────────────────────────

export default async function BrandingSettingsPage() {
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
