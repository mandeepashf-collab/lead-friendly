import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'
import {
  IMPERSONATION_COOKIE_NAME,
  IMPERSONATION_DEFAULT_TTL_SECONDS,
  IMPERSONATION_MAX_TTL_SECONDS,
} from '@/lib/schemas/stage3'

// ────────────────────────────────────────────────────────────────────────────
// Stage 3.3 — POST/DELETE /api/agency/impersonate
// ────────────────────────────────────────────────────────────────────────────
// POST   → start_impersonation RPC, set httpOnly lf_impersonation_token cookie
// DELETE → end_impersonation RPC, clear cookie
//
// Cookie semantics (per spec):
//   - name: lf_impersonation_token (single-cookie design; the token resolves
//     the entire context server-side via get_active_impersonation)
//   - httpOnly: true (server-only — JS can't read or set it)
//   - secure: true in prod, false in dev
//   - sameSite: 'lax'
//   - maxAge: 15 min default, 60 min max
//   - path: '/'
//
// The pre-Stage-3.1 version used a non-httpOnly cookie named impersonation_token
// + a redundant impersonation_sub_account cookie, with 2h TTL. Both are
// replaced here. Any client code still setting the old cookie name will be
// silently ignored by middleware after this ships.
// ────────────────────────────────────────────────────────────────────────────

const StartInputSchema = z.object({
  // Accept either spec-form (sub_organization_id) or legacy form
  // (sub_account_id) for backwards-compat with existing callers we'll
  // migrate in a later pass. Both are uuids referencing organizations.id.
  sub_organization_id: z.string().uuid().optional(),
  sub_account_id: z.string().uuid().optional(),
  duration_minutes: z.number().int().positive().optional(),
})

export async function POST(request: NextRequest) {
  // ── AuthN (the RPC also checks; double-check here for friendly 401) ──────
  const supabase = await createClient()
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser()
  if (!user || userErr) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  // ── Parse input ──────────────────────────────────────────────────────────
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  const parsed = StartInputSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation_failed', details: parsed.error.flatten() },
      { status: 400 },
    )
  }
  const subOrgId = parsed.data.sub_organization_id ?? parsed.data.sub_account_id
  if (!subOrgId) {
    return NextResponse.json(
      { error: 'sub_organization_id_required' },
      { status: 400 },
    )
  }

  // Clamp requested duration to [1, MAX] minutes (RPC also clamps)
  const ttlSeconds = Math.min(
    IMPERSONATION_MAX_TTL_SECONDS,
    Math.max(60, (parsed.data.duration_minutes ?? 15) * 60),
  )

  // ── Capture client metadata for audit log ────────────────────────────────
  const ipAddress =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    null
  const userAgent = request.headers.get('user-agent') ?? null

  // ── Call start_impersonation RPC ─────────────────────────────────────────
  const { data: session, error: rpcError } = await supabase.rpc(
    'start_impersonation',
    {
      p_sub_org_id: subOrgId,
      p_ip_address: ipAddress,
      p_user_agent: userAgent,
      p_duration_minutes: Math.floor(ttlSeconds / 60),
    },
  )

  if (rpcError) {
    const status =
      rpcError.code === '42501' ? 403
      : rpcError.code === 'P0001' ? 400
      : 500
    return NextResponse.json({ error: rpcError.message }, { status })
  }
  if (!session) {
    return NextResponse.json({ error: 'session_not_returned' }, { status: 500 })
  }

  // ── Build response with httpOnly cookie ──────────────────────────────────
  const response = NextResponse.json({
    success: true,
    sessionId: session.id,
    subOrganizationId: session.sub_organization_id,
    expiresAt: session.expires_at,
    // Token is intentionally NOT in the JSON body — it's only in the cookie.
    // Clients that need to query state should hit a separate /api/impersonation/me
    // endpoint (not built yet) instead of stashing the token in JS.
  })

  response.cookies.set(IMPERSONATION_COOKIE_NAME, session.token as string, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: IMPERSONATION_DEFAULT_TTL_SECONDS,
    path: '/',
  })

  return response
}

export async function DELETE(_request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser()
  if (!user || userErr) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  // Read the new cookie name; tolerate the old one too during transition.
  // (Old cookie won't validate against the RPC since it points at a stale
  // session shape, but clearing it keeps stale browser state from sticking.)
  const cookieJar = request_cookies(_request)
  const newToken = cookieJar.get(IMPERSONATION_COOKIE_NAME)
  const oldToken = cookieJar.get('impersonation_token')
  const token = newToken ?? oldToken

  if (token) {
    // RPC is idempotent — it returns false if the session is already ended
    // or doesn't exist. We don't surface that as an error to the caller.
    await supabase.rpc('end_impersonation', { p_token: token })
  }

  const response = NextResponse.json({ success: true })
  // Clear both old and new cookie names atomically so users with stale state
  // don't keep an unreadable cookie sitting around.
  response.cookies.delete(IMPERSONATION_COOKIE_NAME)
  response.cookies.delete('impersonation_token')
  response.cookies.delete('impersonation_sub_account')
  return response
}

// Tiny helper because Next 15 makes cookies() async outside route handlers
// and we want a sync read of just the request cookies here.
function request_cookies(req: NextRequest) {
  return {
    get: (name: string) => req.cookies.get(name)?.value,
  }
}
