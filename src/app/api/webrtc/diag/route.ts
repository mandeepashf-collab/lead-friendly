/**
 * GET /api/webrtc/diag
 *
 * Diagnostic endpoint for LiveKit agent dispatch troubleshooting.
 *
 * Returns:
 *  - Whether required env vars are present
 *  - A short fingerprint of the API key (first/last 3 chars) so Vercel's
 *    LIVEKIT_API_KEY can be eyeballed against Railway's without exposing
 *    the secret
 *  - A live ping to LiveKit Cloud: can we list rooms using the configured creds?
 *  - If ?dispatch=1, also tries AgentDispatchClient.createDispatch() to a
 *    throwaway room name and reports the result.
 *
 * Requires an authenticated user (must be signed in).
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import {
  getAgentDispatchClient,
  getRoomService,
  getLiveKitUrl,
} from "@/lib/livekit/server";

export async function GET(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────
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

  const lkUrl = process.env.LIVEKIT_URL ?? "";
  const lkKey = process.env.LIVEKIT_API_KEY ?? "";
  const lkSecret = process.env.LIVEKIT_API_SECRET ?? "";

  const fingerprint = (s: string) => {
    if (!s) return "(missing)";
    if (s.length < 8) return "(too short)";
    return `${s.slice(0, 3)}...${s.slice(-3)} (len=${s.length})`;
  };

  const env = {
    LIVEKIT_URL: lkUrl || "(missing)",
    LIVEKIT_API_KEY_fingerprint: fingerprint(lkKey),
    LIVEKIT_API_SECRET_fingerprint: fingerprint(lkSecret),
    serverUrlFromHelper: getLiveKitUrl(),
  };

  // ── Live ping: list rooms ─────────────────────────────────
  let listRoomsResult: { ok: boolean; count?: number; error?: string };
  try {
    const svc = getRoomService();
    const rooms = await svc.listRooms();
    listRoomsResult = { ok: true, count: rooms.length };
  } catch (e) {
    listRoomsResult = {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  // ── Optional: test dispatch ───────────────────────────────
  let dispatchResult: { tried: boolean; ok?: boolean; error?: string } = {
    tried: false,
  };

  const url = new URL(req.url);
  if (url.searchParams.get("dispatch") === "1") {
    dispatchResult.tried = true;
    const testRoomName = `diag_${Date.now()}`;
    try {
      // Create the throwaway room first
      const svc = getRoomService();
      await svc.createRoom({ name: testRoomName, emptyTimeout: 60 });
      try {
        const client = getAgentDispatchClient();
        await client.createDispatch(testRoomName, "lead-friendly", {
          metadata: JSON.stringify({ diag: true }),
        });
        dispatchResult.ok = true;
      } finally {
        // Best-effort cleanup
        try {
          await svc.deleteRoom(testRoomName);
        } catch {
          /* ignore */
        }
      }
    } catch (e) {
      dispatchResult.ok = false;
      dispatchResult.error = e instanceof Error ? e.message : String(e);
    }
  }

  return NextResponse.json({
    ok: true,
    env,
    listRooms: listRoomsResult,
    dispatch: dispatchResult,
    hint: [
      "Compare LIVEKIT_API_KEY_fingerprint on Vercel vs what you set on Railway.",
      "If fingerprints differ, the worker and dispatcher are on different LiveKit projects.",
      "Append ?dispatch=1 to actually attempt AgentDispatchClient.createDispatch.",
      "If listRooms.ok is false, creds are bad for this LIVEKIT_URL.",
    ],
  });
}
