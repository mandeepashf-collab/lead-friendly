import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client for server-only writes that need to bypass RLS.
 *
 * Use this ONLY in:
 *   - API route handlers (src/app/api/**)
 *   - Server-side library functions (src/lib/**, never imported by "use client" code)
 *
 * The existing pattern across the repo is an inline
 *   createClient(URL, SUPABASE_SERVICE_ROLE_KEY, { auth: {...} })
 * in each route. This helper centralizes that so evals features can share one
 * definition — handy if we ever need to adjust global client options.
 */
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
