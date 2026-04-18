-- Migration 005: AI Agents GHL-quality upgrade
-- Adds new columns to ai_agents for advanced voice agent configuration
-- All columns are nullable with sensible defaults so existing agents keep working

-- ═══ New agent configuration columns ═══

-- Personality type (professional, friendly, assertive)
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS personality TEXT DEFAULT 'friendly';

-- Company name for agent context
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS company_name TEXT;

-- Max call duration in minutes (default 10)
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS max_duration_mins INTEGER DEFAULT 10;

-- Alias: some code references max_call_duration
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS max_call_duration INTEGER DEFAULT 15;

-- Objection handling scripts
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS objection_handling TEXT;

-- Closing script for wrapping up calls
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS closing_script TEXT;

-- Knowledge base content (FAQ, policies, pricing, etc.)
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS knowledge_base TEXT;

-- Transfer number — where to send calls when AI can't help
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS transfer_number TEXT;

-- Do-not-call phrases (comma-separated)
-- When caller says any of these, agent ends the call gracefully
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS dnc_phrases TEXT;

-- Agent role description (e.g., "appointment setter", "lead qualifier")
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS role TEXT;

-- Response latency target in ms (for monitoring)
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS response_latency INTEGER;

-- ═══ Call outcome tracking ═══
-- Add outcome column to calls for better analytics
ALTER TABLE calls ADD COLUMN IF NOT EXISTS outcome TEXT;
-- Add sentiment column for call quality tracking
ALTER TABLE calls ADD COLUMN IF NOT EXISTS sentiment TEXT;
-- Add duration_seconds for easy duration queries
ALTER TABLE calls ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;

-- ═══ Indexes ═══
CREATE INDEX IF NOT EXISTS idx_ai_agents_org_status ON ai_agents(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_calls_outcome ON calls(outcome) WHERE outcome IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_calls_agent ON calls(ai_agent_id) WHERE ai_agent_id IS NOT NULL;
