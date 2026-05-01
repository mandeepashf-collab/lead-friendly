-- =============================================================
-- 036: Pricing tier system + wallet foundation
-- =============================================================
-- Adds tier/billing_interval/period tracking to organizations.
-- Creates org_wallets (cents-based) + wallet_transactions ledger.
-- Adds founding_member_counter (atomic claim of 100 spots).
-- All amounts stored as integer cents to match Stripe API.
--
-- Applied via Supabase MCP: 2026-04-30
-- =============================================================

-- 1. Enums
CREATE TYPE pricing_tier AS ENUM ('solo','starter','pro','agency','custom','founding');
CREATE TYPE billing_interval AS ENUM ('monthly','annual');
CREATE TYPE wallet_txn_type AS ENUM ('debit','manual_credit','auto_reload','refund','adjustment');
CREATE TYPE wallet_block_reason AS ENUM ('zero_balance','auto_reload_failed','manual_block','subscription_canceled');

-- 2. Extend organizations
ALTER TABLE organizations
  ADD COLUMN tier pricing_tier NOT NULL DEFAULT 'solo',
  ADD COLUMN billing_interval billing_interval,
  ADD COLUMN current_period_starts_at timestamptz,
  ADD COLUMN current_period_ends_at timestamptz,
  ADD COLUMN current_period_minutes_used integer NOT NULL DEFAULT 0,
  ADD COLUMN is_founding_member boolean NOT NULL DEFAULT false,
  ADD COLUMN founding_member_number integer;

-- Backfill tier from existing free-text plan column.
UPDATE organizations SET tier =
  CASE
    WHEN plan IN ('solo','starter','pro','agency','custom','founding')
      THEN plan::pricing_tier
    ELSE 'solo'::pricing_tier
  END;

-- Backfill period boundaries.
UPDATE organizations
SET current_period_starts_at = date_trunc('month', created_at),
    current_period_ends_at = date_trunc('month', created_at) + interval '1 month'
WHERE current_period_starts_at IS NULL;

-- Comment on legacy columns to flag deprecation
COMMENT ON COLUMN organizations.plan IS
  'DEPRECATED - use tier (enum). Will be dropped after Phase 4 verified.';
COMMENT ON COLUMN organizations.ai_minutes_limit IS
  'DEPRECATED - limit is now derived from tier via src/config/pricing.ts. Will be dropped after Phase 4 verified.';
COMMENT ON COLUMN organizations.ai_minutes_used IS
  'DEPRECATED - use current_period_minutes_used. Will be dropped after Phase 4 verified.';

-- 3. org_wallets - one row per org, amounts in CENTS (integer)
CREATE TABLE org_wallets (
  organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  balance_cents integer NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),
  auto_reload_enabled boolean NOT NULL DEFAULT true,
  auto_reload_threshold_cents integer NOT NULL DEFAULT 1000,  -- $10
  auto_reload_amount_cents integer NOT NULL DEFAULT 5000,     -- $50
  stripe_payment_method_id text,
  is_blocked boolean NOT NULL DEFAULT false,
  blocked_reason wallet_block_reason,
  blocked_at timestamptz,
  last_auto_reload_attempt_at timestamptz,
  last_auto_reload_failure_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON org_wallets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE org_wallets IS
  'Prepaid wallet for voice overage. Auto-reload via Stripe when balance < threshold. Amounts in cents.';
COMMENT ON COLUMN org_wallets.balance_cents IS
  'Current balance in cents. CHECK >= 0 enforced; debit RPC blocks at 0 instead of allowing negative.';
COMMENT ON COLUMN org_wallets.is_blocked IS
  'When true, all outbound calls are blocked. Set by zero_balance, auto_reload_failed, or manual.';

-- 4. wallet_transactions - append-only ledger
CREATE TABLE wallet_transactions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type wallet_txn_type NOT NULL,
  amount_cents integer NOT NULL,
  balance_before_cents integer NOT NULL,
  balance_after_cents integer NOT NULL,
  description text,
  stripe_charge_id text,
  stripe_payment_intent_id text,
  call_id uuid REFERENCES calls(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_wallet_txns_org_created ON wallet_transactions(organization_id, created_at DESC);
CREATE INDEX idx_wallet_txns_call ON wallet_transactions(call_id) WHERE call_id IS NOT NULL;
CREATE INDEX idx_wallet_txns_stripe_charge ON wallet_transactions(stripe_charge_id) WHERE stripe_charge_id IS NOT NULL;
CREATE INDEX idx_wallet_txns_type_created ON wallet_transactions(type, created_at DESC);

COMMENT ON TABLE wallet_transactions IS
  'Append-only ledger. Positive amount_cents = credit, negative = debit. Never UPDATE or DELETE.';

-- 5. RLS
ALTER TABLE org_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members can view own wallet" ON org_wallets
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "members can view own wallet txns" ON wallet_transactions
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
  );

-- No INSERT/UPDATE/DELETE policies -> service role only via webhooks/RPCs

-- 6. Backfill: create wallet row for each existing org
INSERT INTO org_wallets (organization_id)
SELECT id FROM organizations
ON CONFLICT (organization_id) DO NOTHING;

-- 7. Founding member counter (single-row table, atomic claim)
CREATE TABLE founding_member_counter (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  spots_claimed integer NOT NULL DEFAULT 0 CHECK (spots_claimed >= 0),
  spots_total integer NOT NULL DEFAULT 100 CHECK (spots_total > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO founding_member_counter (id) VALUES (true);

ALTER TABLE founding_member_counter ENABLE ROW LEVEL SECURITY;

-- Anyone (even unauthenticated) can read remaining spots - used on /founding landing page
CREATE POLICY "anyone can read founding counter" ON founding_member_counter
  FOR SELECT USING (true);

COMMENT ON TABLE founding_member_counter IS
  'Single-row table for atomic Founding 100 spot claim. Only RPC claim_founding_spot() should UPDATE.';
