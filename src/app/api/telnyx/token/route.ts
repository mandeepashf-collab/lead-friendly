import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
    );

    // Verify authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sipUsername = process.env.TELNYX_SIP_USERNAME;
    const sipPassword = process.env.TELNYX_SIP_PASSWORD;
    const connectionId = process.env.TELNYX_SIP_CONNECTION_ID;

    if (!sipUsername || !sipPassword) {
      return NextResponse.json({
        error: "SIP credentials not configured. Add TELNYX_SIP_USERNAME and TELNYX_SIP_PASSWORD to Vercel env vars.",
      }, { status: 500 });
    }

    // Try to generate a Telnyx telephony credential token
    if (connectionId && process.env.TELNYX_API_KEY) {
      try {
        const response = await fetch("https://api.telnyx.com/v2/telephony_credentials", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.TELNYX_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            connection_id: connectionId,
            name: `webrtc-${user.id.substring(0, 8)}`,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const credId = data?.data?.id;

          if (credId) {
            // Now generate a token from the credential
            const tokenRes = await fetch(
              `https://api.telnyx.com/v2/telephony_credentials/${credId}/token`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${process.env.TELNYX_API_KEY}`,
                  "Content-Type": "application/json",
                },
              }
            );

            if (tokenRes.ok) {
              const tokenText = await tokenRes.text();
              if (tokenText) {
                return NextResponse.json({ login_token: tokenText, method: "token" });
              }
            }
          }
        }
      } catch (err) {
        console.warn("Token generation failed, falling back to credential auth:", err);
      }
    }

    // Fallback to credential auth
    return NextResponse.json({
      login: sipUsername,
      password: sipPassword,
      method: "credential",
    });
  } catch (err) {
    console.error("Telnyx token error:", err);
    // Fallback to credential auth
    return NextResponse.json({
      login: process.env.TELNYX_SIP_USERNAME,
      password: process.env.TELNYX_SIP_PASSWORD,
      method: "credential",
    });
  }
}
