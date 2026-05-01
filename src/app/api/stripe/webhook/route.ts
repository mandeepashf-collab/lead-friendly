import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { getTierByStripePriceId, type TierId, type BillingInterval } from "@/config/pricing";

/**
 * POST /api/stripe/webhook
 *
 * Stripe webhook endpoint. Updates organization subscription status in response
 * to Stripe lifecycle events. Requires STRIPE_WEBHOOK_SECRET to verify signatures.
 *
 * Events handled:
 *   - checkout.session.completed           → new sub activated
 *   - customer.subscription.created        → sub created (redundant with checkout)
 *   - customer.subscription.updated        → plan change / payment status
 *   - customer.subscription.deleted        → cancellation at period end
 *   - invoice.payment_succeeded            → payment success (keep active)
 *   - invoice.payment_failed               → payment failure (mark past_due)
 *   - payment_intent.succeeded             → Phase 4.5 wallet auto-reload success
 *   - payment_intent.payment_failed        → Phase 4.5 wallet auto-reload failure
 *
 * The org row needs these columns:
 *   stripe_customer_id         text
 *   stripe_subscription_id     text
 *   subscription_status        text  (active | trialing | past_due | canceled | null)
 *   subscription_plan_id       text  (Stripe Price ID)
 *   subscription_current_period_end timestamptz
 *
 * Vercel delivers the raw body via req.text(); we hand it straight to Stripe.
 */

// Next.js 16 App Router: force runtime to nodejs so Buffer etc. are available.
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: "Stripe not configured" },
      { status: 500 }
    );
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const rawBody = await req.text();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2026-03-25.dahlia" as any });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("[STRIPE WEBHOOK] signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  console.log("[STRIPE WEBHOOK]", event.type, event.id);

  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  // Helper: find the org for a given customer ID. Only returns null if the
  // customer isn't linked to any org yet (e.g. test event from an unrelated
  // Stripe account).
  const orgIdForCustomer = async (customerId: string) => {
    const { data } = await supabase
      .from("organizations")
      .select("id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    return data?.id as string | undefined;
  };

  // Helper: in newer Stripe SDKs `current_period_end` lives on subscription
  // items, not on the subscription itself. Pull the earliest item end as the
  // subscription's effective end.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subPeriodEnd = (sub: any): string | null => {
    const items = sub?.items?.data || [];
    if (items.length === 0) return null;
    const ends: number[] = items
      .map((it: { current_period_end?: number }) => it.current_period_end)
      .filter((v: unknown): v is number => typeof v === "number");
    if (ends.length === 0) return null;
    return new Date(Math.min(...ends) * 1000).toISOString();
  };

  // Mirror of subPeriodEnd for current_period_start. Used to seed
  // current_period_starts_at in the new pricing/wallet schema (Phase 1.7).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subPeriodStart = (sub: any): string | null => {
    const items = sub?.items?.data || [];
    if (items.length === 0) return null;
    const starts: number[] = items
      .map((it: { current_period_start?: number }) => it.current_period_start)
      .filter((v: unknown): v is number => typeof v === "number");
    if (starts.length === 0) return null;
    return new Date(Math.min(...starts) * 1000).toISOString();
  };

  // Helper: call the reset_minute_period RPC. Idempotent on the DB side,
  // so safe to call from any subscription event that includes a period.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const maybeRollPeriod = async (
    orgId: string,
    sub: any,
    source: 'stripe_webhook' | 'initial_subscription',
  ): Promise<void> => {
    const periodStart = subPeriodStart(sub);
    const periodEnd = subPeriodEnd(sub);
    if (!periodStart || !periodEnd) return;

    const { error } = await supabase.rpc('reset_minute_period', {
      p_org_id: orgId,
      p_new_period_starts_at: periodStart,
      p_new_period_ends_at: periodEnd,
      p_source: source,
      p_stripe_subscription_id: sub.id ?? null,
    });
    if (error) {
      console.error(`[stripe webhook] reset_minute_period failed for org=${orgId}:`, error.message);
      // Don't throw -- legacy column update still happened, billing audit is non-blocking.
    }
  };

  // Phase 4: resolve tier_id + billing_interval from a subscription. Prefers
  // metadata stamped at checkout time; falls back to priceId lookup against
  // pricing.ts so we still get the right tier even if metadata is missing
  // (older subs created before Phase 4 wired metadata, manual Stripe Dashboard
  // creation, etc).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resolveTierFromSub = (sub: any): { tierId: TierId; interval: BillingInterval } | null => {
    const meta = sub?.metadata ?? {};
    const metaTier = meta.tier_id as TierId | undefined;
    const metaInterval = meta.billing_interval as BillingInterval | undefined;
    if (metaTier && metaInterval) {
      return { tierId: metaTier, interval: metaInterval };
    }

    const priceId = sub?.items?.data?.[0]?.price?.id as string | undefined;
    if (!priceId) return null;
    const matched = getTierByStripePriceId(priceId);
    if (!matched) return null;
    return { tierId: matched.tier.id, interval: matched.interval };
  };

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const orgId = (session.metadata?.organization_id as string | undefined)
          || (session.customer ? await orgIdForCustomer(session.customer as string) : undefined);
        if (!orgId) break;

        // Pull the subscription for plan + period info
        let subId: string | null = null;
        let priceId: string | null = null;
        let periodEnd: string | null = null;
        let status: string = "active";
        let tierResolution: { tierId: TierId; interval: BillingInterval } | null = null;
        if (session.subscription) {
          const sub = await stripe.subscriptions.retrieve(session.subscription as string);
          subId = sub.id;
          priceId = sub.items.data[0]?.price.id ?? null;
          periodEnd = subPeriodEnd(sub);
          status = sub.status;
          tierResolution = resolveTierFromSub(sub);
        }

        // Build the update object. Phase 4: also write tier + billing_interval
        // (the new pricing schema columns) when we can resolve them from the sub.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updatePayload: Record<string, any> = {
          stripe_customer_id: session.customer as string,
          stripe_subscription_id: subId,
          subscription_status: status,
          subscription_plan_id: priceId,
          subscription_current_period_end: periodEnd,
        };
        if (tierResolution) {
          updatePayload.tier = tierResolution.tierId;
          updatePayload.billing_interval = tierResolution.interval;
        }

        await supabase
          .from("organizations")
          .update(updatePayload)
          .eq("id", orgId);

        // Phase 1.7: seed period_starts_at/ends_at and zero minute counter
        // for the very first billing cycle.
        if (session.subscription) {
          const sub = await stripe.subscriptions.retrieve(session.subscription as string);
          await maybeRollPeriod(orgId, sub, 'initial_subscription');
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const orgId = (sub.metadata?.organization_id as string | undefined)
          || await orgIdForCustomer(sub.customer as string);
        if (!orgId) break;

        const tierResolution = resolveTierFromSub(sub);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updatePayload: Record<string, any> = {
          stripe_subscription_id: sub.id,
          subscription_status: sub.status,
          subscription_plan_id: sub.items.data[0]?.price.id ?? null,
          subscription_current_period_end: subPeriodEnd(sub),
        };
        if (tierResolution) {
          updatePayload.tier = tierResolution.tierId;
          updatePayload.billing_interval = tierResolution.interval;
        }

        await supabase
          .from("organizations")
          .update(updatePayload)
          .eq("id", orgId);

        // Phase 1.7: roll the minute period if Stripe just rotated the
        // subscription onto a new billing cycle. RPC is idempotent against
        // duplicate events so it's safe to call on every update.
        const source = event.type === "customer.subscription.created"
          ? "initial_subscription"
          : "stripe_webhook";
        await maybeRollPeriod(orgId, sub, source as 'stripe_webhook' | 'initial_subscription');
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const orgId = await orgIdForCustomer(sub.customer as string);
        if (!orgId) break;
        // Phase 4: revert tier to solo when sub is fully cancelled. Don't touch
        // billing_interval (let the next checkout re-set it). This blocks
        // outbound calls via wallet-guard's solo_trial_exhausted path once
        // they've used 30 trial minutes.
        await supabase
          .from("organizations")
          .update({
            subscription_status: "canceled",
            tier: "solo",
          })
          .eq("id", orgId);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const orgId = await orgIdForCustomer(invoice.customer as string);
        if (!orgId) break;
        await supabase
          .from("organizations")
          .update({ subscription_status: "past_due" })
          .eq("id", orgId);
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const orgId = await orgIdForCustomer(invoice.customer as string);
        if (!orgId) break;
        // If they were past_due, flip back to active
        await supabase
          .from("organizations")
          .update({ subscription_status: "active" })
          .eq("id", orgId);
        break;
      }

      // ── Phase 4.5: wallet auto-reload payment intents ─────
      // The auto-reload route fires off_session Payment Intents and writes
      // the result synchronously via complete_reload_attempt. These webhook
      // handlers are redundancy: if the sync response was lost (network blip,
      // function timeout), the webhook arrives and finishes the same DB write.
      // complete_reload_attempt is idempotent — second call returns
      // already_completed=true without re-crediting.
      case "payment_intent.succeeded": {
        const pi = event.data.object as Stripe.PaymentIntent;
        const meta = pi.metadata ?? {};
        if (meta.purpose !== 'wallet_reload') break;  // not ours
        const attemptId = meta.attempt_id;
        if (!attemptId) {
          console.warn('[STRIPE WEBHOOK] wallet_reload PI missing attempt_id:', pi.id);
          break;
        }
        const { error } = await supabase.rpc('complete_reload_attempt', {
          p_attempt_id: attemptId,
          p_succeeded: true,
          p_stripe_payment_intent_id: pi.id,
          p_stripe_payment_method_id:
            (typeof pi.payment_method === 'string' ? pi.payment_method : pi.payment_method?.id) ?? null,
          p_stripe_error_code: null,
          p_stripe_error_message: null,
        });
        if (error) {
          console.error('[STRIPE WEBHOOK] wallet_reload succeeded RPC error:', error.message);
        }
        break;
      }

      case "payment_intent.payment_failed": {
        const pi = event.data.object as Stripe.PaymentIntent;
        const meta = pi.metadata ?? {};
        if (meta.purpose !== 'wallet_reload') break;  // not ours
        const attemptId = meta.attempt_id;
        if (!attemptId) {
          console.warn('[STRIPE WEBHOOK] wallet_reload PI missing attempt_id:', pi.id);
          break;
        }
        const lastErr = pi.last_payment_error;
        const { error } = await supabase.rpc('complete_reload_attempt', {
          p_attempt_id: attemptId,
          p_succeeded: false,
          p_stripe_payment_intent_id: pi.id,
          p_stripe_payment_method_id:
            (typeof pi.payment_method === 'string' ? pi.payment_method : pi.payment_method?.id) ?? null,
          p_stripe_error_code: lastErr?.code ?? lastErr?.type ?? 'payment_failed',
          p_stripe_error_message: lastErr?.message ?? 'Payment intent failed',
        });
        if (error) {
          console.error('[STRIPE WEBHOOK] wallet_reload failed RPC error:', error.message);
        }
        break;
      }

      default:
        // Ignore everything else — Stripe sends ~100 event types we don't care about
        break;
    }
  } catch (err) {
    console.error("[STRIPE WEBHOOK] handler error:", err);
    // Return 500 so Stripe retries
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
