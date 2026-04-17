import { NextRequest, NextResponse } from "next/server";
import { createAccessToken } from "@/lib/livekit/server";

/**
 * POST /api/webrtc/token
 *
 * Refresh / mint a new LiveKit access token for an existing room.
 * Called by the browser client when the current token is near expiry.
 *
 * Body: { roomName: string, identity: string }
 * Returns: { accessToken: string }
 */
export async function POST(req: NextRequest) {
  try {
    const { roomName, identity } = (await req.json()) as {
      roomName: string;
      identity: string;
    };

    if (!roomName || !identity) {
      return NextResponse.json(
        { error: "roomName and identity are required" },
        { status: 400 },
      );
    }

    const accessToken = await createAccessToken({
      identity,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      ttlSeconds: 3600,
    });

    return NextResponse.json({ accessToken });
  } catch (err) {
    console.error("[webrtc/token] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Token generation failed" },
      { status: 500 },
    );
  }
}
