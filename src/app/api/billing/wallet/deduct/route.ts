import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!)
}

// POST /api/billing/wallet/deduct
// Two ways to identify the sub-account:
//   1. sub_account_id (direct — from voice/answer route)
//   2. phone_number (from call complete webhook — we look up by telnyx_phone_number)

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { sub_account_id, duration_seconds, call_sid, direction } = await request.json()

    if (!sub_account_id || !duration_seconds) {
      return NextResponse.json({ error: 'sub_account_id and duration_seconds required' }, { status: 400 })
    }

    // Get sub-account with rates and wallet info
    const { data: sub, error: subErr } = await supabase
      .from('sub_accounts')
      .select('id, agency_id, wallet_balance, wallet_min_threshold, wallet_reload_amount, client_overage_rate, agency_overage_rate, minutes_included, minutes_used, stripe_customer_id, stripe_payment_method_id, status')
      .eq('id', sub_account_id)
      .single()

    if (subErr || !sub) return NextResponse.json({ error: 'Sub-account not found' }, { status: 404 })
    if (sub.status !== 'active') return NextResponse.json({ error: 'Sub-account not active' }, { status: 400 })

    const minutes_billed = parseFloat((duration_seconds / 60).toFixed(4))
    const is_overage = (sub.minutes_used + minutes_billed) > sub.minutes_included

    // Only charge wallet for overage minutes
    let wallet_deduction = 0
    let agency_cost = 0
    let client_cost = 0

    if (is_overage) {
      const overage_minutes = Math.max(0, (sub.minutes_used + minutes_billed) - sub.minutes_included)
      wallet_deduction = parseFloat((overage_minutes * sub.client_overage_rate).toFixed(4))
      agency_cost = parseFloat((overage_minutes * sub.agency_overage_rate).toFixed(4))
      client_cost = wallet_deduction
    }

    const balance_before = sub.wallet_balance
    const balance_after = Math.max(0, balance_before - wallet_deduction)

    // Update sub-account: minutes_used + wallet_balance
    const { error: updateErr } = await supabase
      .from('sub_accounts')
      .update({
        minutes_used: sub.minutes_used + minutes_billed,
        wallet_balance: balance_after,
        status: balance_after <= 0 && is_overage ? 'paused' : sub.status
      })
      .eq('id', sub_account_id)

    if (updateErr) throw updateErr

    // Log wallet transaction
    if (wallet_deduction > 0) {
      await supabase.from('wallet_transactions').insert({
        sub_account_id,
        agency_id: sub.agency_id,
        type: 'debit',
        amount: -wallet_deduction,
        balance_before,
        balance_after,
        description: `AI call overage — ${minutes_billed.toFixed(2)} min`,
      })
    }

    // Log call
    await supabase.from('sub_account_calls').insert({
      sub_account_id,
      agency_id: sub.agency_id,
      call_sid,
      direction: direction || 'outbound',
      duration_seconds,
      minutes_billed,
      agency_cost,
      client_cost,
      status: 'completed',
      ended_at: new Date().toISOString()
    })

    // Auto-reload if below threshold
    if (balance_after < sub.wallet_min_threshold && sub.stripe_customer_id && sub.stripe_payment_method_id) {
      try {
        const charge = await getStripe().paymentIntents.create({
          amount: Math.round(sub.wallet_reload_amount * 100),
          currency: 'usd',
          customer: sub.stripe_customer_id,
          payment_method: sub.stripe_payment_method_id,
          confirm: true,
          description: `Wallet auto-reload for sub-account ${sub_account_id}`,
          metadata: { sub_account_id, type: 'wallet_auto_reload' }
        })

        if (charge.status === 'succeeded') {
          const new_balance = balance_after + sub.wallet_reload_amount
          await supabase.from('sub_accounts').update({
            wallet_balance: new_balance,
            status: 'active'  // re-activate if paused
          }).eq('id', sub_account_id)

          await supabase.from('wallet_transactions').insert({
            sub_account_id,
            agency_id: sub.agency_id,
            type: 'auto_reload',
            amount: sub.wallet_reload_amount,
            balance_before: balance_after,
            balance_after: new_balance,
            description: `Auto-reload — ${sub.wallet_reload_amount}`,
            stripe_charge_id: charge.id
          })
        }
      } catch (stripeErr: any) {
        // Auto-reload failed — pause account and log
        console.error('Auto-reload failed:', stripeErr.message)
        await supabase.from('sub_accounts').update({ status: 'paused' }).eq('id', sub_account_id)
        // TODO: send alert email to agency
      }
    }

    return NextResponse.json({
      success: true,
      minutes_billed,
      wallet_deduction,
      balance_after,
      auto_reload_triggered: balance_after < sub.wallet_min_threshold
    })

  } catch (err: any) {
    console.error('Wallet deduct error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
