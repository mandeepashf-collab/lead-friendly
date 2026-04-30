import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { applyContactedOnFirstCall } from "@/lib/contacts/auto-status";

/**
 * POST /api/webrtc/call-complete
 *
 * Called by the agent worker when a WebRTC call ends.
 * Receives the full transcript, generates an AI summary with Claude Haiku,
 * and persists everything to the call record.
 *
 * Body:
 *  {
 *    callRecordId: string,
 *    transcript: { role: "user"|"assistant", text: string, ts: number }[],
 *    outcome?: string,       // "appointment_booked", "not_interested", "callback", etc.
 *    duration?: number,       // seconds
 *    endReason?: string,      // "user_hangup", "agent_ended", "max_duration", etc.
 *  }
 */

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export async function POST(req: NextRequest) {
  try {
    // ── Auth: verify service key (server-to-server from agent worker) ──
    const serviceKey = req.headers.get("x-service-key");
    if (!serviceKey || serviceKey !== process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Validate request ─────────────────────────────────────────
    const body = await req.json();
    const {
      callRecordId,
      transcript,
      outcome,
      duration,
      endReason,
    } = body as {
      callRecordId: string;
      transcript: { role: string; text: string; ts: number }[];
      outcome?: string;
      duration?: number;
      endReason?: string;
    };

    if (!callRecordId) {
      return NextResponse.json(
        { error: "callRecordId is required" },
        { status: 400 },
      );
    }

    console.log(
      `[webrtc/call-complete] processing call=${callRecordId} turns=${transcript?.length ?? 0} outcome=${outcome ?? "unknown"}`,
    );

    // ── Verify call record exists ────────────────────────────────
    const { data: callRecord, error: fetchErr } = await supabaseAdmin
      .from("calls")
      .select("id, ai_agent_id, organization_id, status, contact_id")
      .eq("id", callRecordId)
      .single();

    if (fetchErr || !callRecord) {
      console.error("[webrtc/call-complete] call not found:", fetchErr?.message);
      return NextResponse.json(
        { error: "Call record not found" },
        { status: 404 },
      );
    }

    // ── Format transcript for storage ────────────────────────────
    const transcriptText = (transcript ?? [])
      .map((t) => `${t.role === "user" ? "Customer" : "Agent"}: ${t.text}`)
      .join("\n");

    // ── Generate AI call summary ─────────────────────────────────
    let callSummary = "";
    let sentiment = "neutral";

    if (transcript && transcript.length > 0) {
      try {
        const summaryResponse = await anthropic.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 500,
          messages: [
            {
              role: "user",
              content: `Analyze this voice call transcript between an AI agent and a customer. Return a JSON object with these exact fields:

{
  "summary": "2-3 sentence summary of what happened in the call",
  "sentiment": "positive" | "negative" | "neutral",
  "outcome_label": "brief label like 'Appointment Booked', 'Not Interested', 'Callback Requested', 'Voicemail', 'Hung Up', 'Completed'",
  "key_points": ["list", "of", "important", "details", "from", "the", "call"],
  "lead_quality": "hot" | "warm" | "cold"
}

TRANSCRIPT:
${transcriptText}

Return ONLY valid JSON, no markdown or extra text.`,
            },
          ],
        });

        const rawText =
          summaryResponse.content[0]?.type === "text"
            ? summaryResponse.content[0].text
            : "";
        const cleaned = rawText
          .replace(/```json\n?/g, "")
          .replace(/```\n?/g, "")
          .trim();

        try {
          const parsed = JSON.parse(cleaned);
          callSummary = parsed.summary || "";
          sentiment = parsed.sentiment || "neutral";

          // Store the full analysis as notes
          const notes = [
            parsed.summary,
            "",
            `Outcome: ${parsed.outcome_label ?? outcome ?? "Unknown"}`,
            `Sentiment: ${parsed.sentiment ?? "neutral"}`,
            `Lead Quality: ${parsed.lead_quality ?? "unknown"}`,
            "",
            "Key Points:",
            ...(parsed.key_points ?? []).map((p: string) => `• ${p}`),
          ].join("\n");

          // Update with full analysis
          await supabaseAdmin
            .from("calls")
            .update({
              call_summary: callSummary,
              sentiment,
              transcript: transcriptText,
              outcome: outcome ?? parsed.outcome_label ?? null,
              notes,
              status: "completed",
              ended_at: new Date().toISOString(),
              ...(duration ? { duration_seconds: Math.round(duration) } : {}),
            })
            .eq("id", callRecordId);

          console.log(
            `[webrtc/call-complete] ✓ call=${callRecordId} summary saved, sentiment=${sentiment}`,
          );

          // Auto-status: upgrade contact 'new' → 'contacted'. Best-effort.
          // Phase 3b: 'system' kind — internal completion call, not an
          // external webhook.
          await applyContactedOnFirstCall(
            supabaseAdmin,
            callRecord.contact_id,
            "system",
          );

          return NextResponse.json({
            success: true,
            callRecordId,
            summary: callSummary,
            sentiment,
          });
        } catch (parseErr) {
          console.warn(
            "[webrtc/call-complete] failed to parse AI summary JSON, saving raw:",
            parseErr,
          );
          callSummary = cleaned;
        }
      } catch (aiErr) {
        console.error("[webrtc/call-complete] AI summary generation failed:", aiErr);
        // Continue — we'll still save what we have
      }
    }

    // ── Fallback: save transcript and basic info without AI summary ─
    await supabaseAdmin
      .from("calls")
      .update({
        transcript: transcriptText || null,
        call_summary: callSummary || null,
        sentiment: sentiment || null,
        outcome: outcome ?? null,
        status: "completed",
        ended_at: new Date().toISOString(),
        ...(duration ? { duration_seconds: Math.round(duration) } : {}),
      })
      .eq("id", callRecordId);

    console.log(
      `[webrtc/call-complete] ✓ call=${callRecordId} saved (fallback path)`,
    );

    // Auto-status: upgrade contact 'new' → 'contacted'. Best-effort.
    // Phase 3b: 'system' kind — internal completion call.
    await applyContactedOnFirstCall(
      supabaseAdmin,
      callRecord.contact_id,
      "system",
    );

    return NextResponse.json({
      success: true,
      callRecordId,
      summary: callSummary,
      sentiment,
    });
  } catch (err) {
    console.error("[webrtc/call-complete] unhandled error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
