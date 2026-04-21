import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createUserClient } from "@/lib/supabase/server";

/**
 * GET /api/softphone/recording-url?callId=<uuid>
 *
 * Returns a short-lived signed URL for the recording attached to a call,
 * so the browser can stream/download it without the bucket being public.
 *
 * Auth: Supabase session (same pattern as /api/softphone/initiate and
 * /api/softphone/hangup). Ownership is enforced by RLS on the calls
 * table — the user-scoped client can only read rows in the rep's org.
 *
 * Signing uses the service-role client because the storage bucket is
 * private and signed URL creation is easier to reason about with a
 * privileged key than through org-scoped storage RLS.
 *
 * Response (200):
 *   { signedUrl: string, expiresAt: string (ISO) }
 *
 * Errors:
 *   400 — missing callId
 *   401 — not authenticated
 *   404 — call not found (RLS blocked or row doesn't exist) / no recording yet
 *   500 — signing failed
 */

const SIGNED_URL_TTL_SECONDS = 3600;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const callId = searchParams.get("callId");

  if (!callId) {
    return NextResponse.json({ error: "callId is required" }, { status: 400 });
  }

  // ── Authenticate rep ────────────────────────────────────────
  const supabaseUserClient = await createUserClient();
  const {
    data: { user },
    error: authError,
  } = await supabaseUserClient.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Fetch call row via user client (RLS enforces org ownership) ──
  const { data: call, error: callError } = await supabaseUserClient
    .from("calls")
    .select("id, organization_id, recording_url")
    .eq("id", callId)
    .single();

  if (callError || !call) {
    return NextResponse.json({ error: "Call not found" }, { status: 404 });
  }

  if (!call.recording_url) {
    return NextResponse.json(
      { error: "Recording not available yet" },
      { status: 404 },
    );
  }

  // ── Sign URL using service-role client ──────────────────────
  const supabaseService = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: signed, error: signError } = await supabaseService.storage
    .from("call-recordings")
    .createSignedUrl(call.recording_url, SIGNED_URL_TTL_SECONDS);

  if (signError || !signed) {
    console.error(
      `[softphone/recording-url] sign failed for call ${callId}:`,
      signError,
    );
    return NextResponse.json(
      { error: "Failed to sign URL", detail: signError?.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    signedUrl: signed.signedUrl,
    expiresAt: new Date(
      Date.now() + SIGNED_URL_TTL_SECONDS * 1000,
    ).toISOString(),
  });
}
