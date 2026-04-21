import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createUserClient } from "@/lib/supabase/server";
import { getRoomService } from "@/lib/livekit/server";

/**
 * POST /api/softphone/hangup
 *
 * Rep requests to end a call. This route tells LiveKit to remove the rep
 * from the room. The room is configured with emptyTimeout=0 (in
 * /api/softphone/initiate), so removing the rep triggers immediate room
 * teardown, which fires `room_finished` on the webhook
 * (/api/webrtc/webhook), which writes the authoritative terminal state to
 * the calls row.
 *
 * We do NOT update the calls row directly here. The webhook is the single
 * source of truth for terminal state. Doing both from two places races.
 *
 * Request body:
 *   { callId: string }
 *
 * Response (200):
 *   { ok: true }
 *
 * Errors:
 *   400 — missing callId
 *   401 — not authenticated
 *   403 — call does not belong to rep's organization
 *   404 — call not found
 *   500 — internal error
 *
 * Idempotency:
 *   If the room is already gone (e.g., the contact hung up first and
 *   room_finished already fired), this returns 200 with ok=true. The
 *   browser shouldn't have to distinguish "I hung up" from "already over".
 */

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

export async function POST(req: NextRequest) {
  try {
    // ── Parse body ──────────────────────────────────────────
    let body: { callId?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const callId = body.callId?.trim();
    if (!callId) {
      return NextResponse.json(
        { error: "callId is required" },
        { status: 400 },
      );
    }

    // ── Authenticate rep ────────────────────────────────────
    const supabaseUserClient = await createUserClient();
    const {
      data: { user },
      error: userErr,
    } = await supabaseUserClient.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Load rep profile for org_id ─────────────────────────
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    if (profileErr || !profile?.organization_id) {
      console.error(
        `[softphone/hangup] profile lookup failed for user ${user.id}:`,
        profileErr,
      );
      return NextResponse.json(
        { error: "Profile or organization not found" },
        { status: 403 },
      );
    }

    // ── Load call row, verify org ownership ─────────────────
    const { data: callRow, error: callErr } = await supabaseAdmin
      .from("calls")
      .select("id, organization_id, user_id, livekit_room_id, status")
      .eq("id", callId)
      .single();

    if (callErr || !callRow) {
      return NextResponse.json({ error: "Call not found" }, { status: 404 });
    }

    if (callRow.organization_id !== profile.organization_id) {
      return NextResponse.json(
        { error: "Call does not belong to your organization" },
        { status: 403 },
      );
    }

    // If the call is already in a terminal state, return idempotently.
    if (callRow.status === "completed" || callRow.status === "failed") {
      return NextResponse.json({ ok: true, alreadyEnded: true });
    }

    const roomName = callRow.livekit_room_id;
    if (!roomName) {
      // Shouldn't happen for softphone calls since initiate sets it, but
      // guard anyway. Mark the row completed directly as a fallback since
      // there's no room for the webhook to reason about.
      console.warn(
        `[softphone/hangup] call ${callId} has no livekit_room_id; marking completed directly`,
      );
      await supabaseAdmin
        .from("calls")
        .update({
          status: "completed",
          ended_at: new Date().toISOString(),
          hangup_cause: "client_hangup_no_room",
          hangup_source: "softphone",
        })
        .eq("id", callId);
      return NextResponse.json({ ok: true });
    }

    // ── Remove rep participant from the LiveKit room ────────
    // The room is configured with emptyTimeout=0, so removing the last
    // human participant triggers teardown. The SIP leg will follow via
    // SIP BYE, and the webhook will write terminal state.
    //
    // We target the rep's identity specifically rather than deleteRoom()
    // because deleteRoom bypasses normal participant-disconnect events
    // and races with webhook state. removeParticipant is the clean path.
    const repIdentity = `rep_${user.id}`;
    const room = getRoomService();

    try {
      await room.removeParticipant(roomName, repIdentity);
    } catch (removeErr) {
      // Two plausible errors here, both benign:
      //   1. Participant already gone (call already ended, race with webhook)
      //   2. Room already gone (SIP side hung up first, room cleaned up)
      // In either case, the room_finished webhook has or will fire and
      // set terminal state. Return 200 idempotently.
      const msg = removeErr instanceof Error ? removeErr.message : String(removeErr);
      console.log(
        `[softphone/hangup] removeParticipant returned error for call ${callId} (benign if already gone): ${msg}`,
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`[softphone/hangup] unhandled error:`, err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
