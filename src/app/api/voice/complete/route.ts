import { NextRequest, NextResponse } from 'next/server'

// POST /api/voice/complete
// Telnyx webhook — fires when a call ends
// Reads call duration, finds the sub-account, triggers wallet deduction
//
// Add this URL to Telnyx TeXML App webhook settings:
// https://leadfriendly.com/api/voice/complete
//
// Telnyx event type: call.hangup

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const event = body?.data

    // Only process hangup events
    if (event?.event_type !== 'call.hangup') {
      return NextResponse.json({ received: true, processed: false })
    }

    const payload = event?.payload
    const callSid = payload?.call_control_id
    const toNumber = payload?.to
    const fromNumber = payload?.from
    const direction = payload?.direction || 'inbound'

    // Duration in seconds — Telnyx provides call_duration_secs on hangup
    const durationSeconds = payload?.call_duration_secs || 0

    if (!callSid || durationSeconds === 0) {
      return NextResponse.json({ received: true, processed: false, reason: 'No duration or call ID' })
    }

    // Find sub-account by phone number
    // We look up which sub-account owns the number involved in this call
    const numberToLookup = direction === 'inbound' ? toNumber : fromNumber

    // Call wallet deduction endpoint
    // This handles: minutes tracking, overage calculation, wallet debit, auto-reload
    const deductUrl = new URL('/api/billing/wallet/deduct', process.env.NEXT_PUBLIC_APP_URL)
    const deductRes = await fetch(deductUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Internal auth header so deduct route knows this is a server-side call
        'x-internal-key': process.env.INTERNAL_API_KEY || '',
      },
      body: JSON.stringify({
        phone_number: numberToLookup,
        call_sid: callSid,
        duration_seconds: durationSeconds,
        direction,
      })
    })

    const deductResult = await deductRes.json()
    console.log(`Call ${callSid} complete — ${durationSeconds}s — deduction result:`, deductResult)

    return NextResponse.json({
      received: true,
      processed: true,
      call_sid: callSid,
      duration_seconds: durationSeconds,
      deduction: deductResult
    })

  } catch (err: any) {
    console.error('Call complete webhook error:', err)
    // Always return 200 to Telnyx so they don't retry
    return NextResponse.json({ received: true, error: err.message }, { status: 200 })
  }
}
