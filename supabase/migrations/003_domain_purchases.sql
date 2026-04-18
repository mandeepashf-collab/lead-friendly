-- ── Domain Purchases Table ──────────────────────────────────────
-- Tracks domains purchased through the platform for billing and renewal.
-- Wholesale price = what we pay Vercel. Sell price = what we charge customer.
-- Profit per domain = sell_price_cents - purchase_price_cents

CREATE TABLE IF NOT EXISTS domain_purchases (
  id                    UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id               UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  domain                TEXT        NOT NULL,
  subdomain_connected   TEXT,
  purchase_price_cents  INT         NOT NULL DEFAULT 0,   -- wholesale (Vercel)
  sell_price_cents      INT         NOT NULL DEFAULT 0,   -- retail (customer)
  purchased_at          TIMESTAMPTZ DEFAULT now(),
  renewal_date          TIMESTAMPTZ,
  auto_renew            BOOLEAN     DEFAULT true,
  status                TEXT        DEFAULT 'active'
                                    CHECK (status IN ('active', 'expired', 'cancelled')),
  stripe_payment_id     TEXT,       -- populated once Stripe is wired in
  created_at            TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE domain_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own purchases" ON domain_purchases
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own purchases" ON domain_purchases
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Admins/service role can update (for renewal processing)
-- No user-level DELETE — purchases are a financial record

CREATE INDEX IF NOT EXISTS domain_purchases_user_id_idx
  ON domain_purchases (user_id);

CREATE INDEX IF NOT EXISTS domain_purchases_renewal_idx
  ON domain_purchases (renewal_date)
  WHERE status = 'active';
