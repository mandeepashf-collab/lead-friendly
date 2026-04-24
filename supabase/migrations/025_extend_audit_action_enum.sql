-- Migration 025: Extend audit_logs.action CHECK constraint to include 'overridden'.
--
-- Stage 2.2 TCPA wiring needs to audit soft-block overrides (user confirms
-- "Call anyway" through the override modal). The existing action enum covers
-- CRUD + auth events but has no value semantically appropriate for
-- "user bypassed a policy warning". Reusing 'status_changed' would bury
-- overrides in activity feeds; a separate table duplicates audit infra.
--
-- Adding 'overridden' keeps the unified audit surface and makes the dashboard
-- query trivial: WHERE action = 'overridden'.
--
-- Rollback: swap back to the original CHECK at the bottom of this file.

BEGIN;

ALTER TABLE public.audit_logs
  DROP CONSTRAINT IF EXISTS audit_logs_action_check;

ALTER TABLE public.audit_logs
  ADD CONSTRAINT audit_logs_action_check
  CHECK (action = ANY (ARRAY[
    'created'::text,
    'updated'::text,
    'deleted'::text,
    'exported'::text,
    'imported'::text,
    'logged_in'::text,
    'logged_out'::text,
    'invited'::text,
    'status_changed'::text,
    'overridden'::text
  ]));

COMMENT ON CONSTRAINT audit_logs_action_check ON public.audit_logs IS
  'Allowed audit action values. ''overridden'' added in 025 for TCPA soft-block overrides (see src/lib/tcpa/audit.ts).';

COMMIT;

-- ROLLBACK (keep commented; paste into a new migration if ever needed):
-- ALTER TABLE public.audit_logs DROP CONSTRAINT audit_logs_action_check;
-- ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_action_check
--   CHECK (action = ANY (ARRAY['created','updated','deleted','exported','imported',
--     'logged_in','logged_out','invited','status_changed']));
