import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/calls/[id]/notes
 *
 * Append a note to a call record. Called by the AI agent worker
 * when the save_note tool is invoked during a live call.
 * Auth: x-service-key (Supabase service role key)
 *
 * Body: { note: string, category?: string }
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
    const { note, category } = body as {
      note: string;
      category?: string;
    };

    if (!note) {
      return NextResponse.json({ error: "note is required" }, { status: 400 });
    }

    // Get current notes to append
    const { data: call } = await supabaseAdmin
      .from("calls")
      .select("notes")
      .eq("id", id)
      .single();

    const existingNotes = (call?.notes as string) || "";
    const timestamp = new Date().toLocaleTimeString("en-US", { hour12: true });
    const prefix = category && category !== "general" ? `[${category}] ` : "";
    const newNote = `${prefix}${timestamp}: ${note}`;
    const updatedNotes = existingNotes
      ? `${existingNotes}\n${newNote}`
      : newNote;

    const { error } = await supabaseAdmin
      .from("calls")
      .update({ notes: updatedNotes })
      .eq("id", id);

    if (error) {
      console.error("[calls/notes] DB error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log(`[calls/notes] call=${id} note appended: ${note.slice(0, 60)}...`);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[calls/notes] unhandled error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
