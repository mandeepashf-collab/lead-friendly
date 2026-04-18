import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const state = searchParams.get("state") || "CO";
    const areaCode = searchParams.get("area_code") || "";
    const contains = searchParams.get("contains") || "";
    const limit = searchParams.get("limit") || "15";

    // Build Telnyx search URL
    let url = `https://api.telnyx.com/v2/available_phone_numbers?filter[country_code]=US&filter[features][]=voice&filter[features][]=sms&filter[limit]=${limit}`;

    if (areaCode) {
      url += `&filter[national_destination_code]=${areaCode}`;
    } else if (state) {
      url += `&filter[administrative_area]=${state}`;
    }

    if (contains) {
      url += `&filter[phone_number][contains]=${contains}`;
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${process.env.TELNYX_API_KEY}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("Telnyx search error:", response.status, err);
      return NextResponse.json({ error: "Failed to search numbers" }, { status: 500 });
    }

    const data = await response.json();

    const numbers = (data.data || []).map((n: Record<string, unknown>) => ({
      phone_number: n.phone_number,
      locality: n.locality || "",
      region: n.region || state,
      region_information: n.region_information || [],
      monthly_cost: 3.0,
      features: n.features || ["voice", "sms"],
      vanity_format: formatNumber(n.phone_number as string),
    }));

    return NextResponse.json({ numbers, total: numbers.length });
  } catch (err) {
    console.error("Search error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Search failed" }, { status: 500 });
  }
}

function formatNumber(e164: string): string {
  const digits = e164.replace(/\D/g, "");
  if (digits.length === 11 && digits[0] === "1") {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return e164;
}
