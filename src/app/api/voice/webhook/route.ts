import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Record<string, unknown>;

    // Detect provider from headers
    const isRetell = req.headers.get("x-retell-signature") !== null;
    const isTelnyx = req.headers.get("telnyx-signature-ed25519") !== null;

    if (isRetell) {
      await handleRetellWebhook(body);
    } else if (isTelnyx) {
      await handleTelnyxWebhook(body);
    } else {
      // Accept both — try to detect from payload shape
      if (body.event && (body.event as string).includes("call_")) {
        await handleRetellWebhook(body);
      } else if (body.data) {
        await handleTelnyxWebhook(body);
      }
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Voice webhook error:", err);
    // Always return 200 to prevent retries flooding
    return NextResponse.json({ received: true, error: String(err) });
  }
}

async function handleRetellWebhook(body: Record<string, unknown>) {
  const supabase = getSupabase();
  const event = body.event as string;
  const callData = body.data as Record<string, unknown>;
  const callId = callData?.call_id as string;

  if (!callId) return;

  switch (event) {
    case "call_started":
      await supabase.from("calls")
        .update({ status: "in_progress" })
        .eq("external_call_id", callId);
      break;

    case "call_ended": {
      const durationSecs = callData?.duration_ms
        ? Math.round((callData.duration_ms as number) / 1000)
        : 0;
      const transcript = callData?.transcript as string | null;
      const summary = callData?.call_analysis
        ? (callData.call_analysis as Record<string, unknown>).call_summary as string
        : null;
      const sentiment = callData?.call_analysis
        ? (callData.call_analysis as Record<string, unknown>).user_sentiment as string
        : null;

      await supabase.from("calls")
        .update({
          status: "completed",
          duration_seconds: durationSecs,
          transcript,
          call_summary: summary,
          sentiment,
          recording_url: callData?.recording_url as string | null,
        })
        .eq("external_call_id", callId);

      // Check for DNC keywords
      if (transcript) {
        const dncPhrases = ["stop calling", "don't call", "do not call", "remove me", "take me off"];
        const isDNC = dncPhrases.some(p => transcript.toLowerCase().includes(p));
        if (isDNC) {
          const { data: call } = await supabase.from("calls")
            .select("contact_id").eq("external_call_id", callId).single();
          if (call?.contact_id) {
            await supabase.from("contacts")
              .update({ call_status: "dnc", status: "lost" })
              .eq("id", call.contact_id);
          }
        }
      }

      // Update contact call_status back to normal
      const { data: call } = await supabase.from("calls")
        .select("contact_id").eq("external_call_id", callId).single();
      if (call?.contact_id) {
        await supabase.from("contacts")
          .update({ call_status: "called" })
          .eq("id", call.contact_id);
      }
      break;
    }

    case "call_analyzed": {
      const analysis = callData?.call_analysis as Record<string, unknown>;
      if (analysis) {
        await supabase.from("calls").update({
          call_summary: analysis.call_summary as string,
          sentiment: analysis.user_sentiment as string,
        }).eq("external_call_id", callId);
      }
      break;
    }
  }
}

async function handleTelnyxWebhook(body: Record<string, unknown>) {
  const supabase = getSupabase();
  const data = body.data as Record<string, unknown>;
  const eventType = data?.event_type as string;
  const payload = data?.payload as Record<string, unknown>;
  const callLegId = payload?.call_leg_id as string;

  if (!callLegId) return;

  switch (eventType) {
    case "call.initiated":
      await supabase.from("calls")
        .update({ status: "ringing" })
        .eq("external_call_id", callLegId);
      break;

    case "call.answered":
      await supabase.from("calls")
        .update({ status: "in_progress" })
        .eq("external_call_id", callLegId);
      break;

    case "call.hangup": {
      const durationMs = payload?.end_time && payload?.start_time
        ? new Date(payload.end_time as string).getTime() - new Date(payload.start_time as string).getTime()
        : 0;
      await supabase.from("calls")
        .update({
          status: "completed",
          duration_seconds: Math.round(durationMs / 1000),
        })
        .eq("external_call_id", callLegId);

      const { data: call } = await supabase.from("calls")
        .select("contact_id").eq("external_call_id", callLegId).single();
      if (call?.contact_id) {
        await supabase.from("contacts")
          .update({ call_status: "called" })
          .eq("id", call.contact_id);
      }
      break;
    }

    case "call.recording.saved":
      await supabase.from("calls")
        .update({ recording_url: (payload?.recording as Record<string, unknown>)?.url as string })
        .eq("external_call_id", callLegId);
      break;
  }
}
