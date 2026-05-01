import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getWebhookReceiver } from "@/lib/livekit/server";
import { submitToDeepgram } from "@/lib/deepgram/submit";
import { applyContactedOnFirstCall } from "@/lib/contacts/auto-status";
import { recordCallUsage } from "@/lib/billing/usage";

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
  egressRoomName?: string,
): Promise<string | null> {
  // Try room metadata first (fastest, most direct)
  try {
    if (roomMetadata) {
      const meta = JSON.parse(roomMetadata);
      if (meta?.callRecordId) return String(meta.callRecordId);
    }
  } catch {
    // metadata malformed — fall through
  }

  // Use whichever room name is available:
  // - Top-level event.room.name for most events (participant_*, track_*, room_*)
  // - event.egressInfo.roomName for egress events (where event.room is undefined)
  const effectiveRoomName = roomName || egressRoomName || "";
  if (!effectiveRoomName) return null;

  const { data, error } = await supabaseAdmin
    .from("calls")
    .select("id")
    .eq("livekit_room_id", effectiveRoomName)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error(
      `[webrtc/webhook] fallback lookup failed for room ${effectiveRoomName}:`,
      error,
    );
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

    // Resolve callRecordId via metadata → fallback to livekit_room_id lookup.
    // egressInfo carries its own roomName for egress_* events where
    // event.room is undefined.
    const egressRoomName = event.egressInfo?.roomName ?? undefined;
    const callRecordId = await resolveCallRecordId(
      roomName,
      roomMetadata,
      egressRoomName,
    );

    // Visibility: warn if we get an egress event but can't find its call row.
    // This is the exact silent-failure class that hid the recording-write bug.
    if (!callRecordId && event.event?.startsWith("egress_")) {
      console.warn(
        `[webrtc/webhook] ${event.event} could not resolve call record. roomName="${roomName}" egressRoomName="${egressRoomName}" egressId="${event.egressInfo?.egressId ?? ""}"`,
      );
    }

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
          .select("status, started_at, answered_at, duration_seconds, contact_id")
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

          // Bill the call: increment minute counter, debit wallet for any
          // overage. Idempotent against retries via last_billed_seconds.
          // Never throws — failures are logged but don't break the flow.
          const billing = await recordCallUsage({
            callId: callRecordId,
            totalDurationSeconds: duration,
            supabase: supabaseAdmin,
          });
          if (billing.billed) {
            console.log(
              `[webrtc/webhook] room_finished billed call=${callRecordId} +${billing.minutesAdded}min total=${billing.newTotalMinutes} overage=${billing.incrementalOverageMinutes}min debit=${billing.walletDebitedCents}\u00a2`,
            );
          } else if (!billing.ok) {
            console.error(
              `[webrtc/webhook] room_finished billing FAILED call=${callRecordId} reason=${billing.reason} err=${billing.errorMessage ?? ""}`,
            );
          }

          // Auto-status: upgrade contact 'new' → 'contacted'. Best-effort.
          // Phase 3b: 'webhook' kind so the timeline event is attributed
          // to a webhook source rather than internal completion.
          await applyContactedOnFirstCall(
            supabaseAdmin,
            existing.contact_id,
            "webhook",
          );
        }
        break;
      }

      // Egress started — useful for observability / debugging recording flows
      case "egress_started": {
        console.log(`[webrtc/webhook] egress started for room ${roomName}`);
        break;
      }

      // Egress (recording) finished — store URL + mark transcript pending.
      // Flattened with named skip-reason logs so every egress_ended event
      // produces exactly one log line: success or a reason for skipping.
      case "egress_ended": {
        if (!callRecordId) {
          console.warn(
            `[webrtc/webhook] egress_ended: skipped DB update — no call record for egress ${event.egressInfo?.egressId ?? "?"} (roomName="${event.egressInfo?.roomName ?? ""}")`,
          );
          break;
        }

        const egressInfo = event.egressInfo;
        if (!egressInfo) {
          console.warn(
            `[webrtc/webhook] egress_ended: skipped DB update for call ${callRecordId} — no egressInfo in event`,
          );
          break;
        }

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

        if (!recordingUrl) {
          console.warn(
            `[webrtc/webhook] egress_ended: skipped DB update for call ${callRecordId} — no fileResults in egressInfo`,
          );
          break;
        }

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
          `[webrtc/webhook] egress_ended: recording saved for call ${callRecordId}, url=${recordingUrl}, duration=${durationSeconds}s`,
        );

        // ── Kick off Deepgram async transcription ─────────────────────
        const transcriptionEnabled = process.env.TRANSCRIPTION_ENABLED === "true";
        const requiredDgVars = [
          "DEEPGRAM_API_KEY",
          "DEEPGRAM_CALLBACK_BASIC_AUTH_USER",
          "DEEPGRAM_CALLBACK_BASIC_AUTH_PASS",
        ] as const;
        const missingDgVars = transcriptionEnabled
          ? requiredDgVars.filter((k) => !process.env[k])
          : [];

        if (!transcriptionEnabled) {
          console.log(
            `[deepgram] skipped for call ${callRecordId}: TRANSCRIPTION_ENABLED=false`,
          );
          break;
        }
        if (missingDgVars.length > 0) {
          console.error(
            `[deepgram] skipped for call ${callRecordId}: missing env vars ${missingDgVars.join(", ")}`,
          );
          break;
        }

        try {
          // Generate a 4-hour signed URL for Deepgram to fetch the audio.
          // 4h allows for worst-case queue delays; UI playback uses 1h TTL separately.
          // Reuse the existing service-role supabaseAdmin client — no need to
          // spin up a second identical service client just to sign.
          const DEEPGRAM_SIGNED_URL_TTL = 4 * 3600;
          const { data: signed, error: signErr } = await supabaseAdmin.storage
            .from("call-recordings")
            .createSignedUrl(recordingUrl, DEEPGRAM_SIGNED_URL_TTL);

          if (signErr || !signed) {
            console.error(
              `[deepgram] failed to sign URL for call ${callRecordId}:`,
              signErr,
            );
            break;
          }

          // Determine our public base URL for the callback. Vercel provides VERCEL_URL
          // for preview deploys; production uses NEXT_PUBLIC_APP_URL if set, else leadfriendly.com.
          const callbackBaseUrl =
            process.env.NEXT_PUBLIC_APP_URL ??
            "https://www.leadfriendly.com";

          const { request_id } = await submitToDeepgram({
            audioSignedUrl: signed.signedUrl,
            callbackBaseUrl,
          });

          await supabaseAdmin
            .from("calls")
            .update({
              deepgram_request_id: request_id,
              transcript_status: "processing",
            })
            .eq("id", callRecordId);

          console.log(
            `[deepgram] submitted for call ${callRecordId}, request_id=${request_id}`,
          );
        } catch (dgErr) {
          console.error(
            `[deepgram] submission failed for call ${callRecordId}:`,
            dgErr instanceof Error ? dgErr.message : dgErr,
          );
          // Leave transcript_status='pending' so a future reaper cron can retry.
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
