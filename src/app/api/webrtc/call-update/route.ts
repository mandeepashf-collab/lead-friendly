import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/webrtc/call-update
 *
 * Server-to-server endpoint called by the agent worker to update call records.
 * Authenticates via x-service-key header (Supabase service role key).
 *
 * Body:
 *  {
 *    callRecordId: string,
 *    status?: string,
 *    outcome?: string,
 *    notes?: string,
 *    duration_seconds?: number,
 *    sentiment?: string,
 *  }
 */

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

export async function POST(req: NextRequest) {
  try {
    // Auth: verify service key
    const serviceKey = req.headers.get("x-service-key");
    if (!serviceKey || serviceKey !== process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { callRecordId, ...updates } = body as {
      callRecordId: string;
      status?: string;
      outcome?: string;
      notes?: string;
      duration_seconds?: number;
      sentiment?: string;
    };

    if (!callRecordId) {
      return NextResponse.json(
        { error: "callRecordId is required" },
        { status: 400 },
      );
    }

    // Filter to allowed fields
    const allowed = ["status", "outcome", "notes", "duration_seconds", "sentiment", "ended_at"];
    const safeUpdates = Object.fromEntries(
      Object.entries(updates).filter(([k]) => allowed.includes(k)),
    );

    if (Object.keys(safeUpdates).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 },
      );
    }

    const { error } = await supabaseAdmin
      .from("calls")
      .update(safeUpdates)
      .eq("id", callRecordId);

    if (error) {
      console.error("[webrtc/call-update] DB error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[webrtc/call-update] unhandled error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
