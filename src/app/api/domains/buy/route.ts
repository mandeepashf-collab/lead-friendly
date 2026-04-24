import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Our markup in dollars per year (same as in search route)
const MARKUP = 8;

// POST /api/domains/buy
// Body: { domain: string }
// Purchases a domain via Vercel, auto-connects it to the project, saves to DB.
// NOTE: This charges the Vercel account's payment method directly.
// TODO: Add Stripe payment BEFORE calling Vercel buy API so that:
//   1. Customer is charged our marked-up price via their saved Stripe payment method
//   2. On Stripe success → call Vercel to buy at wholesale price
//   3. Profit = customer payment - Vercel cost
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Stage 3.2.1 safety gate — until Stripe customer-charging is wired, this
  // endpoint would charge the Vercel account's saved payment method directly.
  // Set DOMAIN_PURCHASE_ENABLED=true ONLY after Stripe-Connect / metered
  // billing is confirmed working, otherwise customers can buy domains for
  // free and we eat the wholesale cost.
  if (process.env.DOMAIN_PURCHASE_ENABLED !== "true") {
    return NextResponse.json(
      {
        error: "domain_purchase_disabled",
        message:
          "Domain purchase is temporarily disabled while we finalize billing. You can still connect a domain you already own using the Connect tab.",
      },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const { domain } = body as { domain?: string };

  if (!domain || typeof domain !== "string") {
    return NextResponse.json({ error: "Domain is required" }, { status: 400 });
  }

  // Basic domain format check
  const domainRegex =
    /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;
  if (!domainRegex.test(domain.toLowerCase())) {
    return NextResponse.json({ error: "Invalid domain name" }, { status: 400 });
  }

  const token = process.env.VERCEL_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;

  if (!token || !projectId) {
    return NextResponse.json({ error: "Server config missing" }, { status: 500 });
  }

  // ── Step 1: Verify domain is still available (v1 registrar API) ─
  const statusRes = await fetch(
    `https://api.vercel.com/v1/registrar/domains/${domain}/availability`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const statusData = (await statusRes.json()) as { available?: boolean };

  if (!statusData.available) {
    return NextResponse.json(
      { error: "Domain is no longer available — it may have just been registered." },
      { status: 409 }
    );
  }

  // ── Step 2: Get current wholesale price for billing records ───
  const priceRes = await fetch(
    `https://api.vercel.com/v1/registrar/domains/${domain}/price`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const priceData = (await priceRes.json()) as {
    price?: number;
    period?: number;
  };

  const wholesalePriceCents = Math.round((priceData.price ?? 0) * 100);
  const sellPriceCents = Math.round(
    (Math.ceil(priceData.price ?? 0) + MARKUP) * 100
  );

  // ── Step 3: Purchase the domain via Vercel ────────────────────
  // This charges the Vercel account's payment method (your card).
  // TODO: Collect payment from customer via Stripe BEFORE this step.
  // v1 registrar API — POST /v1/registrar/domains/{domain}/buy
  const buyRes = await fetch(`https://api.vercel.com/v1/registrar/domains/${domain}/buy`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });

  if (!buyRes.ok) {
    const err = (await buyRes.json()) as { error?: { message?: string } };
    console.error("[domains/buy] Vercel purchase failed:", err);
    return NextResponse.json(
      { error: err.error?.message || "Failed to purchase domain. Please try again." },
      { status: 502 }
    );
  }

  // ── Step 4: Auto-connect app.{domain} to our Vercel project ──
  // Since we own the domain (bought via our Vercel account), DNS is
  // auto-configured — customer needs zero DNS setup.
  const subdomain = `app.${domain}`;

  const addRes = await fetch(
    `https://api.vercel.com/v10/projects/${projectId}/domains`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: subdomain }),
    }
  );

  if (!addRes.ok) {
    console.warn(
      "[domains/buy] Vercel project domain add failed (purchase succeeded):",
      await addRes.text()
    );
    // Non-fatal — domain is purchased, can be added manually
  }

  // ── Step 5: Save to custom_domains — pre-verified (we own DNS) ─
  const { data: domainRecord, error: dbError } = await supabase
    .from("custom_domains")
    .insert({
      agency_id: user.id,
      user_id: user.id,
      domain: subdomain,
      verification_token: "purchased-via-platform",
      status: "active",
      txt_verified: true,
      cname_verified: true,
      ssl_status: "provisioning",
      verified_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (dbError) {
    console.error("[domains/buy] DB insert error:", dbError);
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  // ── Step 6: Record purchase for billing / reconciliation ────────
  await supabase.from("domain_purchases").insert({
    user_id: user.id,
    domain,
    subdomain_connected: subdomain,
    purchase_price_cents: wholesalePriceCents,
    sell_price_cents: sellPriceCents,
    purchased_at: new Date().toISOString(),
    renewal_date: new Date(
      Date.now() + (priceData.period ?? 1) * 365 * 24 * 60 * 60 * 1000
    ).toISOString(),
    auto_renew: true,
    status: "active",
  });

  return NextResponse.json({
    success: true,
    domain,
    connected_as: subdomain,
    domain_record: domainRecord,
    message: `${domain} purchased and connected! Your white-label platform is live at https://${subdomain}`,
    ssl_note: "SSL is being provisioned automatically — usually ready within 1–2 minutes.",
  });
}
