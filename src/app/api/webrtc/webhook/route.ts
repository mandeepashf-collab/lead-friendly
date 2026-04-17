import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getWebhookReceiver } from "@/lib/livekit/server";

/**
 * POST /api/webrtc/webhook
 *
 * LiveKit webhook receiver. Handles room & track events for:
 *  - Updating call status on participant join/leave
 *  - Storing recording URLs when egress finishes
 *  - Cleaning up call records on room close
 *
 * Configure in LiveKit Cloud dashboard:
 *   Webhook URL → https://yourdomain.com/api/webrtc/webhook
 */

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

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

    // Parse metadata to get callRecordId
    let callRecordId: string | null = null;
    try {
      const meta = JSON.parse(roomMetadata);
      callRecordId = meta.callRecordId ?? null;
    } catch { /* metadata may not be set yet */ }

    // ── Handle events ────────────────────────────────────────

    switch (eventType) {
      // A participant joined — mark call as active
      case "participant_joined": {
        const participantIdentity = event.participant?.identity ?? "";
        console.log(`[webrtc/webhook] participant joined: ${participantIdentity} in ${roomName}`);

        // When the AI agent joins, mark the call as answered
        if (participantIdentity.startsWith("agent_") && callRecordId) {
          await supabaseAdmin
            .from("calls")
            .update({
              status: "active",
              answered_at: new Date().toISOString(),
            })
            .eq("id", callRecordId);
        }
        break;
      }

      // A participant left
      case "participant_left": {
        const participantIdentity = event.participant?.identity ?? "";
        console.log(`[webrtc/webhook] participant left: ${participantIdentity} in ${roomName}`);
        break;
      }

      // Room closed — call is over
      case "room_finished": {
        console.log(`[webrtc/webhook] room finished: ${roomName}`);

        if (callRecordId) {
          // Only update if still active (not already completed by agent worker)
          const { data: existing } = await supabaseAdmin
            .from("calls")
            .select("status")
            .eq("id", callRecordId)
            .single();

          if (existing && existing.status !== "completed") {
            await supabaseAdmin
              .from("calls")
              .update({
                status: "completed",
                ended_at: new Date().toISOString(),
              })
              .eq("id", callRecordId);
          }
        }
        break;
      }

      // Egress (recording) finished — store the URL
      case "egress_ended": {
        const egressInfo = event.egressInfo;
        if (egressInfo && callRecordId) {
          // Extract recording URL from file results
          const fileResults = egressInfo.fileResults ?? [];
          const recordingUrl =
            fileResults[0]?.location ?? fileResults[0]?.filename ?? null;

          if (recordingUrl) {
            await supabaseAdmin
              .from("calls")
              .update({ recording_url: recordingUrl })
              .eq("id", callRecordId);
            console.log(`[webrtc/webhook] recording saved for call ${callRecordId}: ${recordingUrl}`);
          }
        }
        break;
      }

      default:
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
