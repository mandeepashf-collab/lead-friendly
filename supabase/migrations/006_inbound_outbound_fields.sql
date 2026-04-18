-- Add direction-specific prompt and greeting columns to ai_agents
-- These allow agents to have different scripts for inbound vs outbound calls

ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS inbound_prompt TEXT;
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS inbound_greeting TEXT;
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS outbound_prompt TEXT;
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS outbound_greeting TEXT;

-- Copy existing system_prompt → outbound_prompt and greeting_message → outbound_greeting
-- for any agents that already exist (safe to run multiple times)
UPDATE ai_agents
SET outbound_prompt = system_prompt
WHERE outbound_prompt IS NULL AND system_prompt IS NOT NULL;

UPDATE ai_agents
SET outbound_greeting = greeting_message
WHERE outbound_greeting IS NULL AND greeting_message IS NOT NULL;

UPDATE ai_agents
SET inbound_greeting = greeting_message
WHERE inbound_greeting IS NULL AND greeting_message IS NOT NULL;
