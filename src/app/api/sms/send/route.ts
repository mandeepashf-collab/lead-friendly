import { NextRequest, NextResponse } from "next/server";
import { sendSms } from "@/lib/telnyx";

/**
 * POST /api/sms/send
 *
 * HTTP wrapper around lib/telnyx.sendSms(). Used by the dashboard / scripts
 * that need to send SMS over HTTP (not server-to-server inside another route).
 *
 * Body: { to: string; message: string; contact_id?: string; template_id?: string }
 *
 * NOTE: The previous implementation tried to log every send to a `messages`
 * table that doesn't have the columns it was inserting (contact_id, user_id,
 * direction, body, status, template_id, external_id) — that insert was
 * silently failing on every call. The actual `public.messages` schema uses
 * conversation_id / sender_type / sender_id / content / channel and is keyed
 * to a conversation thread, not standalone outbound. Logging is parked here
 * as a TODO until the conversation model is sorted in a follow-up session.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { to, message } = body as {
      to?: string;
      message?: string;
      contact_id?: string;
      template_id?: string;
    };

    if (!to || !message) {
      return NextResponse.json(
        { error: "to and message are required" },
        { status: 400 },
      );
    }

    const result = await sendSms({ to, text: message });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error || "Failed to send SMS" },
        { status: 500 },
      );
    }

    // TODO: log to messages table once the conversation model is finalized.
    // Previous logging was broken (wrong columns) — see file header.

    return NextResponse.json({ success: true, message_id: result.messageId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    console.error("SMS send error:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
