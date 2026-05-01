import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { getTierByStripePriceId, type TierId, type BillingInterval } from "@/config/pricing";

/**
 * POST /api/stripe/checkout
 *
 * Creates a Stripe Checkout Session for a subscription and returns the URL.
 * The browser redirects to that URL. When the user completes checkout Stripe
 * sends a webhook to /api/stripe/webhook which:
 *   - Sets organizations.tier (from metadata)
 *   - Sets organizations.billing_interval (from metadata)
 *   - Seeds current_period_starts_at / ends_at via Phase 1.7 maybeRollPeriod
 *
 * Body: { priceId: string; tierId: TierId; interval: BillingInterval }
 *
 * Validates priceId against pricing.ts so unknown / spoofed price IDs
 * are rejected (defense-in-depth — Stripe Checkout would also reject,
 * but failing early gives a clean error).
 */
export async function POST(req: NextRequest) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { error: "Stripe is not configured — set STRIPE_SECRET_KEY in env vars" },
      { status: 500 }
    );
  }

  let body: { priceId?: string; tierId?: TierId; interval?: BillingInterval } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { priceId, tierId, interval } = body;
  if (!priceId) {
    return NextResponse.json({ error: "priceId required" }, { status: 400 });
  }

  // Validate priceId belongs to a known tier. Rejects spoofed price IDs
  // before they reach Stripe.
  const matched = getTierByStripePriceId(priceId);
  if (!matched) {
    return NextResponse.json(
      { error: "Unknown priceId — does not match any configured tier" },
      { status: 400 }
    );
  }

  // If client supplied tierId/interval, verify they agree with the priceId
  // mapping. Mismatch is a developer bug or a tampered request — reject.
  if (tierId && tierId !== matched.tier.id) {
    return NextResponse.json(
      { error: `tierId mismatch: priceId resolves to ${matched.tier.id}, got ${tierId}` },
      { status: 400 }
    );
  }
  if (interval && interval !== matched.interval) {
    return NextResponse.json(
      { error: `interval mismatch: priceId resolves to ${matched.interval}, got ${interval}` },
      { status: 400 }
    );
  }

  // Canonical values come from the priceId lookup, never from client input.
  const canonicalTierId = matched.tier.id;
  const canonicalInterval = matched.interval;

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

  // Metadata that flows into the webhook handlers. Both the session itself
  // and the resulting subscription get stamped — webhook reads from sub.metadata
  // since that's what fires on every renewal/update.
  const sharedMetadata = {
    organization_id: org.id,
    user_id: user.id,
    tier_id: canonicalTierId,
    billing_interval: canonicalInterval,
  };

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: org.id,
    line_items: [{ price: priceId, quantity: 1 }],
    allow_promotion_codes: true,
    payment_method_collection: "always",
    success_url: `${origin}/dashboard?subscription=success&tier=${canonicalTierId}&interval=${canonicalInterval}`,
    cancel_url: `${origin}/pricing?subscription=cancel`,
    subscription_data: {
      metadata: sharedMetadata,
    },
    metadata: sharedMetadata,
  });

  return NextResponse.json({ url: session.url, sessionId: session.id });
}
