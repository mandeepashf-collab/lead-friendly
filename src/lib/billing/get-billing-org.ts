/**
 * Phase 8: TypeScript-side mirror of public.get_billing_org_id(uuid) SQL helper.
 *
 * Returns the parent_organization_id for sub-accounts, otherwise returns the
 * org's own id. Used wherever billing logic needs to find the org responsible
 * for paying — wallet guard, ai-minutes endpoint, settings/billing dashboard.
 *
 * Always read parent_organization_id via Supabase rather than trusting client
 * input. The SECURITY DEFINER SQL helper is the source of truth at the DB
 * boundary; this is a read-side convenience for app code that needs the same
 * resolution before making other queries.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface BillingOrgResolution {
  /** Original org id passed in. */
  callOrgId: string
  /** Org responsible for billing — same as callOrgId for top-level orgs. */
  billingOrgId: string
  /** True when callOrgId is a sub-account (has parent_organization_id). */
  isSubAccount: boolean
}

/**
 * Resolve a single org's billing org. Service-role or session-bound clients work;
 * organizations.parent_organization_id is RLS-readable for org members.
 */
export async function resolveBillingOrg(
  supabase: SupabaseClient,
  orgId: string,
): Promise<BillingOrgResolution> {
  const { data, error } = await supabase
    .from('organizations')
    .select('id, parent_organization_id')
    .eq('id', orgId)
    .maybeSingle()

  if (error) {
    throw new Error(`resolveBillingOrg: ${error.message}`)
  }
  if (!data) {
    throw new Error(`resolveBillingOrg: org ${orgId} not found`)
  }

  const parent = data.parent_organization_id as string | null
  if (parent) {
    return { callOrgId: orgId, billingOrgId: parent, isSubAccount: true }
  }
  return { callOrgId: orgId, billingOrgId: orgId, isSubAccount: false }
}
