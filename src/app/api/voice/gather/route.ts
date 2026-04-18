import { NextRequest, NextResponse } from "next/server";

/**
 * Legacy endpoint — kept alive so Telnyx webhooks configured against
 * /api/voice/gather don't 404. All voice events are now handled in a
 * single webhook at /api/voice/answer. This route just forwards.
 *
 * Action item: in the Telnyx portal, set the Voice Application webhook
 * to https://www.leadfriendly.com/api/voice/answer (without /gather).
 */
export async function POST(req: NextRequest) {
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://www.leadfriendly.com";
  try {
    const body = await req.text();
    const res = await fetch(`${APP_URL}/api/voice/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    const text = await res.text();
    return new NextResponse(text, { status: res.status });
  } catch (err) {
    console.error("gather->answer forward error:", err);
    return NextResponse.json({ received: true });
  }
}

export async function GET() {
  return new NextResponse("OK", { status: 200 });
}
