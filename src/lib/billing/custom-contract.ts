import type { SupabaseClient } from '@supabase/supabase-js'
import type { TierId, BillingInterval } from '@/config/pricing'

/**
 * D3: Resolve a custom-contract org from a Stripe Price ID.
 *
 * Used by the Stripe webhook handler to identify orgs paying on a custom
 * contract, where the Price ID lives on `organizations.custom_stripe_price_id`
 * (created in D2's PATCH handler) rather than in the static pricing.ts config.
 *
 * Lookup discipline:
 *   - Match against `custom_stripe_price_id` (platform-fee Price). The WL
 *     Price (`custom_wl_stripe_price_id`) is intentionally NOT a primary
 *     match key — it identifies the WL line item *within* a subscription
 *     whose tier was already established by the platform-fee Price.
 *   - Exclude archived contracts (`custom_contract_archived_at IS NOT NULL`)
 *     so stale Stripe Price IDs from renegotiated contracts don't accidentally
 *     match incoming webhook events.
 *
 * Returns null if no active custom contract has this Price ID. The webhook
 * caller falls back to standard pricing.ts resolution (tier-based).
 */

export interface CustomContractMatch {
  orgId: string
  tierId: TierId
  interval: BillingInterval
  /** Bundle of minutes covered by the platform fee. */
  includedMinutes: number
  /** Per-minute rate (× 10000) charged from wallet above the bundle. */
  overageRateX10000: number
  /** Display rate × 10000. Stored for invoice readouts; not used for billing. */
  framingRateX10000: number
  /** WL Price ID if the contract has WL. Used for line-item recognition. */
  wlStripePriceId: string | null
  /** WL fee in cents if WL is enabled. */
  wlFeeCents: number | null
}

export async function getCustomContractByPriceId(
  supabase: SupabaseClient,
  stripePriceId: string,
): Promise<CustomContractMatch | null> {
  const { data, error } = await supabase
    .from('organizations')
    .select(
      'id, custom_billing_interval, custom_included_minutes, custom_overage_rate_x10000, custom_framing_rate_x10000, custom_wl_stripe_price_id, custom_wl_fee_cents',
    )
    .eq('custom_stripe_price_id', stripePriceId)
    .is('custom_contract_archived_at', null)
    .maybeSingle()

  if (error || !data) return null

  // Defense: a contract with a Price ID stamped should also have the
  // operational fields filled. If not, treat as no-match — better to
  // fall through to standard tier resolution than apply a half-baked
  // contract.
  if (
    data.custom_billing_interval !== 'monthly'
    && data.custom_billing_interval !== 'annual'
  ) {
    return null
  }
  if (
    data.custom_included_minutes === null
    || data.custom_overage_rate_x10000 === null
  ) {
    return null
  }

  return {
    orgId: data.id as string,
    tierId: 'custom',
    interval: data.custom_billing_interval as BillingInterval,
    includedMinutes: data.custom_included_minutes as number,
    overageRateX10000: data.custom_overage_rate_x10000 as number,
    framingRateX10000: (data.custom_framing_rate_x10000 as number | null) ?? 0,
    wlStripePriceId: (data.custom_wl_stripe_price_id as string | null) ?? null,
    wlFeeCents: (data.custom_wl_fee_cents as number | null) ?? null,
  }
}

/**
 * D3: Recognize a Stripe Price ID as a custom contract's WL line item.
 *
 * Used by the webhook to set `is_white_label_enabled` for custom subs.
 * Distinct from `isWhiteLabelAddonPriceId` in pricing.ts which only
 * matches the global Agency-tier WL add-on Price IDs from env vars.
 *
 * Per-org WL Price IDs are minted dynamically in D2's PATCH handler, so
 * we need a DB lookup. Returns true if any active org has this Price as
 * their custom WL Price.
 */
export async function isCustomContractWlPriceId(
  supabase: SupabaseClient,
  stripePriceId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('organizations')
    .select('id')
    .eq('custom_wl_stripe_price_id', stripePriceId)
    .is('custom_contract_archived_at', null)
    .limit(1)
    .maybeSingle()
  return !!data
}

/**
 * D3: Ensure a wallet row exists for an org. Idempotent insert.
 *
 * Defensive fix for the rare case where an org somehow lacks a wallet —
 * historically every org should get one via mig 036 backfill, but at least
 * one test org slipped through (Rupa Rani in D2 smoke testing). Calling this
 * in the webhook before custom-tier subscription stamping keeps the system
 * self-healing without requiring a migration to fix every single such org.
 *
 * Defaults match the post-mig-036 default state: $0 balance, auto-reload
 * enabled with $10 threshold + $50 reload. We rely on the DB column
 * defaults rather than restating them in code so the two stay in sync.
 */
export async function ensureOrgWallet(
  supabase: SupabaseClient,
  orgId: string,
): Promise<void> {
  // Use upsert with onConflict on organization_id — Supabase JS client
  // handles ON CONFLICT DO NOTHING semantics via ignoreDuplicates.
  const { error } = await supabase
    .from('org_wallets')
    .upsert(
      { organization_id: orgId },
      { onConflict: 'organization_id', ignoreDuplicates: true },
    )
  if (error) {
    // Non-fatal — log and continue. The wallet-guard will surface any
    // remaining issue to the call originator.
    console.warn('[ensureOrgWallet] insert failed:', error.message)
  }
}
