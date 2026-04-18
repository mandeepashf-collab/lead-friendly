import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/agents/test-call
 *
 * Fires an outbound Telnyx call to the user's own phone to preview the
 * draft agent they're editing. The agent does NOT need to be saved to the
 * DB — we embed the draft greeting + system_prompt directly into
 * client_state so the voice webhook can pick it up without a DB lookup.
 *
 * Body: { phoneNumber, greeting, systemPrompt, voiceId }
 * Returns: { callControlId } on success
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    phoneNumber?: string;
    greeting?: string;
    systemPrompt?: string;
    voiceId?: string;
  } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { phoneNumber, greeting, systemPrompt, voiceId } = body;
  if (!phoneNumber || !greeting || !systemPrompt) {
    return NextResponse.json(
      { error: "phoneNumber, greeting, and systemPrompt required" },
      { status: 400 },
    );
  }

  if (!process.env.TELNYX_API_KEY || !process.env.TELNYX_APP_ID) {
    return NextResponse.json(
      { error: "Server misconfigured: missing Telnyx credentials" },
      { status: 500 },
    );
  }

  // Resolve organization + a from-number to dial from
  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();
  if (!profile?.organization_id) {
    return NextResponse.json({ error: "Organization not found" }, { status: 400 });
  }

  // Pick the first active phone number from the org's pool
  const { data: fromRow } = await supabase
    .from("phone_numbers")
    .select("number")
    .eq("organization_id", profile.organization_id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  const fromNumber = (fromRow as { number?: string } | null)?.number;
  if (!fromNumber) {
    return NextResponse.json(
      { error: "No active phone number in your pool. Add one in Phone Numbers first." },
      { status: 400 },
    );
  }

  const toNumber = phoneNumber.startsWith("+")
    ? phoneNumber
    : `+1${phoneNumber.replace(/\D/g, "")}`;

  // Log a call record so the call shows up in Call History
  const { data: callRecord } = await supabase
    .from("calls")
    .insert({
      organization_id: profile.organization_id,
      direction: "outbound",
      status: "initiated",
      from_number: fromNumber,
      to_number: toNumber,
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  // Embed the DRAFT agent directly in client_state.
  // The voice webhook will see `draftGreeting` / `draftSystemPrompt` and
  // prefer them over any DB agent lookup.
  const clientState = Buffer.from(
    JSON.stringify({
      callRecordId: callRecord?.id ?? null,
      agentId: null,
      organizationId: profile.organization_id,
      conversationHistory: [],
      turnCount: 0,
      draftGreeting: greeting,
      draftSystemPrompt: systemPrompt,
      draftVoiceId: voiceId || null,
      isTestCall: true,
    }),
  ).toString("base64");

  const webhookUrl = process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL}/api/voice/answer`
    : "https://www.leadfriendly.com/api/voice/answer";

  const telnyxRes = await fetch("https://api.telnyx.com/v2/calls", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.TELNYX_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      connection_id: process.env.TELNYX_APP_ID,
      to: toNumber,
      from: fromNumber,
      webhook_url: webhookUrl,
      webhook_url_method: "POST",
      client_state: clientState,
    }),
  });

  const telnyxText = await telnyxRes.text();
  if (!telnyxRes.ok) {
    if (callRecord?.id) {
      await supabase.from("calls").update({ status: "failed" }).eq("id", callRecord.id);
    }
    return NextResponse.json(
      { error: "Telnyx call failed", details: telnyxText.slice(0, 300) },
      { status: 500 },
    );
  }

  let telnyxData: { data?: { call_control_id?: string } } = {};
  try {
    telnyxData = JSON.parse(telnyxText);
  } catch { /* ignore */ }

  return NextResponse.json({
    callControlId: telnyxData.data?.call_control_id ?? null,
    callRecordId: callRecord?.id ?? null,
    status: "ringing",
  });
}
