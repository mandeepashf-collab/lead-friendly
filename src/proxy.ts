import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { BRAND_PREVIEW_COOKIE_NAME } from '@/lib/schemas/stage3'
import { isMasterBrandHost } from '@/lib/seo/master-brand'

// ── Lead Friendly Middleware (proxy) ─────────────────────────────
//
// Jobs:
// 1. Security — block sensitive paths, rate limit, CORS
// 2. Custom domain routing — white-label sub-account detection
// 3. Path-based gate — explicit public allow-list + protected prefix list,
//    catch-all falls through to Next.js so unknown URLs hit not-found.tsx
// 4. Authed-/-redirect — / on master with a session goes to /dashboard
// 5. Impersonation, subscription gate, role-flag headers (preserved)

// ── Path lists ──────────────────────────────────────────────────
//
// Anything in PUBLIC_EXACT or matching PUBLIC_PREFIXES bypasses the
// auth check. Anything in PROTECTED_PREFIXES requires a session.
// Anything else falls through to Next.js routing → not-found.tsx.

const PUBLIC_EXACT = new Set<string>([
  // Auth flows — public on both master and tenant.
  '/login',
  '/register',
  '/reset-password',
  '/logout',
  // Custom-domain landing pages — referenced by org-lookup redirects below.
  '/suspended',
  '/domain-pending',
  '/unknown-domain',
  // Marketing + SEO surfaces — the page body itself should call
  // ensureMasterBrandOr404() to 404 these on tenant hosts.
  '/',
  '/pricing',
  '/founding',  // Phase 7: exclusive Founding 100 launch page (noindex; not in sitemap)
  '/terms',
  '/privacy',
  '/robots.txt',
  '/sitemap.xml',
  '/llms.txt',
  '/favicon.ico',
  '/opengraph-image',
  '/pricing/opengraph-image',
])

const PUBLIC_PREFIXES = [
  '/_next/',
  '/auth/',                 // Supabase OAuth callback (e.g. /auth/callback)
  '/.well-known/',          // master-only static; tenant short-circuit at top
  '/api/auth/',
  '/api/health',
  '/api/voice',             // Telnyx voice webhooks
  '/api/agents',            // existing PUBLIC_ROUTES — preserve
  '/api/stripe/webhook',    // Stripe webhook
  '/api/webrtc/webhook',    // WebRTC webhook
  '/api/webhooks',
  '/api/calls/sip-outbound',
  '/api/appointments/book',
  '/api/cron/',             // Vercel cron jobs — auth via x-cron-secret header (Phase 1.7)
  '/api/billing/verify-stripe-config',  // Phase 2 diagnostic — auth via x-cron-secret; delete route after verification
  '/api/billing/wallet/auto-reload',  // Phase 4.5 — auth via x-internal-secret header
  '/api/founding/counter',  // Phase 7 — public founding spots counter for /founding page
] as const

// MUST mirror src/app/(dashboard)/ subdirectories. Adding a new dashboard
// route? Add its prefix here so the middleware auth-gate covers it.
//
// /api is included as a blanket prefix: ALL /api/* routes require auth at
// the middleware layer by default. To make a specific API route public, add
// it to PUBLIC_PREFIXES above (forces the security decision to happen at
// the right time). Defense in depth — even if a route handler forgets its
// own getUser() check, the middleware backstop catches it.
const PROTECTED_PREFIXES = [
  '/agency',
  '/ai-agents',
  '/automations',
  '/billing',
  '/branding',
  '/business',
  '/calendar',
  '/calls',
  '/campaigns',
  '/communications',
  '/contacts',
  '/conversations',
  '/dashboard',
  '/launchpad',
  '/opportunities',
  '/payments',
  '/people',
  '/phone-numbers',
  '/pipeline',
  '/platform',
  '/reporting',
  '/reputation',
  '/settings',
  '/sub-accounts',
  '/templates',
  // Blanket /api/* protection. PUBLIC_PREFIXES is checked first, so any
  // explicitly-public API path (e.g. /api/auth, /api/health) short-circuits
  // before the protected check fires.
  '/api',
] as const

// Dev-time invariant: catches the trailing-slash mistake that bit us once
// already (an entry like '/api/admin/' would never match because
// isProtectedPath does pathname.startsWith(prefix + '/'), giving '//').
for (const p of PROTECTED_PREFIXES) {
  if (p.endsWith('/')) {
    throw new Error(`PROTECTED_PREFIXES entry must not end with '/': ${p}`)
  }
}

// Pages a user with no active subscription can still visit (so they can pay).
// Anything NOT in this list redirects to /billing when subscription is inactive.
const SUBSCRIPTION_EXEMPT_PATHS = [
  '/billing',
  '/pricing',
  '/suspended',
  '/logout',
  '/api/stripe',
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

// ── Helpers ────────────────────────────────────────────────────
function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + '/'),
  )
}

// Stage 3.3.6: emit Next.js's middleware override headers manually so the
// x-lf-* mutations performed asynchronously (after Supabase work) are visible
// to server components via headers(). This is the same mechanism
// NextResponse.next({ request: { headers } }) uses internally; we defer it
// here so it captures the fully-populated requestHeaders, not the snapshot
// at the .next() call site. See vercel/next.js#39402.
function emitOverrideHeaders(
  originalHeaders: Headers,
  requestHeaders: Headers,
  res: NextResponse,
) {
  const overrideNames: string[] = []
  for (const [name, value] of requestHeaders) {
    if (originalHeaders.get(name) !== value) {
      overrideNames.push(name)
      res.headers.set(`x-middleware-request-${name}`, value)
    }
  }
  if (overrideNames.length > 0) {
    res.headers.set('x-middleware-override-headers', overrideNames.join(','))
  }
}

// Tenant /robots.txt — discourage indexing the white-label app surface entirely.
const TENANT_ROBOTS_TXT = 'User-agent: *\nDisallow: /\n'

// Tenant /sitemap.xml — empty urlset. We don't enumerate the tenant's pages.
const TENANT_SITEMAP_XML =
  '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>'

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

  // ── Master vs tenant ─────────────────────────────────────────
  const isMaster = isMasterBrandHost(hostname)

  // ── Tenant SEO short-circuit ─────────────────────────────────
  // Master serves the route handlers in app/robots.ts, app/sitemap.ts, and
  // app/llms.txt/route.ts. Tenants must NOT serve master content (would
  // expose Lead Friendly's marketing surface on tenants' indexed domains).
  // Return tenant-appropriate responses inline before any further logic.
  if (!isMaster) {
    if (pathname === '/robots.txt') {
      return new NextResponse(TENANT_ROBOTS_TXT, {
        status: 200,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      })
    }
    if (pathname === '/sitemap.xml') {
      return new NextResponse(TENANT_SITEMAP_XML, {
        status: 200,
        headers: { 'Content-Type': 'application/xml; charset=utf-8' },
      })
    }
    if (pathname === '/llms.txt') {
      return new NextResponse(null, { status: 404 })
    }
  }

  // ── Build forwarded request headers ──────────────────────────
  // requestHeaders accumulates x-lf-* mutations that downstream server
  // components (root layout, etc.) read via headers().
  const requestHeaders = new Headers(request.headers)
  if (!isMaster) {
    requestHeaders.set('x-custom-domain', hostname)
  }

  // ── CORS preflight for API routes ────────────────────────────
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

  // ── Rate limiting on login route ─────────────────────────────
  if (pathname === '/login' && request.method === 'POST') {
    if (!checkRateLimit(`login:${ip}`, 5, 15 * 60 * 1000)) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please try again in 15 minutes.' },
        { status: 429 }
      )
    }
  }

  // ── Rate limiting on API routes (broad) ──────────────────────
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

  // Pass requestHeaders so route handlers receive forwarded Cookie + x-lf-*
  // headers (Next.js 16 proxy convention).
  const res = NextResponse.next({ request: { headers: requestHeaders } })

  // ── Set CORS header on API responses ─────────────────────────
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

  const isPublic = isPublicPath(pathname)
  const isProtected = isProtectedPath(pathname)

  // ── Tenant org lookup ────────────────────────────────────────
  // White-label custom domain → org. Stage 3.2 onward only consults
  // organizations.custom_domain (the legacy sub_accounts.custom_domain
  // fallback was removed when Stage 3.1 dropped sub_accounts).
  //
  // Sets x-lf-org-id + brand headers consumed by the root layout. Hard
  // redirects to /suspended | /domain-pending | /unknown-domain when the
  // domain isn't fully verified — those landing pages are in PUBLIC_EXACT
  // so they don't loop.
  if (!isMaster) {
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
      // No matching organizations.custom_domain. Land on a friendly page.
      return NextResponse.redirect(new URL('/unknown-domain', request.url))
    }
  }

  // ── '/' handling ─────────────────────────────────────────────
  // Authed → /dashboard regardless of master/tenant. Unauthed master falls
  // through to render the marketing page; unauthed tenant gets bounced to
  // /login (preserves existing behavior — tenant home is the app, not
  // marketing). The auth check uses supabase.auth.getUser() — same source
  // of truth as the protected branch below.
  if (pathname === '/') {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
    if (!isMaster) {
      return NextResponse.redirect(new URL('/login', request.url), 307)
    }
    // Unauthed master: fall through to public-return below.
  }

  // ── Public path → pass through ───────────────────────────────
  // Also covers anything that isn't explicitly protected: unknown URLs fall
  // through to Next.js routing so app/not-found.tsx returns a real HTTP 404.
  if (isPublic || !isProtected) {
    emitOverrideHeaders(request.headers, requestHeaders, res)
    return res
  }

  // ── Auth check (protected paths only) ────────────────────────
  // Use getUser() instead of getSession() — getSession() only reads the
  // cookie without server-side verification, so a stale or tampered JWT
  // could bypass auth. getUser() validates the token with Supabase.
  const { data: { user }, error: userError } = await supabase.auth.getUser()

  if (!user || userError) {
    const loginUrl = new URL('/login', request.url)
    // Preserve the originally-requested path so we can bounce the user
    // back after login.
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl, 307)
  }

  // Keep a session reference for downstream checks (subscription gate, etc.)
  const session = { user }

  // ── Role flags + /agency/* gate ──────────────────────────────
  // For authenticated users, derive whether they're an agency admin
  // (top-level org owner/admin) or a sub-account user (their home org has a
  // non-null parent_organization_id). The flags are injected into request
  // headers so the root layout can pass them through to BrandContext for
  // client-side gating.
  //
  // Non-agency-admin users hitting /agency/* get a 404 rewrite — the route
  // should appear not to exist, not redirect them somewhere visible.
  let isAgencyAdmin = false
  let isSubAccount = false
  let userOrgId: string | null = null
  let isPlatformStaff = false

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

  requestHeaders.set('x-lf-user-is-agency-admin', isAgencyAdmin ? '1' : '0')
  requestHeaders.set('x-lf-user-is-sub-account', isSubAccount ? '1' : '0')
  requestHeaders.set('x-lf-platform-staff', isPlatformStaff ? '1' : '0')

  // ── Brand preview (Stage 3.4) ────────────────────────────────
  // Agency admins can opt into seeing their own brand on platform hosts via
  // the lf_brand_preview cookie. Four gates, all required:
  //   1. Authed — guaranteed by the protected-branch flow above (we'd have
  //      already 307'd to /login otherwise).
  //   2. Agency admin — explicit `isAgencyAdmin && userOrgId`.
  //   3. Master host — explicit `isMaster &&` (a tenant request already had
  //      x-lf-org-id set by the org lookup, so preview shouldn't override it).
  //   4. Cookie set to "1" — explicit.
  // The header is consumed by the root layout to override effectiveOrgId
  // (impersonation > custom domain > preview > platform default).
  if (
    isMaster &&
    isAgencyAdmin &&
    userOrgId &&
    request.cookies.get(BRAND_PREVIEW_COOKIE_NAME)?.value === '1'
  ) {
    requestHeaders.set('x-lf-brand-preview-org-id', userOrgId)
  }

  // ── Subscription gate (opt-in via SUBSCRIPTION_GATE_ENABLED) ──
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

  // ── Impersonation check ──────────────────────────────────────
  // Reads lf_impersonation_token httpOnly cookie set by /api/agency/impersonate.
  // Validates via the get_active_impersonation RPC (granted to anon for
  // middleware compat — the RPC itself returns no row if the token is
  // expired/ended/invalid).
  //
  // On valid session: injects three request headers consumed by server
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

  emitOverrideHeaders(request.headers, requestHeaders, res)
  return res
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ]
}
