import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// ── Lead Friendly Middleware ──────────────────────────────────
//
// Jobs:
// 1. Security — block sensitive paths, rate limiting, CORS
// 2. Custom domain routing — white-label sub-account detection
// 3. Impersonation session — scope data access to sub-account

const PUBLIC_ROUTES = ['/auth', '/login', '/register', '/api/voice', '/api/health', '/api/agents', '/pricing', '/_next', '/favicon', '/api/stripe/webhook', '/api/webrtc/webhook']

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

export async function middleware(request: NextRequest) {
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

  const res = NextResponse.next({ request })

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
                       hostname.includes('lead-friendly.vercel.app') ||
                       hostname.includes('localhost')

  if (!isMainDomain) {
    // This is a white-label custom domain — look up sub-account
    const { data: subAccount } = await supabase
      .from('sub_accounts')
      .select('id, agency_id, company_name, logo_url, primary_color, accent_color, status')
      .eq('custom_domain', hostname)
      .single()

    if (subAccount) {
      if (subAccount.status === 'paused' || subAccount.status === 'suspended') {
        return NextResponse.redirect(new URL('/suspended', request.url))
      }

      // Inject sub-account branding into headers
      // Layout reads these to apply client's brand
      res.headers.set('x-sub-account-id', subAccount.id)
      res.headers.set('x-agency-id', subAccount.agency_id)
      res.headers.set('x-brand-name', subAccount.company_name || 'CRM')
      res.headers.set('x-brand-color', subAccount.primary_color || '#6366f1')
      res.headers.set('x-brand-logo', subAccount.logo_url || '')
      res.headers.set('x-is-white-label', 'true')
    } else {
      // Unknown domain
      return NextResponse.redirect(new URL('https://leadfriendly.com', request.url))
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

  // ── Subscription gate (opt-in via SUBSCRIPTION_GATE_ENABLED) ────
  // Redirect users whose org has no active subscription to /billing so they
  // can start or fix their subscription. We skip:
  //   - all exempt paths above
  //   - agency owners (subscription is per-org, but agencies have a different
  //     billing model via the `agencies` table — leave them alone here)
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
  const impersonationToken = request.cookies.get('impersonation_token')?.value
  const impersonationSubAccount = request.cookies.get('impersonation_sub_account')?.value

  if (impersonationToken && impersonationSubAccount) {
    // Validate token is still valid
    const { data: impSession } = await supabase
      .from('impersonation_sessions')
      .select('id, expires_at, ended_at')
      .eq('token', impersonationToken)
      .eq('sub_account_id', impersonationSubAccount)
      .single()

    if (impSession && !impSession.ended_at && new Date(impSession.expires_at) > new Date()) {
      // Valid impersonation — inject headers
      res.headers.set('x-impersonating', 'true')
      res.headers.set('x-impersonation-sub-account', impersonationSubAccount)
    } else {
      // Expired — clear cookies
      res.cookies.delete('impersonation_token')
      res.cookies.delete('impersonation_sub_account')
    }
  }

  return res
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ]
}
