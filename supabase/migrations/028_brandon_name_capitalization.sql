-- 028_brandon_name_capitalization.sql
--
-- Stage 3.6.6 polish — capitalize the seeded "Brandon" agent name.
-- The default agent (created via 012_brandon_default_agent.sql) shipped
-- with name = 'brandon' (lowercase). User-facing surfaces (header, eval
-- labels, drawer) display this name verbatim, so the lowercase reads as
-- a typo. Code references in mp-appt-setter-v1.ts already use "Brandon".
--
-- Targets the specific seeded UUID with a guard on the current name to
-- avoid touching any user-renamed row.

UPDATE ai_agents
SET name = 'Brandon'
WHERE id = 'ebd227e0-b33d-4b25-b5cf-aca3617f7ce4'
  AND name = 'brandon';
