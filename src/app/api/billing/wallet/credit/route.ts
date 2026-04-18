import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabase()
    const { sub_account_id, amount, description } = await request.json()

    if (!sub_account_id || !amount || amount <= 0) {
      return NextResponse.json({ error: 'sub_account_id and positive amount required' }, { status: 400 })
    }

    // Get current balance
    const { data: sub, error: subErr } = await supabase
      .from('sub_accounts')
      .select('id, agency_id, wallet_balance, status')
      .eq('id', sub_account_id)
      .single()

    if (subErr || !sub) return NextResponse.json({ error: 'Sub-account not found' }, { status: 404 })

    const balance_before = sub.wallet_balance || 0
    const balance_after = balance_before + amount

    // Update wallet balance
    const { error: updateErr } = await supabase
      .from('sub_accounts')
      .update({
        wallet_balance: balance_after,
        status: balance_after > 0 && sub.status === 'paused' ? 'active' : sub.status
      })
      .eq('id', sub_account_id)

    if (updateErr) throw updateErr

    // Log transaction
    await supabase.from('wallet_transactions').insert({
      sub_account_id,
      agency_id: sub.agency_id,
      type: 'manual_credit',
      amount: amount,
      balance_before,
      balance_after,
      description: description || `Manual top-up — $${amount.toFixed(2)}`,
    })

    return NextResponse.json({
      success: true,
      balance_before,
      balance_after,
    })
  } catch (err: any) {
    console.error('Wallet credit error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
