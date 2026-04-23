-- Migration 016: Agent Evals System
-- Creates agent_evals (user-authored criteria) and eval_runs (judge verdicts)
-- Companion to P1 #3. Architecture memo: LLM-as-judge, Claude Haiku 4.5, per-agent criteria.
--
-- Safe to re-run: all CREATEs use IF NOT EXISTS where supported.
-- Rollback: DROP TABLE eval_runs; DROP TABLE agent_evals; DROP FUNCTION set_agent_evals_org_id();

-- ──────────────────────────────────────────────────────────────────────────────
-- Table: agent_evals — the criterion definitions
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_evals (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id            UUID NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- User-authored criterion in plain English
  title               TEXT NOT NULL,
  criterion           TEXT NOT NULL,

  -- Provenance
  source              TEXT NOT NULL DEFAULT 'user',
  source_ref          UUID,                        -- nullable FK-by-convention (not enforced,
                                                   -- to avoid dropping evals if annotation is deleted)
  generation_batch_id UUID,                        -- groups AI-generated evals produced together

  -- Lifecycle
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT agent_evals_source_check
    CHECK (source IN ('user', 'ai_generated', 'from_annotation')),
  CONSTRAINT agent_evals_criterion_length_check
    CHECK (LENGTH(criterion) BETWEEN 10 AND 2000),
  CONSTRAINT agent_evals_title_length_check
    CHECK (LENGTH(title) BETWEEN 2 AND 120)
);

CREATE INDEX IF NOT EXISTS idx_agent_evals_agent_active
  ON agent_evals(agent_id, created_at DESC) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_agent_evals_source
  ON agent_evals(source);
CREATE INDEX IF NOT EXISTS idx_agent_evals_batch
  ON agent_evals(generation_batch_id) WHERE generation_batch_id IS NOT NULL;

-- Auto-populate organization_id from ai_agents if omitted on insert.
-- Simplifies API payloads — callers only need agent_id.
CREATE OR REPLACE FUNCTION set_agent_evals_org_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    SELECT organization_id INTO NEW.organization_id
    FROM ai_agents WHERE id = NEW.agent_id;
    IF NEW.organization_id IS NULL THEN
      RAISE EXCEPTION 'Could not derive organization_id from agent_id %', NEW.agent_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS agent_evals_set_org_id ON agent_evals;
CREATE TRIGGER agent_evals_set_org_id
  BEFORE INSERT ON agent_evals
  FOR EACH ROW EXECUTE FUNCTION set_agent_evals_org_id();

-- updated_at bump
CREATE OR REPLACE FUNCTION agent_evals_bump_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS agent_evals_updated_at ON agent_evals;
CREATE TRIGGER agent_evals_updated_at
  BEFORE UPDATE ON agent_evals
  FOR EACH ROW EXECUTE FUNCTION agent_evals_bump_updated_at();

-- ──────────────────────────────────────────────────────────────────────────────
-- Table: eval_runs — judge verdicts
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS eval_runs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  eval_id             UUID NOT NULL REFERENCES agent_evals(id) ON DELETE CASCADE,
  call_id             UUID NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  agent_id            UUID NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,

  -- Judge output
  verdict             TEXT NOT NULL,
  reason              TEXT NOT NULL,
  confidence          NUMERIC(3,2),

  -- Snapshot of the criterion text at run time, so historical results remain readable
  -- even if the user later edits the eval
  criterion_snapshot  TEXT NOT NULL,

  -- Judge metadata
  model               TEXT NOT NULL DEFAULT 'claude-haiku-4-5-20251001',
  input_tokens        INTEGER,
  output_tokens       INTEGER,
  latency_ms          INTEGER,
  raw_response        JSONB,

  -- Error tracking
  status              TEXT NOT NULL DEFAULT 'completed',
  error_message       TEXT,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT eval_runs_verdict_check
    CHECK (verdict IN ('PASS', 'FAIL', 'INCONCLUSIVE')),
  CONSTRAINT eval_runs_status_check
    CHECK (status IN ('completed', 'failed', 'running')),

  -- One verdict per (eval, call) — re-runs UPDATE this row via ON CONFLICT
  CONSTRAINT eval_runs_eval_call_unique UNIQUE (eval_id, call_id)
);

CREATE INDEX IF NOT EXISTS idx_eval_runs_agent_created
  ON eval_runs(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_eval_runs_call
  ON eval_runs(call_id);
CREATE INDEX IF NOT EXISTS idx_eval_runs_eval_created
  ON eval_runs(eval_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_eval_runs_verdict
  ON eval_runs(agent_id, verdict) WHERE status = 'completed';

-- ──────────────────────────────────────────────────────────────────────────────
-- RLS — mirror ai_agents visibility
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE agent_evals ENABLE ROW LEVEL SECURITY;
ALTER TABLE eval_runs  ENABLE ROW LEVEL SECURITY;

-- agent_evals: users see & modify evals for agents in their org
DROP POLICY IF EXISTS agent_evals_select ON agent_evals;
CREATE POLICY agent_evals_select ON agent_evals
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS agent_evals_insert ON agent_evals;
CREATE POLICY agent_evals_insert ON agent_evals
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS agent_evals_update ON agent_evals;
CREATE POLICY agent_evals_update ON agent_evals
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS agent_evals_delete ON agent_evals;
CREATE POLICY agent_evals_delete ON agent_evals
  FOR DELETE USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- eval_runs: read via agent_id → org join. Writes only happen server-side
-- through the service-role client in the judge route, so we don't need an INSERT policy
-- for authenticated users (service role bypasses RLS).
DROP POLICY IF EXISTS eval_runs_select ON eval_runs;
CREATE POLICY eval_runs_select ON eval_runs
  FOR SELECT USING (
    agent_id IN (
      SELECT id FROM ai_agents WHERE organization_id IN (
        SELECT organization_id FROM profiles WHERE id = auth.uid()
      )
    )
  );

-- ──────────────────────────────────────────────────────────────────────────────
-- Done
-- ──────────────────────────────────────────────────────────────────────────────
COMMENT ON TABLE agent_evals IS
  'Per-agent evaluation criteria authored by users or auto-generated from agent instructions. See src/app/api/agents/[id]/evals/.';
COMMENT ON TABLE eval_runs IS
  'Results of running an agent_eval against a call transcript via Claude Haiku 4.5 as judge.';
