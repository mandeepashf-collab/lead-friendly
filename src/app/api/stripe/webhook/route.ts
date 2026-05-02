import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import {
  getTierByStripePriceId,
  isWhiteLabelAddonPriceId,
  type TierId,
  type BillingInterval,
} from "@/config/pricing";
import {
  getCustomContractByPriceId,
  isCustomContractWlPriceId,
  ensureOrgWallet,
} from "@/lib/billing/custom-contract";

/**
 * POST /api/stripe/webhook
 *
 * Stripe webhook endpoint. Updates organization subscription status in response
 * to Stripe lifecycle events. Requires STRIPE_WEBHOOK_SECRET to verify signatures.
 *
 * Events handled:
 *   - checkout.session.completed           → new sub activated; Phase 7 claims founding spot if tier='founding'
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
  const maybeRollPeriod = async (
    orgId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  // D3: also falls through to per-org custom contract lookup if neither
  // metadata nor pricing.ts matches — this is how D2-created custom contract
  // Prices get recognized.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resolveTierFromSub = async (sub: any): Promise<{ tierId: TierId; interval: BillingInterval } | null> => {
    const meta = sub?.metadata ?? {};
    const metaTier = meta.tier_id as TierId | undefined;
    const metaInterval = meta.billing_interval as BillingInterval | undefined;
    if (metaTier && metaInterval) {
      return { tierId: metaTier, interval: metaInterval };
    }

    // Phase 8: when looking up tier from line items, IGNORE the WL add-on
    // price ID (it doesn't represent a tier). Find the first non-WL line item.
    // D3: also ignore custom-contract WL Price IDs (per-org WL line items).
    const items = sub?.items?.data ?? [];
    // Build the set of price IDs to consider as "tier" candidates by
    // excluding any that match a custom-contract WL Price.
    let tierPriceId: string | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const it of items as any[]) {
      const pid = it?.price?.id as string | undefined;
      if (!pid) continue;
      if (isWhiteLabelAddonPriceId(pid)) continue;
      if (await isCustomContractWlPriceId(supabase, pid)) continue;
      tierPriceId = pid;
      break;
    }
    if (!tierPriceId) return null;

    const matched = getTierByStripePriceId(tierPriceId);
    if (matched) {
      return { tierId: matched.tier.id, interval: matched.interval };
    }

    // D3: fall through to per-org custom contract resolution.
    const customMatch = await getCustomContractByPriceId(supabase, tierPriceId);
    if (customMatch) {
      return { tierId: customMatch.tierId, interval: customMatch.interval };
    }

    return null;
  };

  // Phase 8: detect WL add-on by scanning all subscription line items.
  // Returns true if any line item's price.id matches a WL add-on price.
  // D3: also recognize per-org custom-contract WL Price IDs (created in D2's
  // PATCH handler when the contract has WL enabled).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subHasWlAddon = async (sub: any): Promise<boolean> => {
    const items = sub?.items?.data ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const it of items as any[]) {
      const pid = it?.price?.id as string | undefined;
      if (!pid) continue;
      if (isWhiteLabelAddonPriceId(pid)) return true;
      if (await isCustomContractWlPriceId(supabase, pid)) return true;
    }
    return false;
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let subForWl: any = null;
        if (session.subscription) {
          const sub = await stripe.subscriptions.retrieve(session.subscription as string);
          subId = sub.id;
          priceId = sub.items.data[0]?.price.id ?? null;
          periodEnd = subPeriodEnd(sub);
          status = sub.status;
          tierResolution = await resolveTierFromSub(sub);
          subForWl = sub;
        }

        // Build the update object. Phase 4: also write tier + billing_interval
        // (the new pricing schema columns) when we can resolve them from the sub.
        // Phase 8: also write is_white_label_enabled based on WL line item.
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
        // Phase 8 / D3: WL flag derived from line items. Includes both the
        // global Agency WL add-on and per-org custom-contract WL Prices.
        updatePayload.is_white_label_enabled = subForWl
          ? await subHasWlAddon(subForWl)
          : false;

        await supabase
          .from("organizations")
          .update(updatePayload)
          .eq("id", orgId);

        // D3: when a custom contract goes live via Checkout, ensure the org
        // has a wallet row so overage debits land somewhere. Most orgs already
        // have one from mig 036 backfill; this self-heals the edge case.
        if (tierResolution?.tierId === 'custom') {
          await ensureOrgWallet(supabase, orgId);
        }

        // Phase 7: if this is a Founding tier checkout, atomically claim
        // a spot in the founding_member_counter and assign a member number
        // (1..100). Fire-and-log on failure — if the counter is sold out
        // by the time the webhook fires (race with another concurrent
        // checkout), the customer's tier is still set to 'founding' but
        // they don't get a member number. Manual triage / refund for that
        // edge case until we automate it.
        if (tierResolution?.tierId === 'founding') {
          const { data: claimResult, error: claimErr } = await supabase.rpc(
            'claim_founding_spot',
            { p_org_id: orgId },
          );
          if (claimErr) {
            console.error(
              `[STRIPE WEBHOOK] founding spot claim error for org=${orgId}:`,
              claimErr.message,
            );
          } else if (claimResult && !claimResult.success) {
            console.warn(
              `[STRIPE WEBHOOK] founding spot claim failed for org=${orgId}:`,
              claimResult.reason,
            );
          } else if (claimResult?.success) {
            console.log(
              `[STRIPE WEBHOOK] founding spot claimed: org=${orgId}, member_number=${claimResult.member_number}, remaining=${claimResult.spots_remaining}`,
            );
          }
        }

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

        const tierResolution = await resolveTierFromSub(sub);
        const wlEnabled = await subHasWlAddon(sub);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updatePayload: Record<string, any> = {
          stripe_subscription_id: sub.id,
          subscription_status: sub.status,
          subscription_plan_id: sub.items.data[0]?.price.id ?? null,
          subscription_current_period_end: subPeriodEnd(sub),
          // Phase 8 / D3: WL flag tracks current line items. Removing the WL
          // price from the subscription disables WL on next webhook. Includes
          // both the global Agency WL add-on and per-org custom-contract WL
          // Prices.
          is_white_label_enabled: wlEnabled,
        };
        if (tierResolution) {
          updatePayload.tier = tierResolution.tierId;
          updatePayload.billing_interval = tierResolution.interval;
        }

        await supabase
          .from("organizations")
          .update(updatePayload)
          .eq("id", orgId);

        // D3: ensure wallet exists for custom orgs (defensive — most orgs
        // already have one from mig 036 backfill).
        if (tierResolution?.tierId === 'custom') {
          await ensureOrgWallet(supabase, orgId);
        }

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

        // D3: if the cancelled sub was on a custom contract, also archive
        // the contract so its Stripe Price IDs stop matching future webhook
        // events (e.g. if Stripe replays an old event after we re-issue a
        // contract). We detect this by checking if any line item's price
        // matches the org's saved custom_stripe_price_id. We don't use
        // resolveTierFromSub here because at deletion time the metadata
        // and price-id lookups should still find the contract — but if for
        // some reason they don't, we still want the column flips below.
        let archiveCustomContract = false;
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const items = (sub as any)?.items?.data ?? [];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          for (const it of items as any[]) {
            const pid = it?.price?.id as string | undefined;
            if (!pid) continue;
            const match = await getCustomContractByPriceId(supabase, pid);
            if (match && match.orgId === orgId) {
              archiveCustomContract = true;
              break;
            }
          }
        } catch (err) {
          console.warn(
            '[STRIPE WEBHOOK] custom-contract archive lookup failed:',
            err instanceof Error ? err.message : err,
          );
        }

        // Phase 4: revert tier to solo when sub is fully cancelled. Don't touch
        // billing_interval (let the next checkout re-set it). This blocks
        // outbound calls via wallet-guard's solo_trial_exhausted path once
        // they've used 30 trial minutes.
        // Phase 8: also clear WL flag — subscription canceled means no add-on.
        // D3: archive the custom contract if one was tied to this sub.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cancelPayload: Record<string, any> = {
          subscription_status: "canceled",
          tier: "solo",
          is_white_label_enabled: false,
        };
        if (archiveCustomContract) {
          cancelPayload.custom_contract_archived_at = new Date().toISOString();
        }
        await supabase
          .from("organizations")
          .update(cancelPayload)
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
