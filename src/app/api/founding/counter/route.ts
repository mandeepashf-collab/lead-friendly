import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

/**
 * GET /api/founding/counter
 *
 * Phase 7: Returns the live founding-member spot count for the /founding
 * landing page. Public endpoint — no auth required.
 *
 * Response:
 *   {
 *     spotsClaimed: number,    // 0..100
 *     spotsTotal: number,      // 100
 *     spotsRemaining: number,  // total - claimed
 *     soldOut: boolean,
 *   }
 *
 * Reads from founding_member_counter (singleton row keyed on id=true).
 *
 * Cache: short revalidate (15s) so the counter updates near-real-time
 * without hammering the DB on every page load. The page itself can also
 * poll this endpoint client-side for live updates.
 */

export const dynamic = 'force-dynamic'

const supabase = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

export async function GET() {
  const { data, error } = await supabase
    .from('founding_member_counter')
    .select('spots_claimed, spots_total')
    .eq('id', true)
    .single()

  if (error || !data) {
    console.error('[founding/counter] error:', error?.message)
    return NextResponse.json(
      { error: error?.message ?? 'Counter unavailable' },
      { status: 500 },
    )
  }

  const spotsClaimed = data.spots_claimed ?? 0
  const spotsTotal = data.spots_total ?? 100
  const spotsRemaining = Math.max(0, spotsTotal - spotsClaimed)

  return NextResponse.json(
    {
      spotsClaimed,
      spotsTotal,
      spotsRemaining,
      soldOut: spotsRemaining <= 0,
    },
    {
      headers: {
        // Brief caching: counter updates roughly every 15s to balance
        // freshness against DB load. Page poll interval is 30s anyway.
        'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=30',
      },
    },
  )
}
