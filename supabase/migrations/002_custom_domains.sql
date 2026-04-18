-- ── Custom Domains Table ─────────────────────────────────────────
-- Stores white-label custom domain records for agency users.
-- Each domain goes through a DNS verification flow before activation.

CREATE TABLE IF NOT EXISTS custom_domains (
  id                  UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  agency_id           UUID        NOT NULL,
  user_id             UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  domain              TEXT        NOT NULL UNIQUE,
  verification_token  TEXT        NOT NULL DEFAULT 'lf-verify-' || substr(gen_random_uuid()::text, 1, 12),
  status              TEXT        NOT NULL DEFAULT 'pending'
                                  CHECK (status IN ('pending', 'verified', 'active', 'failed')),
  cname_verified      BOOLEAN     DEFAULT false,
  txt_verified        BOOLEAN     DEFAULT false,
  ssl_status          TEXT        DEFAULT 'pending',
  created_at          TIMESTAMPTZ DEFAULT now(),
  verified_at         TIMESTAMPTZ,
  updated_at          TIMESTAMPTZ DEFAULT now()
);

-- Row Level Security
ALTER TABLE custom_domains ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own domains"
  ON custom_domains FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own domains"
  ON custom_domains FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own domains"
  ON custom_domains FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own domains"
  ON custom_domains FOR DELETE
  USING (auth.uid() = user_id);

-- Auto-update updated_at on changes
CREATE OR REPLACE FUNCTION update_custom_domains_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER custom_domains_updated_at
  BEFORE UPDATE ON custom_domains
  FOR EACH ROW EXECUTE FUNCTION update_custom_domains_updated_at();
