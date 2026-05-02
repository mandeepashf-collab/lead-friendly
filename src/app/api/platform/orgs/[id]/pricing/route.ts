import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { requirePlatformStaff } from '@/lib/platform-staff/auth'

/**
 * D2: Custom-contract admin endpoints (platform-staff only).
 *
 * GET  /api/platform/orgs/[id]/pricing
 *   Returns current contract values + audit history (last 20 changes).
 *
 * PATCH /api/platform/orgs/[id]/pricing
 *   Body (full contract):
 *     {
 *       monthly_fee_cents: number,            // ≥ 0
 *       included_minutes: number,             // ≥ 0
 *       framing_rate_x10000: number,          // ≥ 0 (display only)
 *       overage_rate_x10000: number,          // ≥ 0
 *       billing_interval: 'monthly' | 'annual',
 *       wl_enabled: boolean,
 *       wl_fee_cents: number | null,          // required when wl_enabled
 *       note: string | null,                  // internal audit note
 *       force_replace_founding?: boolean,     // required if org.tier === 'founding'
 *     }
 *
 *   Behavior:
 *     - Validates inputs.
 *     - Founding mutex: refuses save when tier='founding' unless
 *       force_replace_founding=true.
 *     - Compares to existing org row to classify edit:
 *         material   = monthly_fee | included_minutes | overage_rate
 *                    | billing_interval | wl_fee changed (incl null↔value)
 *         non-material = framing_rate or note only
 *     - On material edit (or first save): creates Stripe Product (if absent)
 *       and creates new Stripe Price(s) for platform fee + optional WL fee.
 *       Old Prices (if any) are archived via stripe.prices.update({active:false}).
 *       Note: archiving a Price does NOT migrate existing subscriptions —
 *       those continue on the old Price until manual cancel/re-checkout.
 *       This matches the renegotiation flow in the architecture memo.
 *     - On non-material edit: updates columns + audit only, no Stripe calls.
 *     - Sets organizations.tier='custom' on every successful save.
 *     - Writes audit row to custom_pricing_audit on every successful save.
 */

interface RouteContext {
  params: Promise<{ id: string }>
}

const STRIPE_API_VERSION = '2026-03-25.dahlia' as const

interface ContractInput {
  monthly_fee_cents: number
  included_minutes: number
  framing_rate_x10000: number
  overage_rate_x10000: number
  billing_interval: 'monthly' | 'annual'
  wl_enabled: boolean
  wl_fee_cents: number | null
  note: string | null
  force_replace_founding?: boolean
}

function isNonNegInt(x: unknown): x is number {
  return typeof x === 'number' && Number.isInteger(x) && x >= 0
}

function validateContract(body: unknown): ContractInput | string {
  if (!body || typeof body !== 'object') return 'Invalid JSON body'
  const b = body as Record<string, unknown>

  if (!isNonNegInt(b.monthly_fee_cents)) {
    return 'monthly_fee_cents must be a non-negative integer (cents)'
  }
  if (!isNonNegInt(b.included_minutes)) {
    return 'included_minutes must be a non-negative integer'
  }
  if (!isNonNegInt(b.framing_rate_x10000)) {
    return 'framing_rate_x10000 must be a non-negative integer'
  }
  if (!isNonNegInt(b.overage_rate_x10000)) {
    return 'overage_rate_x10000 must be a non-negative integer'
  }
  if (b.billing_interval !== 'monthly' && b.billing_interval !== 'annual') {
    return 'billing_interval must be "monthly" or "annual"'
  }
  if (typeof b.wl_enabled !== 'boolean') {
    return 'wl_enabled must be boolean'
  }
  if (b.wl_enabled) {
    if (!isNonNegInt(b.wl_fee_cents)) {
      return 'wl_fee_cents required when wl_enabled (non-negative integer)'
    }
  } else {
    if (b.wl_fee_cents !== null && b.wl_fee_cents !== undefined) {
      return 'wl_fee_cents must be null when wl_enabled is false'
    }
  }
  if (b.note !== null && b.note !== undefined && typeof b.note !== 'string') {
    return 'note must be a string or null'
  }
  if (
    b.force_replace_founding !== undefined
    && typeof b.force_replace_founding !== 'boolean'
  ) {
    return 'force_replace_founding must be boolean if present'
  }

  return {
    monthly_fee_cents: b.monthly_fee_cents,
    included_minutes: b.included_minutes,
    framing_rate_x10000: b.framing_rate_x10000,
    overage_rate_x10000: b.overage_rate_x10000,
    billing_interval: b.billing_interval,
    wl_enabled: b.wl_enabled,
    wl_fee_cents: b.wl_enabled ? (b.wl_fee_cents as number) : null,
    note: typeof b.note === 'string' ? b.note : null,
    force_replace_founding: b.force_replace_founding === true,
  }
}

interface OrgRow {
  id: string
  name: string
  tier: string | null
  custom_monthly_fee_cents: number | null
  custom_included_minutes: number | null
  custom_framing_rate_x10000: number | null
  custom_overage_rate_x10000: number | null
  custom_wl_fee_cents: number | null
  custom_billing_interval: string | null
  custom_stripe_product_id: string | null
  custom_stripe_price_id: string | null
  custom_wl_stripe_price_id: string | null
  custom_pricing_note: string | null
}

/**
 * Material change = something that requires a new Stripe Price.
 * Non-material change = framing rate (display-only) or note.
 *
 * Treats null↔value transitions as material (e.g. enabling WL for the first
 * time, or clearing the bundle).
 */
function isMaterialChange(before: OrgRow, next: ContractInput): boolean {
  if (before.custom_monthly_fee_cents !== next.monthly_fee_cents) return true
  if (before.custom_included_minutes !== next.included_minutes) return true
  if (before.custom_overage_rate_x10000 !== next.overage_rate_x10000) return true
  if (before.custom_billing_interval !== next.billing_interval) return true
  if ((before.custom_wl_fee_cents ?? null) !== (next.wl_fee_cents ?? null)) {
    return true
  }
  return false
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
        'id, name, tier, custom_monthly_fee_cents, custom_included_minutes, custom_framing_rate_x10000, custom_overage_rate_x10000, custom_wl_fee_cents, custom_billing_interval, custom_stripe_product_id, custom_stripe_price_id, custom_wl_stripe_price_id, custom_contract_archived_at, custom_pricing_note, custom_pricing_set_at, custom_pricing_set_by',
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

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const validated = validateContract(raw)
  if (typeof validated === 'string') {
    return NextResponse.json({ error: validated }, { status: 400 })
  }
  const next = validated

  // Read current org state
  const { data: before, error: beforeErr } = await supabase
    .from('organizations')
    .select(
      'id, name, tier, custom_monthly_fee_cents, custom_included_minutes, custom_framing_rate_x10000, custom_overage_rate_x10000, custom_wl_fee_cents, custom_billing_interval, custom_stripe_product_id, custom_stripe_price_id, custom_wl_stripe_price_id, custom_pricing_note',
    )
    .eq('id', orgId)
    .maybeSingle<OrgRow>()

  if (beforeErr || !before) {
    return NextResponse.json({ error: 'Org not found' }, { status: 404 })
  }

  // Founding mutex (decision 4 from memo). Soft warn on the form side, hard
  // server-side guard. Founding slot stays consumed (not reclaimed) — that's
  // the cost of the perpetual locked-in rate they're walking away from.
  if (before.tier === 'founding' && !next.force_replace_founding) {
    return NextResponse.json(
      {
        error:
          'This org is on the Founding tier. Replacing it with a custom contract '
          + 'forfeits the locked-in Founding rate (the slot stays consumed). '
          + 'Set force_replace_founding=true to confirm.',
        founding_replace_required: true,
      },
      { status: 409 },
    )
  }

  const material = isMaterialChange(before, next)

  // ─── Stripe primitive updates (only on material change) ───
  let newProductId = before.custom_stripe_product_id
  let newPriceId = before.custom_stripe_price_id
  let newWlPriceId = before.custom_wl_stripe_price_id
  const stripeKey = process.env.STRIPE_SECRET_KEY

  if (material) {
    if (!stripeKey) {
      return NextResponse.json(
        { error: 'Stripe is not configured — set STRIPE_SECRET_KEY in env vars' },
        { status: 500 },
      )
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stripe = new Stripe(stripeKey, { apiVersion: STRIPE_API_VERSION as any })

    // 1. Reuse existing Product if any, else create one.
    if (!newProductId) {
      try {
        const product = await stripe.products.create({
          name: `Custom — ${before.name}`,
          metadata: {
            lf_org_id: before.id,
            lf_kind: 'custom_contract',
          },
        })
        newProductId = product.id
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return NextResponse.json(
          { error: `Stripe product creation failed: ${msg}` },
          { status: 500 },
        )
      }
    }

    // 2. Archive old Prices (if any) so they don't match future webhooks.
    //    This does NOT cancel existing subscriptions — those continue on
    //    the old Price until manual cancel/re-checkout. Memo's renegotiation
    //    flow expects this.
    const archivePromises: Promise<unknown>[] = []
    if (before.custom_stripe_price_id) {
      archivePromises.push(
        stripe.prices
          .update(before.custom_stripe_price_id, { active: false })
          .catch((err) => {
            // Don't block save on archive failure — log and continue.
            console.warn(
              '[custom-pricing] failed to archive old platform Price:',
              err instanceof Error ? err.message : err,
            )
          }),
      )
    }
    if (before.custom_wl_stripe_price_id) {
      archivePromises.push(
        stripe.prices
          .update(before.custom_wl_stripe_price_id, { active: false })
          .catch((err) => {
            console.warn(
              '[custom-pricing] failed to archive old WL Price:',
              err instanceof Error ? err.message : err,
            )
          }),
      )
    }
    await Promise.all(archivePromises)

    // 3. Create new platform-fee Price.
    try {
      const platformPrice = await stripe.prices.create({
        product: newProductId,
        currency: 'usd',
        unit_amount: next.monthly_fee_cents,
        recurring: {
          interval: next.billing_interval === 'annual' ? 'year' : 'month',
          usage_type: 'licensed',
        },
        tax_behavior: 'exclusive',
        metadata: {
          lf_org_id: before.id,
          lf_kind: 'custom_platform',
          lf_included_minutes: String(next.included_minutes),
          lf_framing_rate_x10000: String(next.framing_rate_x10000),
          lf_overage_rate_x10000: String(next.overage_rate_x10000),
        },
      })
      newPriceId = platformPrice.id
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return NextResponse.json(
        { error: `Stripe platform Price creation failed: ${msg}` },
        { status: 500 },
      )
    }

    // 4. Create WL Price if enabled.
    if (next.wl_enabled && next.wl_fee_cents !== null) {
      try {
        const wlPrice = await stripe.prices.create({
          product: newProductId,
          currency: 'usd',
          unit_amount: next.wl_fee_cents,
          recurring: {
            interval: next.billing_interval === 'annual' ? 'year' : 'month',
            usage_type: 'licensed',
          },
          tax_behavior: 'exclusive',
          metadata: {
            lf_org_id: before.id,
            lf_kind: 'custom_wl',
          },
        })
        newWlPriceId = wlPrice.id
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return NextResponse.json(
          { error: `Stripe WL Price creation failed: ${msg}` },
          { status: 500 },
        )
      }
    } else {
      newWlPriceId = null
    }
  }
  // Non-material edit: framing rate or note changed only. Keep existing
  // Stripe IDs untouched, no Stripe calls.

  // ─── Persist to DB ───
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updatePayload: Record<string, any> = {
    tier: 'custom',
    custom_monthly_fee_cents: next.monthly_fee_cents,
    custom_included_minutes: next.included_minutes,
    custom_framing_rate_x10000: next.framing_rate_x10000,
    custom_overage_rate_x10000: next.overage_rate_x10000,
    custom_wl_fee_cents: next.wl_fee_cents,
    custom_billing_interval: next.billing_interval,
    custom_stripe_product_id: newProductId,
    custom_stripe_price_id: newPriceId,
    custom_wl_stripe_price_id: newWlPriceId,
    custom_pricing_note: next.note,
    custom_pricing_set_by: userId,
    custom_pricing_set_at: new Date().toISOString(),
    // Active edit clears archived_at so a re-saved contract becomes "live"
    // again from the webhook resolver's perspective.
    custom_contract_archived_at: null,
  }

  const { error: updateErr } = await supabase
    .from('organizations')
    .update(updatePayload)
    .eq('id', orgId)

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  // ─── Audit row ───
  // The custom_pricing_audit table predates D2 and only has columns for
  // included_minutes, overage_rate_x10000, monthly_fee_cents, note. We
  // record the headline numbers there; richer diff fields (WL, interval,
  // framing rate, founding replacement flag) go into the note string.
  const auditNoteParts: string[] = []
  if (next.note) auditNoteParts.push(next.note)
  auditNoteParts.push(
    `interval=${next.billing_interval}`,
    `framing=${next.framing_rate_x10000}`,
    `wl=${next.wl_enabled ? next.wl_fee_cents : 'off'}`,
    material ? 'material_edit' : 'non_material_edit',
  )
  if (before.tier === 'founding' && next.force_replace_founding) {
    auditNoteParts.push('replaced_founding')
  }
  const auditNote = auditNoteParts.join(' · ')

  await supabase.from('custom_pricing_audit').insert({
    organization_id: orgId,
    changed_by: userId,
    old_included_minutes: before.custom_included_minutes,
    new_included_minutes: next.included_minutes,
    old_overage_rate_x10000: before.custom_overage_rate_x10000,
    new_overage_rate_x10000: next.overage_rate_x10000,
    old_monthly_fee_cents: before.custom_monthly_fee_cents,
    new_monthly_fee_cents: next.monthly_fee_cents,
    note: auditNote,
  })

  return NextResponse.json({
    ok: true,
    material,
    stripe: {
      product_id: newProductId,
      price_id: newPriceId,
      wl_price_id: newWlPriceId,
    },
  })
}
