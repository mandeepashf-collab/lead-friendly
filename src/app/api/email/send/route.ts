import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { to, subject, html, text, contact_id, template_id } = body as {
      to: string;
      subject: string;
      html?: string;
      text?: string;
      contact_id?: string;
      template_id?: string;
    };

    if (!to || !subject || (!html && !text)) {
      return NextResponse.json({ error: "to, subject, and html or text are required" }, { status: 400 });
    }

    const resendApiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.FROM_EMAIL || "noreply@leadfriendly.com";

    if (!resendApiKey) {
      console.warn("RESEND_API_KEY not configured — email not sent");
      // Still log the attempt so UI shows the message
    } else {
      // Send email via Resend
      const resendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromEmail,
          to,
          subject,
          html: html || `<p>${text}</p>`,
          text: text || "",
        }),
      });

      if (!resendRes.ok) {
        const err = await resendRes.json().catch(() => ({}));
        console.error("Resend error:", err);
        return NextResponse.json({ error: (err as any)?.message || "Failed to send email" }, { status: 500 });
      }
    }

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
      channel: "email",
      subject,
      body: text || html || "",
      status: resendApiKey ? "sent" : "pending_config",
      template_id: template_id || null,
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Email send error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
