import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/stripe/checkout
 *
 * Creates a Stripe Checkout Session for a subscription and returns the URL.
 * The browser redirects to that URL. When the user completes checkout Stripe
 * sends a webhook to /api/stripe/webhook which flips the org's subscription_status.
 *
 * Body: { priceId: string }   // Stripe Price ID (one of our plan tiers)
 *
 * This endpoint requires the user to be signed in — we use their org to
 * deduplicate Stripe customers (one per org) via the stripe_customer_id
 * column on the organizations table.
 */
export async function POST(req: NextRequest) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { error: "Stripe is not configured — set STRIPE_SECRET_KEY in env vars" },
      { status: 500 }
    );
  }

  let body: { priceId?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { priceId } = body;
  if (!priceId) {
    return NextResponse.json({ error: "priceId required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single();
  if (!profile?.organization_id) {
    return NextResponse.json({ error: "No organization" }, { status: 400 });
  }

  const { data: org } = await supabase
    .from("organizations")
    .select("id, name, stripe_customer_id")
    .eq("id", profile.organization_id)
    .single();
  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  // Pin to the API version that ships with the installed SDK so types line up.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2026-03-25.dahlia" as any });

  // Reuse or create the Stripe customer for this org
  let customerId = org.stripe_customer_id as string | null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email || undefined,
      name: org.name || undefined,
      metadata: { organization_id: org.id },
    });
    customerId = customer.id;
    await supabase
      .from("organizations")
      .update({ stripe_customer_id: customerId })
      .eq("id", org.id);
  }

  const origin =
    req.headers.get("origin") ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://www.leadfriendly.com";

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    allow_promotion_codes: true,
    success_url: `${origin}/billing?stripe=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/billing?stripe=cancel`,
    subscription_data: {
      metadata: {
        organization_id: org.id,
        user_id: user.id,
      },
    },
    metadata: {
      organization_id: org.id,
      user_id: user.id,
    },
  });

  return NextResponse.json({ url: session.url, sessionId: session.id });
}
