import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { to, message, contact_id, template_id } = body as {
      to: string;
      message: string;
      contact_id?: string;
      template_id?: string;
    };

    if (!to || !message) {
      return NextResponse.json({ error: "to and message are required" }, { status: 400 });
    }

    const apiKey = process.env.TELNYX_API_KEY;
    const fromNumber = process.env.TELNYX_PHONE_NUMBER;

    if (!apiKey || !fromNumber) {
      return NextResponse.json({ error: "Telnyx credentials not configured" }, { status: 500 });
    }

    // Send SMS via Telnyx
    const telnyxRes = await fetch("https://api.telnyx.com/v2/messages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromNumber,
        to,
        text: message,
        messaging_profile_id: process.env.TELNYX_MESSAGING_PROFILE_ID,
      }),
    });

    const telnyxData = await telnyxRes.json();

    if (!telnyxRes.ok) {
      console.error("Telnyx error:", telnyxData);
      return NextResponse.json({ error: telnyxData?.errors?.[0]?.detail || "Failed to send SMS" }, { status: 500 });
    }

    const messageId = telnyxData?.data?.id;

    // Log message to Supabase
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          },
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();

    await supabase.from("messages").insert({
      contact_id: contact_id || null,
      user_id: user?.id || null,
      direction: "outbound",
      channel: "sms",
      body: message,
      status: "sent",
      template_id: template_id || null,
      external_id: messageId,
    });

    return NextResponse.json({ success: true, message_id: messageId });
  } catch (err: any) {
    console.error("SMS send error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
