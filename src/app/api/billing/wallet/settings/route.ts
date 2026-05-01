import { NextRequest, NextResponse } from 'next/server'
import { createClient as createUserClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { WALLET_DEFAULTS } from '@/config/pricing'

/**
 * PATCH /api/billing/wallet/settings
 *
 * Phase 5: Updates the customer's wallet auto-reload preferences.
 *
 * Body (all optional — only provided fields are updated):
 *   {
 *     auto_reload_enabled?: boolean,
 *     auto_reload_threshold_cents?: number,
 *     auto_reload_amount_cents?: number,
 *   }
 *
 * Auth: requires user session. Resolves org via profile lookup. Any member
 * of the org can update wallet settings. (Tighten to admins-only later if
 * abuse becomes a concern; for now solo-founder workflows want flexibility.)
 *
 * Validation: bounds checked against WALLET_DEFAULTS.{thresholdRangeCents,
 * reloadRangeCents}. The DB has CHECK constraints too as defense in depth.
 *
 * Returns the updated wallet row so the client doesn't need a follow-up GET.
 */

const supabaseService = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

interface UpdatePayload {
  auto_reload_enabled?: boolean
  auto_reload_threshold_cents?: number
  auto_reload_amount_cents?: number
}

export async function PATCH(req: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────
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

  // ── Body ────────────────────────────────────────────────────
  let body: UpdatePayload
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // ── Validation ──────────────────────────────────────────────
  const updates: Partial<{
    auto_reload_enabled: boolean
    auto_reload_threshold_cents: number
    auto_reload_amount_cents: number
    updated_at: string
  }> = { updated_at: new Date().toISOString() }

  if (body.auto_reload_enabled !== undefined) {
    if (typeof body.auto_reload_enabled !== 'boolean') {
      return NextResponse.json(
        { error: 'auto_reload_enabled must be a boolean' },
        { status: 400 },
      )
    }
    updates.auto_reload_enabled = body.auto_reload_enabled
  }

  if (body.auto_reload_threshold_cents !== undefined) {
    const v = body.auto_reload_threshold_cents
    const { min, max } = WALLET_DEFAULTS.thresholdRangeCents
    if (!Number.isInteger(v) || v < min || v > max) {
      return NextResponse.json(
        {
          error: `auto_reload_threshold_cents must be an integer between ${min} and ${max} (got ${v})`,
        },
        { status: 400 },
      )
    }
    updates.auto_reload_threshold_cents = v
  }

  if (body.auto_reload_amount_cents !== undefined) {
    const v = body.auto_reload_amount_cents
    const { min, max } = WALLET_DEFAULTS.reloadRangeCents
    if (!Number.isInteger(v) || v < min || v > max) {
      return NextResponse.json(
        {
          error: `auto_reload_amount_cents must be an integer between ${min} and ${max} (got ${v})`,
        },
        { status: 400 },
      )
    }
    updates.auto_reload_amount_cents = v
  }

  // No-op guard: must update at least one field besides updated_at
  if (Object.keys(updates).length === 1) {
    return NextResponse.json(
      { error: 'No valid fields to update' },
      { status: 400 },
    )
  }

  // ── Apply ───────────────────────────────────────────────────
  const { data, error } = await supabaseService
    .from('org_wallets')
    .update(updates)
    .eq('organization_id', profile.organization_id)
    .select(
      'balance_cents, auto_reload_enabled, auto_reload_threshold_cents, auto_reload_amount_cents, is_blocked, blocked_reason',
    )
    .single()

  if (error || !data) {
    console.error('[wallet/settings] update error:', error?.message)
    return NextResponse.json(
      { error: error?.message ?? 'Failed to update wallet settings' },
      { status: 500 },
    )
  }

  return NextResponse.json({
    success: true,
    wallet: {
      balanceCents: data.balance_cents,
      autoReloadEnabled: data.auto_reload_enabled,
      autoReloadThresholdCents: data.auto_reload_threshold_cents,
      autoReloadAmountCents: data.auto_reload_amount_cents,
      isBlocked: data.is_blocked,
      blockedReason: data.blocked_reason,
    },
  })
}
