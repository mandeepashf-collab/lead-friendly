/**
 * Billing usage tracker
 *
 * Single entry point for recording call usage against an org's wallet.
 * Wired into call-end webhooks (webrtc/webhook room_finished, webrtc/call-complete,
 * voice/complete). Idempotent against retries via the record_call_usage RPC's
 * last_billed_seconds delta math.
 *
 * NEVER throw from this function. A billing failure should not break the
 * call-end flow — the call already happened. Errors are logged and a
 * structured failure result is returned.
 *
 * Phase 4.5: when record_call_usage returns needs_reload=true, this module
 * fires a fire-and-forget POST to /api/billing/wallet/auto-reload to charge
 * the customer's card. Charge result doesn't block the call-completion
 * response — auto-reload route handles its own atomic state via DB locks
 * and webhook redundancy.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface RecordCallUsageInput {
  callId: string
  /** Total call duration in seconds (NOT delta — total). RPC computes delta internally. */
  totalDurationSeconds: number
  supabase: SupabaseClient  // service-role client
}

export interface RecordCallUsageResult {
  ok: boolean
  /** Did this invocation produce new billing? false on retry/replay. */
  billed: boolean
  /** Reason for skip when billed=false. */
  reason?: string
  minutesAdded?: number
  newTotalMinutes?: number
  incrementalOverageMinutes?: number
  walletDebitedCents?: number
  walletBalanceAfterCents?: number | null
  walletBlocked?: boolean
  needsReload?: boolean
  tier?: string
  /** Internal error if RPC threw. Never thrown to caller. */
  errorMessage?: string
}

export async function recordCallUsage(input: RecordCallUsageInput): Promise<RecordCallUsageResult> {
  const { callId, totalDurationSeconds, supabase } = input

  // Skip zero-duration calls — nothing to bill, no point invoking the RPC.
  // Also catches the "call_started but never connected" case where webhooks
  // fire with duration=0.
  if (!callId) {
    return { ok: false, billed: false, reason: 'missing_call_id' }
  }
  if (!Number.isFinite(totalDurationSeconds) || totalDurationSeconds <= 0) {
    return { ok: true, billed: false, reason: 'zero_duration' }
  }

  try {
    const { data, error } = await supabase.rpc('record_call_usage', {
      p_call_id: callId,
      p_total_duration_seconds: Math.floor(totalDurationSeconds),
    })

    if (error) {
      console.error('[billing/usage] record_call_usage RPC error:', {
        callId,
        totalDurationSeconds,
        error: error.message,
      })
      return { ok: false, billed: false, reason: 'rpc_error', errorMessage: error.message }
    }

    const result = (data ?? {}) as Record<string, unknown>
    const billed = Boolean(result.billed)
    const wallet = (result.wallet_result ?? null) as Record<string, unknown> | null
    const needsReload = wallet ? Boolean(wallet.needs_reload) : false

    // Phase 4.5: fire-and-forget auto-reload trigger when wallet dipped
    // below threshold. We don't await — the auto-reload route handles
    // idempotency via DB lock, so even if multiple rapid debits all
    // trigger this, only one Stripe charge fires within the cooldown.
    if (needsReload && billed) {
      // Look up the org id from the call so we can pass it to the
      // auto-reload route. This is one extra read per overage call;
      // acceptable since overages are rare relative to in-bundle calls.
      void triggerAutoReload(supabase, callId).catch((err) => {
        console.error('[billing/usage] auto-reload trigger failed:', err)
      })
    }

    return {
      ok: true,
      billed,
      reason: typeof result.reason === 'string' ? result.reason : undefined,
      minutesAdded: typeof result.minutes_added === 'number' ? result.minutes_added : undefined,
      newTotalMinutes:
        typeof result.new_total_minutes === 'number' ? result.new_total_minutes : undefined,
      incrementalOverageMinutes:
        typeof result.incremental_overage_minutes === 'number'
          ? result.incremental_overage_minutes
          : undefined,
      walletDebitedCents:
        typeof result.wallet_debited_cents === 'number' ? result.wallet_debited_cents : 0,
      walletBalanceAfterCents:
        wallet && typeof wallet.balance_after_cents === 'number'
          ? wallet.balance_after_cents
          : null,
      walletBlocked: wallet ? wallet.success === false : false,
      needsReload,
      tier: typeof result.tier === 'string' ? result.tier : undefined,
    }
  } catch (err) {
    // Defensive: never throw from billing path
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[billing/usage] unexpected error:', { callId, error: msg })
    return { ok: false, billed: false, reason: 'unexpected_error', errorMessage: msg }
  }
}


/**
 * Phase 4.5: Fire a fire-and-forget POST to /api/billing/wallet/auto-reload.
 *
 * Why fire-and-forget:
 *   - The call is over by the time we get here. We don't want to add Stripe
 *     latency to the call-completion response path.
 *   - The auto-reload route is idempotent via DB lock. Multiple rapid calls
 *     overrunning bundle will all trigger this, but only one Stripe charge
 *     fires within the cooldown window.
 *   - If the trigger HTTP call itself fails (network blip, deploy in progress),
 *     a daily cron sweeper (Phase 5) catches missed reloads.
 *
 * URL resolution: prefers NEXT_PUBLIC_APP_URL, falls back to leadfriendly.com.
 * Auth: x-internal-secret header carries CRON_SECRET (same secret as cron jobs).
 */
async function triggerAutoReload(
  supabase: SupabaseClient,
  callId: string,
): Promise<void> {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error('[billing/usage] CRON_SECRET not set — cannot trigger auto-reload')
    return
  }

  // Resolve organization_id from the call. This is read-only and small.
  const { data: call } = await supabase
    .from('calls')
    .select('organization_id')
    .eq('id', callId)
    .single<{ organization_id: string }>()

  if (!call?.organization_id) {
    console.error('[billing/usage] auto-reload trigger: call', callId, 'missing org_id')
    return
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    'https://www.leadfriendly.com'

  const url = `${baseUrl}/api/billing/wallet/auto-reload`

  // Fire and don't block on response, but DO log the outcome
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': cronSecret,
      },
      body: JSON.stringify({
        organizationId: call.organization_id,
        triggerSource: 'auto_reload',
      }),
    })
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      console.error('[billing/usage] auto-reload returned', res.status, txt.slice(0, 500))
    }
  } catch (err) {
    console.error('[billing/usage] auto-reload fetch failed:', err)
  }
}
