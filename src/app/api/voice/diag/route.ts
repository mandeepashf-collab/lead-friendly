import { NextResponse } from "next/server";

/**
 * Diagnostic endpoint to verify Voice pipeline env vars are set on
 * the deployed Vercel function. Does NOT leak secret values — only
 * reports presence + prefix of each key.
 *
 * Hit: GET https://www.leadfriendly.com/api/voice/diag
 */
export async function GET() {
  const mask = (v: string | undefined) =>
    !v ? "MISSING" : `${v.slice(0, 6)}…${v.slice(-4)} (len:${v.length})`;

  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
    env: {
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || "MISSING",
      TELNYX_API_KEY: mask(process.env.TELNYX_API_KEY),
      TELNYX_APP_ID: mask(process.env.TELNYX_APP_ID),
      ANTHROPIC_API_KEY: mask(process.env.ANTHROPIC_API_KEY),
      SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || "MISSING",
      SUPABASE_SERVICE_ROLE_KEY: mask(process.env.SUPABASE_SERVICE_ROLE_KEY),
    },
    notes: [
      "Telnyx Voice App webhook should be: https://www.leadfriendly.com/api/voice/answer",
      "If any TELNYX/ANTHROPIC/SUPABASE keys show MISSING, add them in Vercel project settings.",
    ],
  });
}
