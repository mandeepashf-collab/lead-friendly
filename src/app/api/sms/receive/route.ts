import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Telnyx webhook for inbound SMS
export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();

    // Telnyx wraps events in { data: { event_type, payload } }
    const eventType = payload?.data?.event_type;
    if (eventType !== "message.received") {
      return NextResponse.json({ received: true });
    }

    const msg = payload?.data?.payload;
    const from: string = msg?.from?.phone_number || "";
    const to: string = msg?.to?.[0]?.phone_number || "";
    const text: string = msg?.text || "";
    const messageId: string = msg?.id || "";

    if (!from || !text) {
      return NextResponse.json({ received: true });
    }

    // Use service role to write without auth context
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Try to match sender phone to a contact
    const normalized = from.replace(/\D/g, "");
    const { data: contacts } = await supabase
      .from("contacts")
      .select("id")
      .or(`phone.eq.${from},phone.eq.+${normalized},phone.eq.${normalized}`)
      .limit(1);

    const contact_id = contacts?.[0]?.id || null;

    // Log inbound message
    await supabase.from("messages").insert({
      contact_id,
      direction: "inbound",
      channel: "sms",
      body: text,
      status: "received",
      external_id: messageId,
    });

    // If message comes from a known contact, create/update conversation
    if (contact_id) {
      const { data: existingConv } = await supabase
        .from("conversations")
        .select("id")
        .eq("contact_id", contact_id)
        .eq("channel", "sms")
        .limit(1);

      if (existingConv && existingConv.length > 0) {
        await supabase
          .from("conversations")
          .update({ last_message: text, last_message_at: new Date().toISOString(), unread_count: supabase.rpc("increment", { x: 1 }) as any })
          .eq("id", existingConv[0].id);
      } else {
        await supabase.from("conversations").insert({
          contact_id,
          channel: "sms",
          last_message: text,
          last_message_at: new Date().toISOString(),
          unread_count: 1,
        });
      }
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error("SMS receive webhook error:", err);
    // Always return 200 to Telnyx so it doesn't retry
    return NextResponse.json({ received: true });
  }
}
