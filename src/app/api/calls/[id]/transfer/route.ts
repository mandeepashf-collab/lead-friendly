import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/calls/[id]/transfer
 *
 * Notifies the system that a call should be transferred.
 * Called by the AI agent worker when it decides to transfer to a human.
 * Auth: x-service-key (Supabase service role key)
 *
 * Body: { reason: string, transfer_number?: string }
 */

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    // Auth: verify service key
    const serviceKey = req.headers.get("x-service-key");
    if (!serviceKey || serviceKey !== process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { reason, transfer_number } = body as {
      reason: string;
      transfer_number?: string;
    };

    // Update call record with transfer info
    const { error } = await supabaseAdmin
      .from("calls")
      .update({
        status: "transferred",
        outcome: "transferred",
        notes: `Transfer requested: ${reason}${transfer_number ? ` → ${transfer_number}` : ""}`,
      })
      .eq("id", id);

    if (error) {
      console.error("[calls/transfer] DB error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // TODO: In a full implementation, this would trigger a SIP REFER
    // or Telnyx transfer. For WebRTC test calls, we just record it.

    console.log(`[calls/transfer] call=${id} reason=${reason} number=${transfer_number ?? "none"}`);

    return NextResponse.json({ success: true, transferred: true });
  } catch (err) {
    console.error("[calls/transfer] unhandled error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
