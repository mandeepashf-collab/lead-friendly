import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

// POST /api/agency/impersonate
// Agency clicks "Switch to account" on a sub-account card
// Creates a 2-hour impersonation token, stored in cookie
// All subsequent requests scoped to that sub-account

export async function POST(request: NextRequest) {
  try {
    // Use SSR client to read the user's auth session from cookies
    const cookieStore = await cookies()
    const authClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Use service role client for DB operations
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const { sub_account_id } = await request.json()
    if (!sub_account_id) return NextResponse.json({ error: 'sub_account_id required' }, { status: 400 })

    // Verify this sub-account belongs to the agency
    const { data: agency } = await supabase
      .from('agencies').select('id').eq('user_id', user.id).single()

    if (!agency) return NextResponse.json({ error: 'No agency account' }, { status: 403 })

    const { data: sub } = await supabase
      .from('sub_accounts').select('id, name, company_name, status')
      .eq('id', sub_account_id).eq('agency_id', agency.id).single()

    if (!sub) return NextResponse.json({ error: 'Sub-account not found or not yours' }, { status: 404 })

    // Create impersonation session
    const { data: session, error } = await supabase
      .from('impersonation_sessions')
      .insert({
        agency_id: agency.id,
        sub_account_id: sub_account_id,
      })
      .select('token, expires_at')
      .single()

    if (error) throw error

    // Set cookies in the response
    const response = NextResponse.json({
      token: session.token,
      expires_at: session.expires_at,
      sub_account: { id: sub.id, name: sub.company_name || sub.name }
    })

    const maxAge = 7200 // 2 hours
    response.cookies.set('impersonation_token', session.token, {
      path: '/',
      maxAge,
      sameSite: 'lax',
    })
    response.cookies.set('impersonation_sub_account', sub_account_id, {
      path: '/',
      maxAge,
      sameSite: 'lax',
    })

    return response

  } catch (err: any) {
    console.error('Impersonation error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// DELETE /api/agency/impersonate
// End impersonation session - return to agency dashboard
export async function DELETE(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const cookieStore = await cookies()
    const token = cookieStore.get('impersonation_token')?.value

    if (token) {
      await supabase
        .from('impersonation_sessions')
        .update({ ended_at: new Date().toISOString() })
        .eq('token', token)
    }

    const response = NextResponse.json({ success: true })
    response.cookies.delete('impersonation_token')
    response.cookies.delete('impersonation_sub_account')
    return response

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
