import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { recordCallUsage } from '@/lib/billing/usage'

/**
 * POST /api/voice/complete
 *
 * Telnyx webhook — fires when a call ends (event_type: call.hangup).
 * Reads call duration, finds the matching calls row (via telnyx_call_id),
 * and bills the org via record_call_usage RPC.
 *
 * Idempotent against retries: record_call_usage checks last_billed_seconds.
 *
 * Configure in Telnyx TeXML App webhook settings:
 *   https://leadfriendly.com/api/voice/complete
 *
 * NOTE: Most modern voice flows go through LiveKit (webrtc/webhook) or the
 * AI agent worker (webrtc/call-complete). This route exists for Telnyx
 * direct/legacy paths that bypass LiveKit. If a call ends up here AND in
 * webrtc/webhook, the second one is a no-op via last_billed_seconds.
 *
 * Always returns 200 to Telnyx so they don't retry on internal errors.
 */

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const event = body?.data

    if (event?.event_type !== 'call.hangup') {
      return NextResponse.json({ received: true, processed: false, reason: 'not_hangup' })
    }

    const payload = event?.payload
    const telnyxCallId: string | undefined = payload?.call_control_id
    const durationSeconds: number = Math.max(0, Math.floor(payload?.call_duration_secs ?? 0))

    if (!telnyxCallId) {
      return NextResponse.json({ received: true, processed: false, reason: 'no_call_id' })
    }
    if (durationSeconds <= 0) {
      return NextResponse.json({ received: true, processed: false, reason: 'zero_duration' })
    }

    // Find the calls row by telnyx_call_id. Most calls have it set when
    // they go through Telnyx-direct paths.
    const { data: callRow, error: lookupErr } = await supabaseAdmin
      .from('calls')
      .select('id, organization_id, status')
      .eq('telnyx_call_id', telnyxCallId)
      .maybeSingle()

    if (lookupErr) {
      console.error('[voice/complete] lookup error:', lookupErr.message)
      return NextResponse.json({ received: true, processed: false, reason: 'lookup_failed' })
    }
    if (!callRow) {
      // Call may have been created via LiveKit (no telnyx_call_id stored) — billing
      // will fire from webrtc/webhook room_finished. Not an error.
      console.log(`[voice/complete] no calls row for telnyx_call_id=${telnyxCallId} (likely LiveKit-managed)`)
      return NextResponse.json({ received: true, processed: false, reason: 'no_call_row_likely_livekit' })
    }

    // Update duration_seconds + status if not already terminal
    if (callRow.status !== 'completed' && callRow.status !== 'failed') {
      await supabaseAdmin
        .from('calls')
        .update({
          status: 'completed',
          ended_at: new Date().toISOString(),
          duration_seconds: durationSeconds,
        })
        .eq('id', callRow.id)
    }

    // Bill — idempotent. If webrtc/webhook already billed this call, the
    // RPC short-circuits with no_new_seconds.
    const billing = await recordCallUsage({
      callId: callRow.id,
      totalDurationSeconds: durationSeconds,
      supabase: supabaseAdmin,
    })

    if (billing.billed) {
      console.log(
        `[voice/complete] billed call=${callRow.id} +${billing.minutesAdded}min total=${billing.newTotalMinutes} overage=${billing.incrementalOverageMinutes}min debit=${billing.walletDebitedCents}\u00a2`,
      )
    } else if (!billing.ok) {
      console.error(
        `[voice/complete] billing FAILED call=${callRow.id} reason=${billing.reason} err=${billing.errorMessage ?? ''}`,
      )
    }

    return NextResponse.json({
      received: true,
      processed: true,
      call_id: callRow.id,
      duration_seconds: durationSeconds,
      billed: billing.billed,
      reason: billing.reason,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[voice/complete] unhandled error:', msg)
    // Always return 200 to Telnyx so they don't retry on internal failure
    return NextResponse.json({ received: true, error: msg }, { status: 200 })
  }
}
