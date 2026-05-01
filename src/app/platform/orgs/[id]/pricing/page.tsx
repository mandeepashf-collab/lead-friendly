import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { CustomPricingForm } from './custom-pricing-form'

interface PageProps {
  params: Promise<{ id: string }>
}

/**
 * Phase 8: Custom pricing admin UI.
 *
 * URL: /platform/orgs/[id]/pricing
 *
 * Platform-staff only. Lets the operator (Mandeep) set per-org overrides
 * for included minutes, overage rate, and monthly fee. Setting a field
 * to blank/null reverts to tier default.
 *
 * Server component fetches the org + audit history, then hands off to
 * a client form for the actual editing UI.
 */
export default async function CustomPricingPage({ params }: PageProps) {
  const { id: orgId } = await params

  // Auth gate via Supabase
  const userClient = await createClient()
  const {
    data: { user },
  } = await userClient.auth.getUser()
  if (!user) redirect('/login')

  const { data: isStaff } = await userClient.rpc('is_platform_staff', {
    p_user_id: user.id,
  })
  if (!isStaff) redirect('/dashboard')

  // Service-role client for cross-org reads
  const admin = createServiceClient()

  const [orgRes, auditRes] = await Promise.all([
    admin
      .from('organizations')
      .select(
        'id, name, tier, billing_interval, custom_included_minutes, custom_overage_rate_x10000, custom_monthly_fee_cents, custom_pricing_note, custom_pricing_set_at, custom_pricing_set_by, parent_organization_id',
      )
      .eq('id', orgId)
      .maybeSingle(),
    admin
      .from('custom_pricing_audit')
      .select('id, changed_by, changed_at, old_included_minutes, new_included_minutes, old_overage_rate_x10000, new_overage_rate_x10000, old_monthly_fee_cents, new_monthly_fee_cents, note')
      .eq('organization_id', orgId)
      .order('changed_at', { ascending: false })
      .limit(20),
  ])

  if (!orgRes.data) {
    return (
      <div className="p-8 text-zinc-300">
        <h1 className="text-xl font-bold text-red-400">Org not found</h1>
        <p className="text-sm text-zinc-500 mt-2">Org id: {orgId}</p>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Custom pricing</h1>
        <p className="text-sm text-zinc-400 mt-1">
          {orgRes.data.name}
          <span className="ml-2 text-xs text-zinc-500">
            (tier: {orgRes.data.tier}, interval: {orgRes.data.billing_interval ?? '—'})
          </span>
        </p>
      </div>

      <CustomPricingForm
        orgId={orgId}
        initialValues={{
          custom_included_minutes: orgRes.data.custom_included_minutes,
          custom_overage_rate_x10000: orgRes.data.custom_overage_rate_x10000,
          custom_monthly_fee_cents: orgRes.data.custom_monthly_fee_cents,
          custom_pricing_note: orgRes.data.custom_pricing_note,
        }}
      />

      <div className="mt-10">
        <h2 className="text-sm font-semibold text-zinc-300 mb-3">
          Audit history (last 20)
        </h2>
        {(auditRes.data ?? []).length === 0 ? (
          <p className="text-xs text-zinc-500">
            No custom pricing changes yet for this org.
          </p>
        ) : (
          <div className="rounded-lg border border-zinc-800 overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-zinc-900/50">
                <tr className="text-zinc-500 text-[10px] uppercase tracking-wider">
                  <th className="text-left p-2">When</th>
                  <th className="text-left p-2">Minutes</th>
                  <th className="text-left p-2">Rate (x10000)</th>
                  <th className="text-left p-2">Fee (¢)</th>
                  <th className="text-left p-2">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {(auditRes.data ?? []).map((row) => (
                  <tr key={row.id} className="text-zinc-300">
                    <td className="p-2 whitespace-nowrap">
                      {new Date(row.changed_at).toLocaleString()}
                    </td>
                    <td className="p-2">
                      {row.old_included_minutes ?? '—'} → {row.new_included_minutes ?? '—'}
                    </td>
                    <td className="p-2">
                      {row.old_overage_rate_x10000 ?? '—'} → {row.new_overage_rate_x10000 ?? '—'}
                    </td>
                    <td className="p-2">
                      {row.old_monthly_fee_cents ?? '—'} → {row.new_monthly_fee_cents ?? '—'}
                    </td>
                    <td className="p-2 text-zinc-400">{row.note ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
