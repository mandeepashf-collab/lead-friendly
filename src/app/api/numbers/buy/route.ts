import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();
    if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

    const { phone_number, friendly_name } = await request.json();
    if (!phone_number) return NextResponse.json({ error: "phone_number required" }, { status: 400 });

    const db = getServiceSupabase();

    // Check user doesn't already own this number
    const { data: existing } = await db
      .from("phone_numbers")
      .select("id")
      .eq("number", phone_number)
      .eq("organization_id", profile.organization_id)
      .eq("status", "active")
      .single();

    if (existing) {
      return NextResponse.json({ error: "You already own this number" }, { status: 409 });
    }

    // Step 1: Purchase the number on Telnyx
    const orderResponse = await fetch("https://api.telnyx.com/v2/number_orders", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.TELNYX_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        phone_numbers: [{ phone_number }],
        connection_id: process.env.TELNYX_APP_ID,
      }),
    });

    if (!orderResponse.ok) {
      const err = await orderResponse.text();
      console.error("Telnyx buy error:", orderResponse.status, err);
      try {
        const errData = JSON.parse(err);
        const msg = errData.errors?.[0]?.detail || "Failed to purchase number";
        return NextResponse.json({ error: msg }, { status: 500 });
      } catch {
        return NextResponse.json({ error: "Failed to purchase number" }, { status: 500 });
      }
    }

    const orderData = await orderResponse.json();
    const orderedNumber = orderData.data?.phone_numbers?.[0];
    const telnyxNumberId = orderedNumber?.id || null;

    // Step 2: Store in Supabase (using actual table column names)
    const { data: savedNumber, error: dbError } = await db
      .from("phone_numbers")
      .insert({
        organization_id: profile.organization_id,
        number: phone_number,
        friendly_name: friendly_name || formatNumber(phone_number),
        twilio_sid: telnyxNumberId,
        type: "local",
        status: "active",
        daily_cap: 50,
        daily_used: 0,
        area_code: phone_number.length >= 12 ? phone_number.slice(2, 5) : null,
      })
      .select()
      .single();

    if (dbError) {
      console.error("DB save error:", dbError);
      return NextResponse.json(
        { error: "Number purchased but failed to save — contact support", detail: dbError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      number: {
        ...savedNumber,
        vanity_format: formatNumber(phone_number),
      },
    });
  } catch (err) {
    console.error("Buy error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Purchase failed" }, { status: 500 });
  }
}

function formatNumber(e164: string): string {
  const digits = e164.replace(/\D/g, "");
  if (digits.length === 11 && digits[0] === "1") {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return e164;
}
