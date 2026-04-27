-- supabase/migrations/027_digest_cache.sql
-- Stage 3.6.4 — Daily digest cache for AI-generated dashboard summaries.
-- One row per (organization_id, hour_bucket). Endpoint logic:
-- look up by (org, current_hour). Hit → serve cached. Miss → regenerate via Haiku, insert, return.
-- TTL is implicit via hour bucketing. Cleanup deferred to maintenance backlog.

CREATE TABLE IF NOT EXISTS public.digest_cache (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  hour_bucket     timestamptz NOT NULL,
  digest_text     text        NOT NULL CHECK (length(digest_text) > 0),
  model_string    text        NOT NULL,
  generated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT digest_cache_unique_per_hour UNIQUE (organization_id, hour_bucket)
);

CREATE INDEX IF NOT EXISTS idx_digest_cache_org_bucket_desc
  ON public.digest_cache (organization_id, hour_bucket DESC);

ALTER TABLE public.digest_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "digest_cache_read"
  ON public.digest_cache FOR SELECT
  USING (is_org_in_scope(organization_id));

CREATE POLICY "digest_cache_write"
  ON public.digest_cache FOR INSERT
  WITH CHECK (organization_id = get_user_org_id());

COMMENT ON TABLE  public.digest_cache              IS 'Stage 3.6.4 — Cached AI-generated daily digest text per org per hour bucket.';
COMMENT ON COLUMN public.digest_cache.hour_bucket  IS 'date_trunc(''hour'', generated_at). Unique per org. TTL implicit via cache miss.';
COMMENT ON COLUMN public.digest_cache.digest_text  IS 'Haiku-generated text. Plain prose, no markdown. ~100-400 chars typical.';
COMMENT ON COLUMN public.digest_cache.model_string IS 'Model that generated this row (for future A/B compare). Always claude-haiku-4-5-* in v1.';
