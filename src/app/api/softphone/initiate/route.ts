import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createUserClient } from "@/lib/supabase/server";
import {
  deleteRoom,
  createAccessToken,
  getLiveKitUrl,
  createRoom,
} from "@/lib/livekit/server";
import { buildCallRecordingEgress } from "@/lib/livekit/egress";
import { createSipParticipant } from "@/lib/livekit/sip";

/**
 * POST /api/softphone/initiate
 *
 * Rep browser initiates an outbound PSTN call via LiveKit SIP.
 *
 * Request body:
 *   {
 *     contactId: string,    // uuid of contacts row the rep wants to call
 *     fromNumber: string    // e.164 — org-owned number to present as CLI
 *   }
 *
 * Response (200):
 *   {
 *     callId: string,       // calls.id
 *     roomName: string,     // LiveKit room
 *     token: string,        // rep's access token (TTL 1h)
 *     wsUrl: string,        // LiveKit ws URL for client connection
 *     sipParticipantIdentity: string  // for targeting DTMF data messages
 *   }
 *
 * Errors:
 *   401 — no session / not authenticated
 *   403 — contact or fromNumber doesn't belong to rep's org
 *   404 — contact not found / contact has no phone
 *   409 — fromNumber owned but not active (exhausted/paused/suspended)
 *   502 — LiveKit SIP dispatch failed
 */

// ── Admin client for writes that need to bypass RLS ──────────
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

// ── Constants ────────────────────────────────────────────────
const CALLBACK_ROUTING_TTL_HOURS = 72;

export async function POST(req: NextRequest) {
  try {
    // ── Parse body ──────────────────────────────────────────
    let body: { contactId?: string; fromNumber?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const contactId = body.contactId?.trim();
    const fromNumber = body.fromNumber?.trim();

    if (!contactId) {
      return NextResponse.json(
        { error: "contactId is required" },
        { status: 400 },
      );
    }
    if (!fromNumber) {
      return NextResponse.json(
        { error: "fromNumber is required" },
        { status: 400 },
      );
    }

    // ── Authenticate rep via Supabase session ───────────────
    const supabaseUserClient = await createUserClient();
    const {
      data: { user },
      error: userErr,
    } = await supabaseUserClient.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Load rep's profile → org_id ─────────────────────────
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("id, organization_id, full_name")
      .eq("id", user.id)
      .single();

    if (profileErr || !profile?.organization_id) {
      console.error(
        `[softphone/initiate] profile lookup failed for user ${user.id}:`,
        profileErr,
      );
      return NextResponse.json(
        { error: "Profile or organization not found" },
        { status: 403 },
      );
    }

    const orgId = profile.organization_id;

    // ── Validate contact belongs to org & has a phone ───────
    const { data: contact, error: contactErr } = await supabaseAdmin
      .from("contacts")
      .select("id, organization_id, first_name, last_name, phone")
      .eq("id", contactId)
      .single();

    if (contactErr || !contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }
    if (contact.organization_id !== orgId) {
      return NextResponse.json(
        { error: "Contact does not belong to your organization" },
        { status: 403 },
      );
    }
    if (!contact.phone) {
      return NextResponse.json(
        { error: "Contact has no phone number on file" },
        { status: 404 },
      );
    }

    // ── Validate fromNumber is owned by rep's org ───────────
    // Two-step: first confirm ownership (any status), then confirm active.
    // This lets us return a specific 409 "exhausted/paused" error instead
    // of a misleading 403 when the number is owned but temporarily unusable.
    const { data: ownedNumber, error: numberErr } = await supabaseAdmin
      .from("phone_numbers")
      .select("id, number, organization_id, status")
      .eq("organization_id", orgId)
      .eq("number", fromNumber)
      .maybeSingle();

    if (numberErr) {
      console.error(`[softphone/initiate] phone_numbers lookup error:`, numberErr);
      return NextResponse.json(
        { error: "Failed to validate fromNumber" },
        { status: 500 },
      );
    }
    if (!ownedNumber) {
      return NextResponse.json(
        { error: "fromNumber is not owned by your organization" },
        { status: 403 },
      );
    }
    if (ownedNumber.status !== "active") {
      return NextResponse.json(
        {
          error: "Number not available",
          detail: `Number status: ${ownedNumber.status}`,
          numberStatus: ownedNumber.status,
        },
        { status: 409 },
      );
    }

    // ── Insert calls row ────────────────────────────────────
    const callbackExpires = new Date(
      Date.now() + CALLBACK_ROUTING_TTL_HOURS * 60 * 60 * 1000,
    ).toISOString();

    const startedAt = new Date().toISOString();

    const { data: callRow, error: insertErr } = await supabaseAdmin
      .from("calls")
      .insert({
        organization_id: orgId,
        contact_id: contact.id,
        user_id: user.id,
        direction: "outbound",
        status: "initiated",
        call_type: "webrtc_outbound_pstn",
        from_number: fromNumber,
        to_number: contact.phone,
        started_at: startedAt,
        initiated_by: "softphone",
        call_mode: "human",
        callback_routing_expires_at: callbackExpires,
        provider: "livekit",
        recording_disclosed: true,
      })
      .select("id")
      .single();

    if (insertErr || !callRow) {
      console.error(`[softphone/initiate] call insert failed:`, insertErr);
      return NextResponse.json(
        { error: "Failed to create call record" },
        { status: 500 },
      );
    }

    const callId = callRow.id as string;
    const roomName = `call_${callId}`;
    const repIdentity = `rep_${user.id}`;
    const sipIdentity = `sip_${contact.id}`;

    // ── Set livekit_room_id on the row (so webhook can resolve it)
    await supabaseAdmin
      .from("calls")
      .update({ livekit_room_id: roomName })
      .eq("id", callId);

    // ── Create LiveKit room with metadata + optional egress ─
    //
    // Egress config is built by the shared helper (src/lib/livekit/egress.ts)
    // so all three call paths (softphone, webrtc/create-call, sip-outbound)
    // share identical recording behavior. Returns undefined if
    // RECORDING_ENABLED=false or any S3 env var is missing — in which case
    // the call proceeds without recording (logged).
    const roomMetadata = JSON.stringify({
      callRecordId: callId,
      organizationId: orgId,
      callType: "webrtc_outbound_pstn",
      repUserId: user.id,
      contactId: contact.id,
    });

    const egressConfig = buildCallRecordingEgress(orgId, callId, roomName);

    try {
      await createRoom({
        name: roomName,
        metadata: roomMetadata,
        emptyTimeout: 0,
        egress: egressConfig,
      });
    } catch (roomErr) {
      console.error(`[softphone/initiate] createRoom failed:`, roomErr);
      await supabaseAdmin
        .from("calls")
        .update({
          status: "failed",
          ended_at: new Date().toISOString(),
          hangup_cause: "room_create_failed",
          hangup_source: "livekit",
        })
        .eq("id", callId);
      return NextResponse.json(
        { error: "Failed to create LiveKit room" },
        { status: 502 },
      );
    }

    // ── Mint rep access token ───────────────────────────────
    let token: string;
    try {
      token = await createAccessToken({
        identity: repIdentity,
        name: profile.full_name ?? user.email ?? "Rep",
        room: roomName,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true, // needed for DTMF data channel
        ttlSeconds: 3600,
      });
    } catch (tokenErr) {
      console.error(`[softphone/initiate] token mint failed:`, tokenErr);
      await bestEffortCleanup(callId, roomName, "token_mint_failed");
      return NextResponse.json(
        { error: "Failed to mint access token" },
        { status: 500 },
      );
    }

    // ── Dispatch outbound SIP participant ───────────────────
    const trunkId = process.env.LIVEKIT_SIP_OUTBOUND_TRUNK_ID;
    if (!trunkId) {
      console.error(`[softphone/initiate] LIVEKIT_SIP_OUTBOUND_TRUNK_ID not set`);
      await bestEffortCleanup(callId, roomName, "missing_trunk_config");
      return NextResponse.json(
        { error: "SIP trunk not configured" },
        { status: 500 },
      );
    }

    const contactDisplayName =
      [contact.first_name, contact.last_name].filter(Boolean).join(" ").trim() ||
      contact.phone;

    try {
      await createSipParticipant({
        trunkId,
        toNumber: contact.phone,
        fromNumber,
        roomName,
        participantIdentity: sipIdentity,
        participantName: contactDisplayName,
        krispEnabled: true,
        // Do NOT set waitUntilAnswered — let the browser observe ringing/answer
        // via room events. This keeps the HTTP response fast.
        ringingTimeoutSeconds: 45,
        maxCallDurationSeconds: 60 * 60, // 1 hour hard cap
        participantMetadata: JSON.stringify({
          callRecordId: callId,
          contactId: contact.id,
        }),
      });
    } catch (sipErr) {
      console.error(`[softphone/initiate] createSipParticipant failed:`, sipErr);
      await bestEffortCleanup(callId, roomName, "sip_dispatch_failed");
      return NextResponse.json(
        { error: "Failed to dispatch outbound call" },
        { status: 502 },
      );
    }

    // ── Success ─────────────────────────────────────────────
    return NextResponse.json({
      callId,
      roomName,
      accessToken: token,
      serverUrl: getLiveKitUrl(),
      sipParticipantIdentity: sipIdentity,
    });
  } catch (err) {
    console.error(`[softphone/initiate] unhandled error:`, err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// ── Helpers ──────────────────────────────────────────────────

/**
 * Best-effort cleanup when something fails mid-initiation.
 * Marks the call failed and tears down the room. Errors are logged but
 * not thrown — the calling handler is already in an error path.
 */
async function bestEffortCleanup(
  callId: string,
  roomName: string,
  hangupCause: string,
): Promise<void> {
  try {
    await supabaseAdmin
      .from("calls")
      .update({
        status: "failed",
        ended_at: new Date().toISOString(),
        hangup_cause: hangupCause,
        hangup_source: "livekit",
      })
      .eq("id", callId);
  } catch (e) {
    console.error(`[softphone/initiate] cleanup: mark-failed error:`, e);
  }
  try {
    await deleteRoom(roomName);
  } catch (e) {
    // deleteRoom throws if room already gone — fine
    console.error(`[softphone/initiate] cleanup: deleteRoom error:`, e);
  }
}
