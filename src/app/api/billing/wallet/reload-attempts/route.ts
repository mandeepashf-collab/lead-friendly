import { NextRequest, NextResponse } from 'next/server'
import { createClient as createUserClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

/**
 * GET /api/billing/wallet/reload-attempts?limit=10
 *
 * Phase 5: Returns the most recent wallet auto-reload attempts for the
 * caller's organization. Used by /settings/billing to show audit trail —
 * particularly important when a wallet is blocked and the customer needs
 * to see WHY (the Stripe error message).
 *
 * Auth: requires user session. Org derived from profile.
 *
 * Note: wallet_reload_attempts has RLS that already restricts to org
 * members, but we use service-role here for consistency with the rest
 * of the billing routes (they all use service-role for predictable
 * permissions and to keep the user-facing supabase client lean).
 *
 * Response:
 *   {
 *     attempts: [{
 *       id, triggerSource, amountCents, status,
 *       stripePaymentIntentId, stripeErrorCode, stripeErrorMessage,
 *       createdAt, completedAt,
 *     }, ...]
 *   }
 */

const supabaseService = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

const DEFAULT_LIMIT = 10
const MAX_LIMIT = 50

export async function GET(req: NextRequest) {
  const supabaseUser = await createUserClient()
  const {
    data: { user },
    error: userErr,
  } = await supabaseUser.auth.getUser()
  if (userErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabaseService
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()

  if (!profile?.organization_id) {
    return NextResponse.json({ error: 'No organization' }, { status: 403 })
  }

  const limitParam = req.nextUrl.searchParams.get('limit')
  let limit = DEFAULT_LIMIT
  if (limitParam) {
    const parsed = parseInt(limitParam, 10)
    if (Number.isFinite(parsed) && parsed > 0) {
      limit = Math.min(parsed, MAX_LIMIT)
    }
  }

  const { data, error } = await supabaseService
    .from('wallet_reload_attempts')
    .select(
      'id, trigger_source, amount_cents, status, stripe_payment_intent_id, stripe_error_code, stripe_error_message, created_at, completed_at',
    )
    .eq('organization_id', profile.organization_id)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[reload-attempts] query error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const attempts = (data ?? []).map((row) => ({
    id: row.id,
    triggerSource: row.trigger_source,
    amountCents: row.amount_cents,
    status: row.status,
    stripePaymentIntentId: row.stripe_payment_intent_id,
    stripeErrorCode: row.stripe_error_code,
    stripeErrorMessage: row.stripe_error_message,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  }))

  return NextResponse.json({ attempts })
}
