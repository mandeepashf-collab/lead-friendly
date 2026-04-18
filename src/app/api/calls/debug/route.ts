import { NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

/**
 * GET /api/calls/debug
 * Temporary diagnostic endpoint — checks env vars and DB connectivity.
 * Remove after debugging is complete.
 */
export async function GET() {
  const checks: Record<string, string> = {};

  // Check critical env vars exist (never log actual values!)
  checks.TELNYX_API_KEY = process.env.TELNYX_API_KEY ? 'SET' : 'MISSING';
  checks.TELNYX_APP_ID = process.env.TELNYX_APP_ID ? 'SET' : 'MISSING';
  checks.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'MISSING';
  checks.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ? 'SET' : 'MISSING';
  checks.ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY ? 'SET' : 'MISSING';

  // Try a service-role DB connection
  if (process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL) {
    try {
      const supabase = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { persistSession: false, autoRefreshToken: false } }
      );
      const { data, error } = await supabase
        .from('calls')
        .select('id')
        .limit(1)
        .maybeSingle();

      if (error) {
        checks.DB_CONNECTION = `ERROR: ${error.message} (code: ${error.code})`;
      } else {
        checks.DB_CONNECTION = data ? 'OK (found existing call)' : 'OK (table accessible, no rows)';
      }
    } catch (e: unknown) {
      checks.DB_CONNECTION = `EXCEPTION: ${e instanceof Error ? e.message : String(e)}`;
    }
  } else {
    checks.DB_CONNECTION = 'SKIPPED (missing env vars)';
  }

  return NextResponse.json({ status: 'debug', checks });
}
