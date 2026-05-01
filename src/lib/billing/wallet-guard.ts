/**
 * Wallet guard — checks whether an org is allowed to start an outbound call.
 *
 * Defined here in Phase 1.5 but NOT yet wired in. Phase 1.6 will add calls
 * to this from /api/webrtc/create-call, /api/calls/sip-outbound, and
 * /api/softphone/initiate.
 *
 * Returns a structured "allow / deny + reason" result rather than throwing.
 * Callers are expected to translate the deny reason into the right HTTP
 * response (402 Payment Required is the convention).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { getTierById, type TierId } from '@/config/pricing'

export interface WalletGuardAllow {
  allowed: true
  /** Useful for UI: how many minutes are still in-bundle. */
  bundleMinutesRemaining: number
  walletBalanceCents: number
}

export interface WalletGuardDeny {
  allowed: false
  reason:
    | 'org_not_found'
    | 'tier_unknown'
    | 'solo_trial_exhausted'
    | 'wallet_blocked_zero_balance'
    | 'wallet_blocked_auto_reload_failed'
    | 'wallet_blocked_manual'
    | 'wallet_blocked_subscription_canceled'
    | 'subscription_canceled'
    | 'unexpected_error'
  /** Human-friendly message safe to show users. */
  message: string
  /** Suggested HTTP status. 402 for payment-required, 403 for canceled, 500 for errors. */
  httpStatus: number
}

export type WalletGuardResult = WalletGuardAllow | WalletGuardDeny

export interface WalletGuardInput {
  organizationId: string
  /**
   * Service-role OR session-bound Supabase client. Read-only operations on
   * organizations + org_wallets are RLS-permitted for org members, so a
   * session client works as long as the user belongs to organizationId.
   * Service-role bypasses RLS for server-to-server contexts (campaign launch).
   */
  supabase: SupabaseClient
}

export async function checkOutboundCallAllowed(
  input: WalletGuardInput,
): Promise<WalletGuardResult> {
  const { organizationId, supabase } = input

  try {
    // Fetch org tier + period state and wallet state in parallel
    const [orgRes, walletRes] = await Promise.all([
      supabase
        .from('organizations')
        .select('tier, current_period_minutes_used, subscription_status')
        .eq('id', organizationId)
        .maybeSingle(),
      supabase
        .from('org_wallets')
        .select('balance_cents, is_blocked, blocked_reason')
        .eq('organization_id', organizationId)
        .maybeSingle(),
    ])

    if (orgRes.error || !orgRes.data) {
      return {
        allowed: false,
        reason: 'org_not_found',
        message: 'Organization not found.',
        httpStatus: 500,
      }
    }

    const org = orgRes.data as {
      tier: TierId
      current_period_minutes_used: number
      subscription_status: string | null
    }
    const wallet = walletRes.data as {
      balance_cents: number
      is_blocked: boolean
      blocked_reason: string | null
    } | null

    // Subscription canceled overrides everything except free trial
    if (org.subscription_status === 'canceled' && org.tier !== 'solo') {
      return {
        allowed: false,
        reason: 'subscription_canceled',
        message: 'Your subscription was canceled. Reactivate billing to make calls.',
        httpStatus: 402,
      }
    }

    const tier = getTierById(org.tier)
    if (!tier) {
      return {
        allowed: false,
        reason: 'tier_unknown',
        message: `Unknown tier: ${org.tier}`,
        httpStatus: 500,
      }
    }

    const minutesUsed = org.current_period_minutes_used ?? 0
    const bundleMinutesRemaining = Math.max(0, tier.includedMinutes - minutesUsed)

    // Solo: hard cap at 30 trial minutes, no wallet, no overage
    if (tier.id === 'solo') {
      // Even on Solo, respect a manual block (e.g., admin paused the org)
      if (wallet?.is_blocked) {
        return {
          allowed: false,
          reason: 'wallet_blocked_manual',
          message: 'Calls are paused on this account. Contact support to resume.',
          httpStatus: 402,
        }
      }
      if (minutesUsed >= tier.includedMinutes) {
        return {
          allowed: false,
          reason: 'solo_trial_exhausted',
          message:
            'Free trial used up. Upgrade to Starter or higher to continue making calls.',
          httpStatus: 402,
        }
      }
      return {
        allowed: true,
        bundleMinutesRemaining,
        walletBalanceCents: 0,
      }
    }

    // Custom: trust the manual setup, no auto-block
    if (tier.id === 'custom') {
      return {
        allowed: true,
        bundleMinutesRemaining: tier.includedMinutes - minutesUsed,
        walletBalanceCents: wallet?.balance_cents ?? 0,
      }
    }

    // Paid tiers (starter/pro/agency/founding) — wallet rules apply
    if (!wallet) {
      // Defensive — every org should have a wallet row from migration 036 backfill
      return {
        allowed: false,
        reason: 'unexpected_error',
        message: 'Wallet record missing. Please contact support.',
        httpStatus: 500,
      }
    }

    if (wallet.is_blocked) {
      const reasonMap: Record<string, WalletGuardDeny['reason']> = {
        zero_balance: 'wallet_blocked_zero_balance',
        auto_reload_failed: 'wallet_blocked_auto_reload_failed',
        manual_block: 'wallet_blocked_manual',
        subscription_canceled: 'wallet_blocked_subscription_canceled',
      }
      const messageMap: Record<string, string> = {
        zero_balance:
          'Wallet balance is zero. Top up to resume calls (or wait for auto-reload to retry).',
        auto_reload_failed:
          'Auto-reload failed. Check your card on file or top up manually.',
        manual_block: 'Calls are paused on this account.',
        subscription_canceled:
          'Subscription is canceled. Reactivate to resume calls.',
      }
      const reason = reasonMap[wallet.blocked_reason ?? ''] ?? 'wallet_blocked_manual'
      return {
        allowed: false,
        reason,
        message: messageMap[wallet.blocked_reason ?? ''] ?? 'Calls are paused.',
        httpStatus: 402,
      }
    }

    // Bundle still has minutes → call is free, allow regardless of wallet balance
    if (bundleMinutesRemaining > 0) {
      return {
        allowed: true,
        bundleMinutesRemaining,
        walletBalanceCents: wallet.balance_cents,
      }
    }

    // Bundle exhausted → wallet must have at least enough for ~1 min of overage.
    // Use highest overage rate ($0.16) as a conservative gate to avoid mid-call failure.
    const minRequiredCents = Math.ceil(tier.overageRate * 100)  // 1 min worth, in cents
    if (wallet.balance_cents < minRequiredCents) {
      return {
        allowed: false,
        reason: 'wallet_blocked_zero_balance',
        message:
          'Bundle exhausted and wallet balance too low for another minute. Top up or upgrade.',
        httpStatus: 402,
      }
    }

    return {
      allowed: true,
      bundleMinutesRemaining: 0,
      walletBalanceCents: wallet.balance_cents,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[billing/wallet-guard] unexpected error:', { organizationId, error: msg })
    return {
      allowed: false,
      reason: 'unexpected_error',
      message: 'Could not verify call eligibility. Please try again.',
      httpStatus: 500,
    }
  }
}
