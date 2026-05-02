# Custom Pricing Architecture

**Status**: Draft for founder review
**Last updated**: May 2, 2026
**Owner**: Mandeep
**Implementation**: Not started

---

## TL;DR

Custom pricing is **pre-paid bundle + post-paid overage from wallet**, negotiated
per-customer. It reuses the existing flat-fee subscription infrastructure of the
standard tiers (Solo/Starter/Pro/Agency) — there is no new metered billing code,
no Stripe usage records, no separate billing engine. The novel parts are
(1) per-customer Stripe Products/Prices created at contract-signing time, and
(2) a platform-admin "contract builder" UI replacing the current Custom Pricing
form.

Estimated build: ~half a day end-to-end across 5 phases (D1–D5), each
independently shippable.

---

## The model

A custom contract has four parts. Three are mandatory, one is optional:

1. **Monthly platform fee** (mandatory; can be $0) — flat recurring charge,
   billed every cycle regardless of usage.
2. **Included minutes** (mandatory; can be 0) — bundle of minutes covered by
   the platform fee. **No rollover, no refund** for unused minutes.
3. **Overage rate** (mandatory) — per-minute rate charged once the included
   bundle is exhausted. Drawn from the org's prepaid wallet via the existing
   `record_call_usage` RPC. No code changes here.
4. **White-label add-on fee** (optional) — separate flat recurring charge for
   custom-domain + branded portal. Founder negotiates per deal; can be $0,
   $99, $30, whatever.

Plus a billing interval (`monthly` or `annual`) chosen at signup. Same
infrastructure handles both.

### Worked examples

**Aru Corp** — $49/mo platform + 5000 min @ $0.085 effective rate + $0.10
overage above 5000 min, no WL, monthly billing.

| Month | Usage | Bill |
|---|---|---|
| 1 | 3,000 min | $474 (full platform fee, 2,000 unused minutes lost) |
| 2 | 5,000 min | $474 (exactly at bundle) |
| 3 | 7,000 min | $474 + (2,000 × $0.10) = $674. The $200 overage draws from wallet. |

The "$0.085/min" is **negotiation framing** — what you pitch on the sales
call. Operationally Aru Corp pays $474/mo flat. The framing rate is stored
for display purposes (invoice readouts, admin clarity).

**BRM LLC** — $99/mo WL + 3,000 min @ $0.07 effective rate + $0.095 overage,
monthly billing.

Two Stripe line items: $210 platform fee (3,000 × $0.07) + $99 WL fee. Total
billed at month-start: $309. Overage above 3,000 min draws from wallet at
$0.095/min.

**SMG Finance** — $0/mo platform + 20,000 min @ $0.68 effective + $0.75
overage, monthly billing.

Single Stripe line item: $13,600 ($20,000 × $0.68). No platform fee. No WL.
Overage above 20,000 min from wallet at $0.75/min.

### Why pre-paid is the right primitive here

Three reasons we picked pre-paid bundle over post-paid metered:

1. **Cash flow.** You collect $474 from Aru Corp on signup day, not 30 days
   later. For a solo founder this matters.
2. **Existing infra reuse.** Standard tiers are pre-paid flat-fee with bundles.
   Custom contracts are *also* pre-paid flat-fee with bundles, just with
   negotiable numbers. Same Stripe primitives (recurring `licensed` Price),
   same webhook handler, same renewal logic, same wallet-overage path.
3. **Operational simplicity.** No usage records to submit to Stripe per call.
   No end-of-month invoice cron. No "what if a usage record fails to submit?"
   edge cases. All the metered-billing complexity stays out.

**Tradeoff accepted**: customers pay for unused minutes. This is documented as
the negotiation contract — when you sell, you tell them explicitly that they
commit to a usage bucket. If they consistently underuse, they renegotiate to
a smaller bucket at next renewal.

---

## Schema deltas

The existing `organizations` table already has:
- `custom_included_minutes integer` — set on custom contracts
- `custom_overage_rate_x10000 integer` — overage per minute × 10000

We add three columns:

```sql
alter table organizations
  add column custom_monthly_fee_cents integer,
  add column custom_framing_rate_x10000 integer,
  add column custom_wl_fee_cents integer,
  add column custom_billing_interval text
    check (custom_billing_interval in ('monthly', 'annual') or custom_billing_interval is null);
```

We also need to track the per-customer Stripe Prices we create:

```sql
alter table organizations
  add column custom_stripe_product_id text,
  add column custom_stripe_price_id text,
  add column custom_wl_stripe_price_id text;
```

These let the webhook handler resolve "what tier is this subscription?" by
comparing the incoming Stripe Price ID against `custom_stripe_price_id` on
the org row, falling back to the standard `getTierByStripePriceId()` path
if no match. Same lookup discipline as today, just one extra check.

No changes to `org_wallets`, `wallet_transactions`, `record_call_usage`,
`reset_minute_period`, or any other billing infra. The custom org's
`current_period_minutes_used` counter resets on the first of each period
the same way standard tiers do, driven by the same `customer.subscription.updated`
webhook.

---

## The Stripe primitive flow

### At contract creation (admin form save)

1. Founder fills contract form in `/platform/orgs/[id]/custom-pricing`.
2. Server validates: monthly_fee_cents ≥ 0, included_minutes ≥ 0, overage_rate
   set, framing_rate × included_minutes / 10000 ≈ monthly_fee_cents (sanity
   check, warn if mismatch >5%).
3. Server creates a Stripe **Product** named `Custom — {org.name}` (or reuses
   if `custom_stripe_product_id` already set on the org).
4. Server creates a Stripe **Price** for the platform fee:
   - `currency: usd`
   - `unit_amount: custom_monthly_fee_cents`
   - `recurring: { interval: 'month' or 'year', usage_type: 'licensed' }`
   - `tax_behavior: 'exclusive'` (matches existing tiers)
   - `metadata: { lf_org_id, lf_kind: 'custom_platform' }`
5. If WL: server creates a **second** Price for the WL fee, same shape but
   `unit_amount: custom_wl_fee_cents` and `metadata.lf_kind: 'custom_wl'`.
6. Server stamps the IDs on the org row: `custom_stripe_product_id`,
   `custom_stripe_price_id`, `custom_wl_stripe_price_id` (nullable).
7. Server records the contract change in audit log.

The contract form is the source of truth — Prices are recreated if the
contract is materially edited (see "Renegotiation" below).

### At customer signup (founder clicks "Send checkout link")

1. Server creates a Stripe Checkout Session with:
   - `customer: org.stripe_customer_id` (or `customer_email` if no Stripe
     customer yet — Stripe creates one)
   - `mode: 'subscription'`
   - `line_items`: 1 item for the platform Price + (optionally) 1 item for
     the WL Price. Both qty 1.
   - `automatic_tax: { enabled: true }` (existing setup)
   - `billing_address_collection: 'required'` (existing)
   - `customer_update: { address: 'auto', name: 'auto' }` (existing)
   - **For annual contracts**: `consent_collection.terms_of_service: 'required'`
     and `custom_text.terms_of_service_acceptance.message` with the locked-rate
     language (matches existing 4.1 ToS consent flow).
   - `success_url: /dashboard?subscription=success&tier=custom...`
   - `cancel_url: /pricing` (or back to /platform/orgs/{id})
2. Server returns the URL to the admin UI; admin emails it to the customer
   manually (or via a "Send" button that fires a transactional email — D5
   nice-to-have).

### At month boundary (Stripe webhook)

1. Stripe automatically renews the subscription, charges the customer's card
   for `monthly_fee_cents + (wl_fee_cents if WL)`, fires
   `customer.subscription.updated`.
2. Existing webhook handler runs `maybeRollPeriod()` — resets
   `current_period_minutes_used` to 0, advances `current_period_starts_at`
   and `_ends_at`. **No new code.**
3. Customer starts the new month with full bundle restored.

### When a call ends

1. `record_call_usage` RPC runs (existing).
2. RPC reads `custom_included_minutes` and `custom_overage_rate_x10000` if
   `tier='custom'`. (Drift fix in mig 044 — see D3 decision log entry.
   Earlier draft claimed this was "already handled" in mig 038/039; it was
   not, the prod RPC was hot-patched without a tracked migration.)
3. Updates `current_period_minutes_used`. If past bundle, debits wallet at
   custom overage rate.

### Wallet auto-reload

Same as today. `org_wallets` row exists for every org including custom orgs
(D3 webhook ensures this defensively for any edge-case org missing one).
Auto-reload defaults: enabled, threshold $10, reload $50. Customer adjusts in
`/settings/billing`. Custom contracts get the exact same wallet UX.

---

## Platform admin UX (the contract builder)

Replaces the current `/platform/orgs/[id]/pricing` form (the one in
your screenshot). New form has:

| Field | Type | Required | Notes |
|---|---|---|---|
| Monthly platform fee | $ input (cents stored) | Yes | Can be 0 |
| Billing interval | radio: monthly / annual | Yes | Default monthly |
| Included minutes | integer input | Yes | Can be 0 (pure-overage contract) |
| Framing rate (display) | $ input with 4-decimal precision | Yes if included>0 | Stored ×10000 |
| Overage rate | $ input with 4-decimal precision | Yes | Stored ×10000 |
| White-label add-on | toggle + nested fee field | No | If on: separate Stripe Price |
| WL fee | $ input (cents) | Required if WL toggled | |
| Internal notes | textarea | No | Audit trail |

**Computed display below form** (live):
- "Customer pays $X/mo" = monthly_fee + (wl_fee if on)
- "Effective per-minute rate within bundle" = framing_rate display
- "Overage rate above bundle" = overage_rate × $/min
- "Sanity check: framing × bundle = monthly fee?" → green ✓ if within 5%, amber warning otherwise

**After save**, two action buttons appear:
- **Send checkout link** — generates Stripe Checkout, shows URL with copy-button. Optional D5: send transactional email automatically.
- **Edit contract** — re-opens form, archives current Stripe Prices on save (creates fresh Prices). See "Renegotiation" below.

**Audit history section** — last 20 contract changes for this org with
diff view: "monthly fee 47400 → 49900, included minutes 5000 → 5500, ..."

### Why this form replaces the existing one

The current form has `Monthly fee (cents)` labeled as "Display only — actual
billing happens via Stripe Price ID." That's the bug we're fixing. After
this work, the monthly fee field actually drives billing through a
real Stripe Price the form creates.

---

## Webhook updates

The existing webhook handler in `src/app/api/stripe/webhook/route.ts` does:

```ts
const tier = getTierByStripePriceId(priceId)
```

This needs to become:

```ts
const tier = getTierByStripePriceId(priceId) ?? await getCustomContractByPriceId(priceId)
```

Where `getCustomContractByPriceId` looks up the org with `custom_stripe_price_id = priceId` and returns a synthesized "tier" object with that org's `custom_*` values.

For the WL line item: webhook reads `subscription.items.data` for both
Prices, sets `is_white_label_enabled` if WL Price present, same logic as
existing Agency+WL flow.

**`subscription.deleted`**: clear `tier` back to `solo`, do NOT delete the
`custom_stripe_*` IDs (audit trail) — but mark them archived so they don't
match future webhook lookups. New column `custom_contract_archived_at`
timestamptz, nullable.

---

## Negotiation-time ergonomics (D5)

Optional but high-leverage. Before the form, founder spends 5 minutes on a
sales call mentally computing "OK if I offer 5000 min at 8 cents and a $50
platform fee that's $450 to them, can I afford that?" A small calculator
widget on the contract-builder page eliminates that math:

- Inputs: target monthly bill, minutes/month customer expects, your cost-per-minute
- Outputs: required platform fee for X% margin, recommended framing rate,
  recommended overage rate

This is a UI helper, not a separate endpoint. Lives next to the contract
form. Skip in v1, add in D5 if useful.

---

## Edge cases

### Renegotiation mid-contract

Customer wants to change terms in month 4 of an annual contract.

**Approach**: founder edits the contract in admin form. Save creates new
Stripe Prices, archives the old ones (set `custom_contract_archived_at`).
Server:
1. Cancels current subscription at period end (`cancel_at_period_end: true`)
2. Creates a new subscription on the new Prices via Checkout link
3. Customer pays the new amount on the new period start, old subscription
   ends gracefully

Trade-off: customer goes through Checkout again. Acceptable for negotiated
contracts (low frequency, intentional moment) but worth flagging.

Alternative: use Stripe's subscription update API to swap Prices in-place
with prorations. Cleaner but requires saved card on file, can fail silently
if card declines on proration charge. **Defer to v2.**

### Customer cancels

Standard subscription cancellation flow. Webhook fires
`customer.subscription.deleted`, existing handler sets
`subscription_status='canceled'` and clears tier. Custom-contract Stripe
Prices stay in Stripe but get archived (`custom_contract_archived_at`)
so a future webhook event can't accidentally re-match them.

### Customer adds WL mid-contract

Founder edits contract, toggles WL on, saves. Server creates a new WL Stripe
Price and updates the existing subscription via `subscription.items.create`
(adds the line item). Stripe prorates. No new Checkout flow needed.

### Customer removes WL mid-contract

Reverse of above. `subscription.items.del`. Stripe prorates the credit.

### Wallet runs dry mid-month with overage in flight

Already handled by existing `wallet-guard.ts`. Outbound calls blocked at
`checkOutboundCallAllowed()`. Customer sees the existing past-due / blocked
banner. Same UX as standard tiers.

### Customer wants to be billed annually but pays monthly for now

Single contract, single billing interval. Re-negotiate to switch — see
"Renegotiation" above. Don't try to support same-customer-different-interval
at the same time. Keeps the schema and webhook logic clean.

### Customer wants overage rolled into monthly invoice instead of wallet

Out of scope for v1. Documented as future enhancement: Stripe
`add_invoice_items` API can append usage charges to next monthly invoice.
Requires moving overage off wallet and onto deferred Stripe invoice items.
Significant rework, not justified by current customer demand.

---

## Open questions for founder

1. **Sanity-check tolerance.** I propose warning if
   `monthly_fee_cents` and `framing_rate × included_minutes / 10000` differ
   by more than 5%. Is 5% the right threshold? Sometimes you'll legitimately
   round (e.g. $0.0833 × 5000 = $416.50 but you bill $417 for round numbers).
   Want a different threshold? Or never warn, just store both?

2. **Email delivery for checkout links.** Manual copy-paste is fine for v1
   (founder copies URL, pastes into their own email client). D5 could add a
   "Send" button using Resend or similar. Not blocking. Confirm v1 = manual.

3. **Currency.** Everything assumes USD. International custom contracts
   would need additional Stripe Price in other currencies. Out of scope for
   v1, document as future.

4. **Custom + Founding 100.** Mutually exclusive in v1. A custom contract
   replaces any tier including Founding. Founding members can't be
   "upgraded" to custom (they'd lose the locked-in rate). If a Founding
   member negotiates a custom deal, they're choosing to give up the
   Founding lock. Confirm.

---

## Phased implementation

Each phase is independently shippable and testable.

### D1 — Schema + types (~30 min)

- Migration adding the 7 new columns to `organizations`
- Update `pricing.ts` types: `CustomContract` interface, helper `isCustomContract(org)`
- Update `/api/ai-minutes` and `/api/platform/orgs/[id]` to return new fields
- Update platform admin detail page to display contract values (read-only at this stage)

**Ship checkpoint**: existing system unchanged, new columns nullable, no
billing behavior change.

### D2 — Contract builder admin form (~1.5 hours)

- Replace current Custom Pricing form with new contract-builder UI
- POST endpoint that validates and saves contract values
- Audit log entries on save
- Stripe Product+Price creation server-side (uses `stripe.products.create`,
  `stripe.prices.create`)
- "Send checkout link" button with copy-to-clipboard
- Sanity-check display

**Ship checkpoint**: founder can fill in a contract for an org, system
creates real Stripe Prices, generates a working checkout URL. Testing: create
a fake contract for a test org, walk through Stripe Checkout in test mode,
confirm subscription created with correct line items.

### D3 — Webhook handling for custom (~1 hour)

- Update webhook handler to look up custom contract by Stripe Price ID
- On `checkout.session.completed`: set `tier='custom'`, stamp contract
  values, set `is_white_label_enabled` from line items
- On `customer.subscription.updated`: standard period roll using
  `maybeRollPeriod()` (existing)
- On `customer.subscription.deleted`: archive contract, clear tier

**Ship checkpoint**: a real test customer can pay through the checkout link,
their org gets `tier='custom'` stamped, period bundle initialized,
overage flows through wallet correctly.

### D4 — WL handling polish (~30 min)

- Add/remove WL mid-contract via Stripe Subscription Items API
- WL Price archival on contract edit
- UI: toggle WL on existing contract triggers proration confirmation modal

**Ship checkpoint**: founder can add or remove WL on an active custom
contract without going through full re-checkout.

### D5 — Negotiation calculator + email send (~30 min)

- Calculator widget on contract form
- "Send" button that fires transactional email (Resend or whatever's wired)
- Polish: nicer audit-log diff view

**Ship checkpoint**: contract creation feels smooth in a sales-call context.

---

## Out of scope (explicitly)

- **Self-serve custom signup** (Phase 6 of original roadmap, `/contact-sales`
  flow) — separate workstream
- **Stripe metered billing / usage records** — not used; we keep pre-paid
- **Mid-contract proration of bundle changes** — handled via cancel+rebuy
- **Multi-currency** — USD only
- **International tax beyond Stripe Tax automatic computation** — relies on
  existing `automatic_tax: true` setup

---

## Decision log (fills as we ship)

- May 2, 2026: Memo drafted. Pre-paid bundle model selected over post-paid
  metered. Reuses existing wallet+overage infrastructure. Phased D1–D5.
- May 2, 2026 (D2 decisions): (1) No sanity-check warning — auto-compute
  prevents the underlying mismatch and a warning would false-positive on
  rounding. (2) Material edit = changes to monthly_fee, included_minutes,
  overage_rate, billing_interval, or wl_fee (incl. null↔value transitions);
  these archive old Stripe Prices and create new ones. Non-material =
  framing_rate or note only; columns + audit only, no Stripe calls.
  Archived Prices do NOT migrate existing subscriptions — they continue
  on the old Price until manual cancel/re-checkout (matches the
  Renegotiation flow above). (3) Founding mutex is soft-warn with required
  checkbox in the form; server-side guard rejects without
  `force_replace_founding=true` (HTTP 409 with `founding_replace_required`
  flag). Founding slot stays consumed when replaced — slot is the cost of
  the perpetual locked-in rate the customer is walking away from; not
  reclaimed.
- May 2, 2026 (D3 corrigendum + decisions): D3 audit revealed two
  inaccuracies in this memo's earlier claims, both corrected as part of
  D3 ship. **First**, the "When a call ends" section claimed
  `record_call_usage` "(existing logic in mig 038/039 already handles
  this) — no new code". Inspecting prod showed the deployed RPC body
  already reads `custom_included_minutes` / `custom_overage_rate_x10000`
  from the org row (a hot-patch after mig 039 that never landed in a
  tracked migration), but mig 039 in the repo is stale. Mig 044 captures
  the deployed body so repo + prod match — drift fix, not behavior change.
  **Second**, `wallet-guard.ts` had a `tier === 'custom'` early-return
  that bypassed wallet rules ("trust the manual setup, no auto-block"
  Phase 8 stub). Now that custom contracts pay via Stripe and overage
  debits the wallet, custom must follow the same wallet rules as paid
  tiers — branch removed. Decisions: (1) keep webhook tier-resolution
  ordering metadata → standard pricing → custom contract Price-ID lookup;
  the metadata path is preferred but the lookup path catches subs created
  outside our checkout (e.g. manual Stripe Dashboard). (2) WL detection
  for custom contracts uses per-org `custom_wl_stripe_price_id` lookup
  alongside the global Agency add-on Price IDs. (3) On
  `subscription.deleted` for a custom contract, set
  `custom_contract_archived_at = now()` so stale Stripe Price IDs stop
  matching webhook replays. Existing tier-revert (`tier='solo'`,
  `is_white_label_enabled=false`) unchanged. (4) Defensive wallet creation:
  custom-tier subscription events now ensure an `org_wallets` row exists
  for the org (idempotent upsert). Self-heals the rare edge case where
  an org slipped through mig 036's backfill.
- _(future entries here as decisions land)_
