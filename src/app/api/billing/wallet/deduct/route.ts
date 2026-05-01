import { NextResponse } from 'next/server'

/**
 * DEPRECATED — DELETE THIS FILE.
 *
 * The original /api/billing/wallet/deduct route referenced a sub_accounts
 * table that doesn't exist (it was scaffold code that was never finished).
 * Wallet deduction is now handled atomically server-side via the
 * record_call_usage RPC, called from the call-end webhooks:
 *   - /api/webrtc/webhook (room_finished)
 *   - /api/webrtc/call-complete
 *   - /api/voice/complete
 *
 * If you need a manual debit endpoint in the future (e.g., for admin
 * adjustments), build a new admin-only route. Don't reuse this URL.
 *
 * To remove: `git rm src/app/api/billing/wallet/deduct/route.ts` then commit.
 */

export async function POST() {
  return NextResponse.json(
    {
      error: 'This endpoint is deprecated. Wallet deduction is now automatic via call-end webhooks.',
      hint: 'See record_call_usage RPC + /api/webrtc/webhook + /api/webrtc/call-complete',
    },
    { status: 410 },  // 410 Gone
  )
}
