import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Require a valid Supabase session for an API route.
 * Throws a Response (401) if the user is not authenticated.
 *
 * Usage in a route handler:
 *   const user = await requireAuth();
 *   // if we reach here, user is authenticated
 */
export async function requireAuth() {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Cookie mutation in read-only context (e.g. static generation) — safe to ignore
          }
        },
      },
    }
  );

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return { user, supabase };
}

/**
 * Validate a Telnyx webhook request by checking required signature headers.
 * Returns true if the request looks like a legitimate Telnyx webhook.
 *
 * Full cryptographic validation requires the @telnyx/webhooks package and
 * a public key from the Telnyx portal — this performs a lightweight check.
 *
 * @param request - The incoming NextRequest
 */
export function validateTelnyxWebhook(request: Request): boolean {
  const signature = request.headers.get("telnyx-signature-ed25519");
  const timestamp = request.headers.get("telnyx-timestamp");

  if (!signature || !timestamp) return false;

  // Reject stale requests (> 5 minute window — prevents replay attacks)
  const now = Math.floor(Date.now() / 1000);
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts) || Math.abs(now - ts) > 300) return false;

  return true;
}

/**
 * Validate that an internal API request carries the correct cron secret.
 * Used for /api/automations/process and similar server-only routes.
 */
export function validateCronSecret(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;

  return authHeader.slice(7) === cronSecret;
}
