import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
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
    // Auth check
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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
