-- 043_custom_pricing_d1.sql
-- D1 of custom-pricing-architecture.md (May 2, 2026)
--
-- Custom pricing was already partially modeled (see mig 036 / agency UI):
--   - custom_monthly_fee_cents, custom_included_minutes,
--     custom_overage_rate_x10000, custom_pricing_note,
--     custom_pricing_set_at, custom_pricing_set_by
--
-- D1 adds the columns the memo's pre-paid-bundle model requires for the
-- platform-admin contract builder:
--   - custom_framing_rate_x10000 — display per-minute rate (cents × 10000)
--                                  used for negotiation framing only.
--                                  Operational billing is the flat monthly
--                                  fee + bundle + overage.
--   - custom_wl_fee_cents        — negotiated white-label add-on fee.
--                                  Separate Stripe Price line item.
--   - custom_billing_interval    — monthly | annual. NULL until contract set.
--   - custom_stripe_product_id   — Stripe Product created at contract save.
--   - custom_stripe_price_id     — Stripe Price for platform-fee line item.
--   - custom_wl_stripe_price_id  — Stripe Price for WL line item (NULL if no WL).
--   - custom_contract_archived_at — set when contract renegotiated, prevents
--                                   stale Stripe Price IDs from matching in
--                                   webhook.
--
-- Notes:
--   - All columns nullable: existing rows get NULL, no backfill needed.
--   - No data migration: existing 4 orgs don't have custom contracts.
--   - Standard tiers (Solo/Starter/Pro/Agency/Founding) untouched.
--   - record_call_usage RPC continues to read custom_overage_rate_x10000
--     when tier='custom'. No RPC changes in D1.

begin;

-- New columns ---------------------------------------------------------------

alter table public.organizations
  add column if not exists custom_framing_rate_x10000 integer,
  add column if not exists custom_wl_fee_cents integer,
  add column if not exists custom_billing_interval text,
  add column if not exists custom_stripe_product_id text,
  add column if not exists custom_stripe_price_id text,
  add column if not exists custom_wl_stripe_price_id text,
  add column if not exists custom_contract_archived_at timestamptz;

-- Constraints ---------------------------------------------------------------

-- billing_interval enum check
alter table public.organizations
  drop constraint if exists organizations_custom_billing_interval_check;
alter table public.organizations
  add constraint organizations_custom_billing_interval_check
  check (
    custom_billing_interval is null
    or custom_billing_interval in ('monthly', 'annual')
  );

-- WL coherence: if a WL Stripe Price is stamped, WL fee must also be set.
-- Allows partial state during contract creation (form save before Stripe
-- Price creation) but blocks the impossible state of "we created a Stripe
-- Price for $X but our DB says WL fee is NULL."
alter table public.organizations
  drop constraint if exists organizations_custom_wl_coherence_check;
alter table public.organizations
  add constraint organizations_custom_wl_coherence_check
  check (
    custom_wl_stripe_price_id is null
    or custom_wl_fee_cents is not null
  );

-- Non-negative numeric checks
alter table public.organizations
  drop constraint if exists organizations_custom_framing_rate_nonneg_check;
alter table public.organizations
  add constraint organizations_custom_framing_rate_nonneg_check
  check (custom_framing_rate_x10000 is null or custom_framing_rate_x10000 >= 0);

alter table public.organizations
  drop constraint if exists organizations_custom_wl_fee_nonneg_check;
alter table public.organizations
  add constraint organizations_custom_wl_fee_nonneg_check
  check (custom_wl_fee_cents is null or custom_wl_fee_cents >= 0);

-- Indexes -------------------------------------------------------------------

-- Webhook lookup: when a Stripe event arrives with a price_id we don't
-- recognize from STRIPE_PRICE_* env vars, fall back to looking up
-- custom_stripe_price_id or custom_wl_stripe_price_id on organizations.
-- This is the hot lookup for every paid event, so index it.
create index if not exists idx_organizations_custom_stripe_price_id
  on public.organizations (custom_stripe_price_id)
  where custom_stripe_price_id is not null
    and custom_contract_archived_at is null;

create index if not exists idx_organizations_custom_wl_stripe_price_id
  on public.organizations (custom_wl_stripe_price_id)
  where custom_wl_stripe_price_id is not null
    and custom_contract_archived_at is null;

-- Comments ------------------------------------------------------------------

comment on column public.organizations.custom_framing_rate_x10000 is
  'Per-minute rate × 10000 (e.g. 850 = $0.085/min) used as negotiation '
  'framing label. Display only — operational billing is custom_monthly_fee_cents + '
  'custom_overage_rate_x10000 above custom_included_minutes.';

comment on column public.organizations.custom_wl_fee_cents is
  'Negotiated white-label add-on fee in cents. Separate Stripe Price line '
  'item from the platform fee. NULL = no WL.';

comment on column public.organizations.custom_billing_interval is
  'Billing cadence for this custom contract: monthly | annual. NULL until '
  'contract is set. Independent of organizations.billing_interval which is '
  'for standard tiers.';

comment on column public.organizations.custom_stripe_product_id is
  'Stripe Product created server-side when founder saves a custom contract '
  'in /platform/orgs/[id]/custom-pricing. Reused if contract is edited; '
  'archived (not deleted) if contract is voided.';

comment on column public.organizations.custom_stripe_price_id is
  'Stripe Price for the platform-fee line item of this custom contract. '
  'Webhook resolver matches incoming subscription line items against this '
  'value to identify custom-tier orgs.';

comment on column public.organizations.custom_wl_stripe_price_id is
  'Stripe Price for the WL line item of this custom contract. NULL when '
  'WL is not part of the contract. Webhook reads subscription items and '
  'sets is_white_label_enabled=true when this Price ID is present.';

comment on column public.organizations.custom_contract_archived_at is
  'Set when a contract is renegotiated or voided. Indexed lookups exclude '
  'archived contracts so stale Stripe Price IDs don''t match webhook events.';

commit;
