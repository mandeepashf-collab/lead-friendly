import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getWebhookReceiver } from "@/lib/livekit/server";

/**
 * POST /api/webrtc/webhook
 *
 * LiveKit webhook receiver. Handles room & track events for ALL LiveKit
 * calls in Lead Friendly:
 *  - AI agent calls (inbound + outbound, created via /api/webrtc/create-call
 *    and /api/calls/sip-outbound)
 *  - Browser softphone calls (created Apr 21 via /api/softphone/initiate)
 *
 * Configure in LiveKit Cloud dashboard:
 *   Webhook URL → https://www.leadfriendly.com/api/webrtc/webhook
 *
 * Signature verification uses LIVEKIT_WEBHOOK_SECRET (falls back to
 * LIVEKIT_API_SECRET) — see src/lib/livekit/server.ts.
 */

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

// ── Helpers ──────────────────────────────────────────────────

/**
 * Resolve the calls.id for a given webhook event.
 *
 * Primary path: parse callRecordId from room metadata (set by the caller
 * at room creation time).
 * Fallback path: look up the calls row by livekit_room_id.
 *
 * The fallback is critical for the "stuck active post-hangup" bug: if
 * metadata was missing or malformed at room creation, the original handler
 * silently skipped the row_finished update. Now we also try livekit_room_id.
 */
async function resolveCallRecordId(
  roomName: string,
  roomMetadata: string,
): Promise<string | null> {
  // Try metadata first
  try {
    if (roomMetadata) {
      const meta = JSON.parse(roomMetadata);
      if (meta?.callRecordId) return String(meta.callRecordId);
    }
  } catch {
    // metadata malformed — fall through
  }

  // Fallback: look up by livekit_room_id
  if (!roomName) return null;
  const { data, error } = await supabaseAdmin
    .from("calls")
    .select("id")
    .eq("livekit_room_id", roomName)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error(`[webrtc/webhook] fallback lookup failed for room ${roomName}:`, error);
    return null;
  }
  return data?.id ?? null;
}

/**
 * Classify a participant identity so we can branch logic correctly.
 *  - "agent_..."   → AI worker (existing pattern)
 *  - "sip_..."     → LiveKit SIP bridge (PSTN leg of a softphone or AI-to-PSTN call)
 *  - "rep_..."     → Browser rep (softphone caller, new Apr 21 pattern)
 *  - "caller-..."  → Legacy browser identity (webrtc test calls)
 *  - "test-..."    → Ephemeral ad-hoc test caller
 */
function classifyIdentity(identity: string):
  | "agent"
  | "sip"
  | "rep"
  | "caller"
  | "test"
  | "other" {
  if (identity.startsWith("agent_")) return "agent";
  if (identity.startsWith("sip_")) return "sip";
  if (identity.startsWith("rep_")) return "rep";
  if (identity.startsWith("caller-")) return "caller";
  if (identity.startsWith("test-")) return "test";
  return "other";
}

// ── Main handler ─────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const authHeader = req.headers.get("authorization") ?? "";

    // ── Verify webhook signature ─────────────────────────────
    let event;
    try {
      const receiver = getWebhookReceiver();
      event = await receiver.receive(body, authHeader);
    } catch (verifyErr) {
      console.error("[webrtc/webhook] signature verification failed:", verifyErr);
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const eventType = event.event;
    const roomName = event.room?.name ?? "";
    const roomMetadata = event.room?.metadata ?? "";

    console.log(`[webrtc/webhook] ${eventType} room=${roomName}`);

    // Resolve callRecordId via metadata → fallback to livekit_room_id lookup
    const callRecordId = await resolveCallRecordId(roomName, roomMetadata);

    // ── Handle events ────────────────────────────────────────

    switch (eventType) {
      // A participant joined — mark call as active for agent OR sip OR rep
      case "participant_joined": {
        const participantIdentity = event.participant?.identity ?? "";
        const role = classifyIdentity(participantIdentity);
        console.log(
          `[webrtc/webhook] participant joined: ${participantIdentity} (${role}) in ${roomName}`,
        );

        if (!callRecordId) break;

        // AI agent joining (existing behavior)
        if (role === "agent") {
          await supabaseAdmin
            .from("calls")
            .update({
              status: "active",
              answered_at: new Date().toISOString(),
            })
            .eq("id", callRecordId);
          break;
        }

        // SIP leg joining a softphone call → the PSTN side has answered.
        // For rep-browser-outbound, this is the moment the call is really
        // "connected". For AI-outbound (sip-outbound), the agent worker
        // handles state; we only act when we can verify this is a
        // softphone call, i.e. call_type = webrtc_outbound_pstn.
        if (role === "sip") {
          const { data: callRow } = await supabaseAdmin
            .from("calls")
            .select("call_type, status")
            .eq("id", callRecordId)
            .single();

          if (
            callRow?.call_type === "webrtc_outbound_pstn" &&
            callRow.status !== "completed"
          ) {
            await supabaseAdmin
              .from("calls")
              .update({
                status: "active",
                answered_at: new Date().toISOString(),
              })
              .eq("id", callRecordId);
          }
        }
        break;
      }

      // A participant left — capture hangup cause for diagnostics
      case "participant_left": {
        const participantIdentity = event.participant?.identity ?? "";
        const role = classifyIdentity(participantIdentity);
        // LiveKit sends disconnection reason on the participant object
        // in some SDK versions; otherwise it's on event.disconnectReason.
        const reason =
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (event.participant as any)?.disconnectReason ??
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (event as any).disconnectReason ??
          null;
        console.log(
          `[webrtc/webhook] participant left: ${participantIdentity} (${role}) reason=${reason}`,
        );

        // We do NOT mark the call completed here — room_finished is the
        // authoritative terminal event. This just records the hangup cause
        // so debugging is easier later. Write only if we have a row and
        // no hangup_cause is already recorded (don't overwrite richer
        // agent-worker data).
        if (callRecordId && reason) {
          await supabaseAdmin
            .from("calls")
            .update({
              hangup_cause: String(reason),
              hangup_source: "livekit",
            })
            .eq("id", callRecordId)
            .is("hangup_cause", null);
        }
        break;
      }

      // Room closed — call is over. Authoritative terminal state.
      case "room_finished": {
        console.log(`[webrtc/webhook] room finished: ${roomName}`);

        if (!callRecordId) {
          console.warn(
            `[webrtc/webhook] room ${roomName} finished but no call record could be resolved (metadata and livekit_room_id both failed)`,
          );
          break;
        }

        // Only update if still active — don't overwrite a terminal state
        // set by the agent worker (which may have richer outcome data).
        const { data: existing } = await supabaseAdmin
          .from("calls")
          .select("status, started_at, answered_at, duration_seconds")
          .eq("id", callRecordId)
          .single();

        if (existing && existing.status !== "completed") {
          const endedAt = new Date();
          // Compute duration defensively: prefer answered_at → ended_at,
          // else started_at → ended_at, else leave unchanged.
          let duration = existing.duration_seconds ?? 0;
          const anchor = existing.answered_at ?? existing.started_at;
          if (anchor) {
            duration = Math.max(
              0,
              Math.floor((endedAt.getTime() - new Date(anchor).getTime()) / 1000),
            );
          }

          await supabaseAdmin
            .from("calls")
            .update({
              status: "completed",
              ended_at: endedAt.toISOString(),
              duration_seconds: duration,
            })
            .eq("id", callRecordId);
        }
        break;
      }

      // Egress started — useful for observability / debugging recording flows
      case "egress_started": {
        console.log(`[webrtc/webhook] egress started for room ${roomName}`);
        break;
      }

      // Egress (recording) finished — store URL + mark transcript pending
      case "egress_ended": {
        const egressInfo = event.egressInfo;
        if (egressInfo && callRecordId) {
          const fileResults = egressInfo.fileResults ?? [];
          // Prefer `filename` (the storage key we set in egress filepath,
          // e.g. "{org_id}/{call_id}.ogg") over `location` (the full S3
          // URL). createSignedUrl() requires the storage key, not a URL.
          const rawPath =
            fileResults[0]?.filename ?? fileResults[0]?.location ?? null;
          // Defensive normalization: if we somehow land on a full URL,
          // strip the bucket prefix so we always end up with a clean key.
          const recordingUrl = rawPath
            ? rawPath.includes("/call-recordings/")
              ? rawPath.split("/call-recordings/")[1].split("?")[0]
              : rawPath
            : null;
          const durationNs = fileResults[0]?.duration ?? null;
          const durationSeconds =
            durationNs != null
              ? Math.max(0, Math.floor(Number(durationNs) / 1_000_000_000))
              : null;

          if (recordingUrl) {
            const update: Record<string, unknown> = {
              recording_url: recordingUrl,
              transcript_status: "pending",
            };
            if (durationSeconds !== null) {
              update.recording_duration_seconds = durationSeconds;
            }

            await supabaseAdmin
              .from("calls")
              .update(update)
              .eq("id", callRecordId);
            console.log(
              `[webrtc/webhook] recording saved for call ${callRecordId}: ${recordingUrl} (${durationSeconds}s)`,
            );
          }
        }
        break;
      }

      default:
        // All other events (track_published, track_unpublished, etc.) are
        // logged but not acted on.
        console.log(`[webrtc/webhook] unhandled event: ${eventType}`);
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[webrtc/webhook] unhandled error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
