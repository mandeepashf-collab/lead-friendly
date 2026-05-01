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

    // RPC returns jsonb. supabase-js gives us the parsed object.
    const result = (data ?? {}) as Record<string, unknown>
    const billed = Boolean(result.billed)
    const wallet = (result.wallet_result ?? null) as Record<string, unknown> | null

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
      needsReload: wallet ? Boolean(wallet.needs_reload) : false,
      tier: typeof result.tier === 'string' ? result.tier : undefined,
    }
  } catch (err) {
    // Defensive: never throw from billing path
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[billing/usage] unexpected error:', { callId, error: msg })
    return { ok: false, billed: false, reason: 'unexpected_error', errorMessage: msg }
  }
}
