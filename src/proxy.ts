import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { BRAND_PREVIEW_COOKIE_NAME } from '@/lib/schemas/stage3'

// ── Lead Friendly Middleware ──────────────────────────────────
//
// Jobs:
// 1. Security — block sensitive paths, rate limiting, CORS
// 2. Custom domain routing — white-label sub-account detection
// 3. Impersonation session — scope data access to sub-account

const PUBLIC_ROUTES = ['/auth', '/login', '/register', '/api/voice', '/api/health', '/api/agents', '/pricing', '/_next', '/favicon', '/api/stripe/webhook', '/api/webrtc/webhook', '/api/webhooks', '/api/calls/sip-outbound']

// Pages a user with no active subscription can still visit (so they can pay).
// Anything NOT in this list redirects to /billing when subscription is inactive.
const SUBSCRIPTION_EXEMPT_PATHS = [
  '/billing',
  '/pricing',
  '/suspended',
  '/logout',
  '/api/stripe',     // checkout/portal/webhook must keep working
  '/api/auth',
  '/api/health',
  '/_next',
  '/favicon',
]

// If SUBSCRIPTION_GATE_ENABLED is 'true' in env, inactive orgs are redirected
// to /billing for everything except the exempt paths above. Left off by
// default so we can ship without breaking existing users until Stripe prices
// are configured and tested end-to-end.
const SUBSCRIPTION_GATE_ENABLED = process.env.SUBSCRIPTION_GATE_ENABLED === 'true'
// ── Security: Block scanner bait paths ───────────────────────
const BLOCKED_PATH_FRAGMENTS = [
  '.env', '.git', '.svn', 'wp-admin', 'wp-login', '.htaccess',
  'xmlrpc.php', 'wp-config', 'phpmyadmin', '.DS_Store',
  'administrator', 'admin.php',
]

// ── Security: CORS allowed origins ────────────────────────────
const ALLOWED_ORIGINS = [
  'https://leadfriendly.com',
  'https://www.leadfriendly.com',
  'http://localhost:3000',
]

// ── Security: Simple in-memory rate limiter ────────────────────
// Note: in-memory only works per-instance. For multi-instance Vercel
// deployments use Upstash Redis. This still meaningfully reduces abuse
// since Vercel routes the same IP to the same function instance often.
const rateLimitStore = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const record = rateLimitStore.get(key)

  if (!record || now > record.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs })
    return true // allowed
  }

  if (record.count >= limit) return false // blocked

  record.count++
  return true // allowed
}

// Clean up expired entries periodically to prevent memory leaks
let lastCleanup = Date.now()
function cleanupRateLimitStore() {
  const now = Date.now()
  if (now - lastCleanup < 60_000) return
  lastCleanup = now
  for (const [key, record] of rateLimitStore) {
    if (now > record.resetAt) rateLimitStore.delete(key)
  }
}

export async function proxy(request: NextRequest) {
  cleanupRateLimitStore()

  const { pathname } = request.nextUrl
  const hostname = request.headers.get('host') || ''
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim()
    || request.headers.get('x-real-ip')
    || 'unknown'

  // ── Block scanner bait paths (return 404, not redirect) ───────
  if (BLOCKED_PATH_FRAGMENTS.some(fragment => pathname.toLowerCase().includes(fragment))) {
    return new NextResponse(null, { status: 404 })
  }

  // ── Custom domain detection ────────────────────────────────────
  // When a request arrives on a non-platform hostname, tag it so the
  // app knows this is a white-label request and can suppress our branding.
  // The actual sub-account lookup happens later (after Supabase is ready).
  const isCustomDomain =
    hostname &&
    !hostname.includes('leadfriendly.com') &&
    !hostname.includes('localhost') &&
    !hostname.includes('vercel.app') &&
    !hostname.includes('127.0.0.1')

  if (isCustomDomain) {
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('x-custom-domain', hostname)
    // Pass through — the sub-account routing below will handle further logic
    return NextResponse.next({ request: { headers: requestHeaders } })
  }

  // ── CORS preflight for API routes ─────────────────────────────
  if (pathname.startsWith('/api/') && request.method === 'OPTIONS') {
    const origin = request.headers.get('origin') || ''
    const response = new NextResponse(null, { status: 204 })
    if (ALLOWED_ORIGINS.includes(origin)) {
      response.headers.set('Access-Control-Allow-Origin', origin)
      response.headers.set('Vary', 'Origin')
    }
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key')
    response.headers.set('Access-Control-Max-Age', '86400')
    return response
  }

  // ── Rate limiting on login route ───────────────────────────────
  if (pathname === '/login' && request.method === 'POST') {
    if (!checkRateLimit(`login:${ip}`, 5, 15 * 60 * 1000)) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please try again in 15 minutes.' },
        { status: 429 }
      )
    }
  }

  // ── Rate limiting on API routes (broad) ───────────────────────
  if (pathname.startsWith('/api/')) {
    // Telnyx voice webhooks are excluded from user-facing rate limit
    const isTelnyxWebhook = pathname.startsWith('/api/voice/')
    if (!isTelnyxWebhook) {
      if (!checkRateLimit(`api:${ip}`, 120, 60 * 1000)) {
        return NextResponse.json(
          { error: 'Rate limit exceeded. Please slow down.' },
          { status: 429 }
        )
      }
    }
  }

  // Stage 3.3.6 — forward role/identity headers as REQUEST headers (visible to
  // server components via headers()), not RESPONSE headers (browser-only).
  const requestHeaders = new Headers(request.headers)

  // Pass requestHeaders so route handlers receive forwarded Cookie + x-lf-* headers (Next.js 16 proxy convention).
  const res = NextResponse.next({ request: { headers: requestHeaders } })

  // ── Set CORS header on API responses ──────────────────────────
  if (pathname.startsWith('/api/')) {
    const origin = request.headers.get('origin') || ''
    if (ALLOWED_ORIGINS.includes(origin)) {
      res.headers.set('Access-Control-Allow-Origin', origin)
      res.headers.set('Vary', 'Origin')
    }
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          cookiesToSet.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Skip auth check for public routes
  if (PUBLIC_ROUTES.some(route => pathname.startsWith(route))) {
    return res
  }

  // ── Custom domain detection ─────────────────────────────────
  const isMainDomain = hostname.includes('leadfriendly.com') ||
                       hostname.endsWith('.vercel.app') ||
                       hostname.includes('localhost')

  if (!isMainDomain) {
    // White-label custom domain lookup.
    //
    // Stage 3.2 onward: only `organizations.custom_domain` is consulted.
    // The legacy `sub_accounts.custom_domain` fallback was removed when
    // Stage 3.1 dropped the sub_accounts table. Sub-accounts now ARE
    // organization rows (with parent_organization_id set), so they're
    // resolved by the same single lookup below.

    // Primary: organizations
    const { data: org } = await supabase
      .from('organizations')
      .select('id, primary_logo_url, primary_color, portal_name, domain_status, is_active')
      .eq('custom_domain', hostname)
      .maybeSingle()

    if (org) {
      if (!org.is_active) {
        return NextResponse.redirect(new URL('/suspended', request.url))
      }
      if (org.domain_status === 'dns_pending') {
        return NextResponse.redirect(new URL('/domain-pending', request.url))
      }
      if (org.domain_status !== 'verified') {
        return NextResponse.redirect(new URL('/unknown-domain', request.url))
      }

      requestHeaders.set('x-lf-org-id', org.id)
      requestHeaders.set('x-brand-name', org.portal_name || 'CRM')
      requestHeaders.set('x-brand-color', org.primary_color || '#6366f1')
      requestHeaders.set('x-brand-logo', org.primary_logo_url || '')
      requestHeaders.set('x-is-white-label', 'true')
    } else {
      // No matching organizations.custom_domain. Stage 3.1 dropped the legacy
      // sub_accounts table, so there's no fallback lookup — the only path to
      // a verified custom domain is via Stage 3.2's organizations.custom_domain.
      // Land on a friendly page, not the marketing site.
      return NextResponse.redirect(new URL('/unknown-domain', request.url))
    }
  }

  // ── Auth check ──────────────────────────────────────────────
  // Use getUser() instead of getSession() — getSession() only reads the
  // cookie without server-side verification, so a stale or tampered JWT
  // could bypass auth. getUser() validates the token with Supabase.
  const { data: { user }, error: userError } = await supabase.auth.getUser()

  if ((!user || userError) && !pathname.startsWith('/auth') && !pathname.startsWith('/login') && !pathname.startsWith('/register')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Keep a session reference for downstream checks (subscription gate, etc.)
  const session = user ? { user } : null

  // ── Role flags + /agency/* gate ────────────────────────────
  // For authenticated users, derive whether they're an agency admin
  // (top-level org owner/admin) or a sub-account user (their home org has a
  // non-null parent_organization_id). The flags are injected into response
  // headers so the root layout can pass them through to BrandContext for
  // client-side gating.
  //
  // Non-agency-admin users hitting /agency/* get a 404 rewrite — the route
  // should appear not to exist, not redirect them somewhere visible.
  let isAgencyAdmin = false
  let isSubAccount = false
  let userOrgId: string | null = null
  let isPlatformStaff = false
  if (session) {
    // Stage 3.5.2 — derive platform-staff status alongside the existing
    // profile lookup. The is_platform_staff RPC is SECURITY DEFINER and
    // queries a separate table, so we can't fold it into the profile select.
    // Run them in parallel to keep this one round-trip wide instead of deep.
    const [profileResult, staffResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('role, organization_id, organizations!inner(parent_organization_id)')
        .eq('id', session.user.id)
        .maybeSingle(),
      supabase.rpc('is_platform_staff', { p_user_id: session.user.id }),
    ])

    const userOrg = profileResult.data
    if (userOrg) {
      // supabase-js can return the joined row as either an array or a single
      // object depending on the relationship cardinality it infers. Defensive
      // check covers both shapes.
      const orgRow = (Array.isArray(userOrg.organizations)
        ? userOrg.organizations[0]
        : userOrg.organizations) as
        | { parent_organization_id: string | null }
        | null
        | undefined

      isAgencyAdmin =
        ['owner', 'admin'].includes(((userOrg.role as string) ?? '')) &&
        orgRow?.parent_organization_id == null
      isSubAccount = !!orgRow && orgRow.parent_organization_id != null
      userOrgId = (userOrg.organization_id as string | null) ?? null
    }
    isPlatformStaff = staffResult.data === true

    if (pathname.startsWith('/agency/') && !isAgencyAdmin) {
      return NextResponse.rewrite(new URL('/404', request.url))
    }
  }
  requestHeaders.set('x-lf-user-is-agency-admin', isAgencyAdmin ? '1' : '0')
  requestHeaders.set('x-lf-user-is-sub-account', isSubAccount ? '1' : '0')
  requestHeaders.set('x-lf-platform-staff', isPlatformStaff ? '1' : '0')

  // ── Brand preview (Stage 3.4) ───────────────────────────────────────────
  // Agency admins can opt into seeing their own brand on platform hosts via
  // the lf_brand_preview cookie. We're already past the custom-domain early
  // return at L97-109, so we know we're on a platform host here. Gate is:
  // cookie="1" + authenticated + isAgencyAdmin + we resolved the user's org.
  // The header is consumed by the root layout to override effectiveOrgId
  // (impersonation > custom domain > preview > platform default).
  if (
    session &&
    isAgencyAdmin &&
    userOrgId &&
    request.cookies.get(BRAND_PREVIEW_COOKIE_NAME)?.value === '1'
  ) {
    requestHeaders.set('x-lf-brand-preview-org-id', userOrgId)
  }

  // ── Subscription gate (opt-in via SUBSCRIPTION_GATE_ENABLED) ────
  // Redirect users whose org has no active subscription to /billing so they
  // can start or fix their subscription. We skip:
  //   - all exempt paths above
  //   - agency owners (subscription is per-org; sub-accounts inherit billing
  //     status from their parent agency, not from their own org row)
  //
  // This check runs ONE extra DB query per request, which is why we gate it
  // behind an env flag. Flip it on after Stripe Prices are configured.
  if (
    SUBSCRIPTION_GATE_ENABLED &&
    session &&
    !SUBSCRIPTION_EXEMPT_PATHS.some((p) => pathname.startsWith(p))
  ) {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', session.user.id)
        .single()

      if (profile?.organization_id) {
        const { data: org } = await supabase
          .from('organizations')
          .select('subscription_status, trial_ends_at')
          .eq('id', profile.organization_id)
          .single()

        const status = org?.subscription_status as string | null | undefined
        const trialEnd = org?.trial_ends_at ? new Date(org.trial_ends_at) : null
        const inTrial = trialEnd && trialEnd > new Date()
        const isActive = status === 'active' || status === 'trialing' || inTrial

        if (!isActive) {
          const url = new URL('/billing', request.url)
          url.searchParams.set('reason', status || 'no_subscription')
          return NextResponse.redirect(url)
        }
      }
    } catch (err) {
      // Don't block the request on a lookup failure — log and continue.
      console.warn('Subscription gate lookup failed:', err)
    }
  }

  // ── Impersonation check ─────────────────────────────────────
  // Reads lf_impersonation_token httpOnly cookie set by /api/agency/impersonate.
  // Validates via the get_active_impersonation RPC (granted to anon for
  // middleware compat — the RPC itself returns no row if the token is
  // expired/ended/invalid).
  //
  // On valid session: injects three response headers consumed by server
  // components and the client BrandContext to render in the sub-account's
  // identity. Stage 3.3 is read-only impersonation; cross-org writes are
  // still blocked by RLS regardless of these headers.
  const impersonationToken = request.cookies.get('lf_impersonation_token')?.value

  // During the cookie rename rollout, also clear the old cookie names if
  // they're still present in the browser. They were never httpOnly so users
  // can have stale values lingering.
  const legacyImpersonationToken = request.cookies.get('impersonation_token')?.value
  const legacyImpersonationSubAccount = request.cookies.get('impersonation_sub_account')?.value
  if (legacyImpersonationToken || legacyImpersonationSubAccount) {
    res.cookies.delete('impersonation_token')
    res.cookies.delete('impersonation_sub_account')
  }

  if (impersonationToken) {
    const { data: rows } = await supabase.rpc('get_active_impersonation', {
      p_token: impersonationToken,
    })

    // RPC returns a TABLE; supabase-js gives us an array. First row or null.
    const sess = Array.isArray(rows) && rows.length > 0 ? rows[0] : null

    if (sess) {
      // Valid session — inject context headers
      requestHeaders.set('x-lf-impersonation-active', '1')
      requestHeaders.set('x-lf-acting-as-org-id', sess.sub_organization_id)
      requestHeaders.set('x-lf-actor-user-id', sess.actor_user_id)
      requestHeaders.set('x-lf-impersonation-expires-at', sess.expires_at)
      // Optional: passing org name + actor email saves a DB roundtrip in
      // the banner component. These are public-ish (already shown to the
      // agency admin who started the session).
      if (sess.sub_org_name) requestHeaders.set('x-lf-acting-as-org-name', sess.sub_org_name)
      if (sess.actor_email) requestHeaders.set('x-lf-actor-email', sess.actor_email)
    } else {
      // Token invalid/expired/ended — clear it so the next request is clean
      res.cookies.delete('lf_impersonation_token')
    }
  }

  // Stage 3.3.6: emit Next.js's middleware override headers manually so the
  // x-lf-* mutations performed above (which depend on async Supabase work) are
  // visible to server components via headers(). This is the same mechanism
  // NextResponse.next({ request: { headers } }) uses internally; we defer it
  // to here so it captures the fully-populated requestHeaders, not the snapshot
  // at the .next() call site. See vercel/next.js#39402.
  const overrideNames: string[] = []
  for (const [name, value] of requestHeaders) {
    if (request.headers.get(name) !== value) {
      overrideNames.push(name)
      res.headers.set(`x-middleware-request-${name}`, value)
    }
  }
  if (overrideNames.length > 0) {
    res.headers.set('x-middleware-override-headers', overrideNames.join(','))
  }

  return res
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ]
}
