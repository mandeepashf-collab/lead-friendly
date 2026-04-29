/**
 * Workflow V1 dispatcher.
 *
 * Loads `workflows` rows matching (organization_id, trigger_type, status='active')
 * and executes step[0] for each. Phase 1 supports only `send_sms` steps.
 *
 * Design notes:
 *   - Single step execution per workflow (no chains). Multi-step support is
 *     deferred to Phase 2 along with the 1h-reminder mechanic via cron +
 *     scheduled_actions.
 *   - SMS goes through `sendSms` from lib/telnyx (server-to-server, no HTTP
 *     roundtrip — avoids the auth/middleware redirect we hit with
 *     sip-outbound earlier today).
 *   - Best-effort: failures are logged, never thrown. Callers (e.g.
 *     /api/appointments/book) wrap this in their own try/catch but should
 *     not depend on it succeeding.
 *   - Variable substitution uses single-brace `{first_name}` to match the
 *     existing demo workflow row's format. Standardizing on the agent
 *     prompt's `{{contact.first_name}}` is a Phase 2 cleanup.
 */

import { createClient } from "@supabase/supabase-js";
import { sendSms } from "@/lib/telnyx";

// ── Types ───────────────────────────────────────────────────────

export type TriggerType =
  | "appointment_booked"
  | "appointment_cancelled"
  | "call_completed"
  | "contact_created"
  | "contact_status_changed"
  | "contact_tag_added"
  | "form_submitted"
  | "opportunity_won"
  | "opportunity_lost"
  | "opportunity_stage_changed"
  | "invoice_paid"
  | "manual"
  | "webhook"
  | "schedule";

export interface DispatchContext {
  organizationId: string;
  contactId: string | null;
  // Free-form payload — different triggers attach different data.
  // For appointment_booked: { appointmentId, appointmentDate, startTime, title }
  payload: Record<string, unknown>;
}

interface WorkflowStep {
  id: string;
  type: "send_sms" | "wait" | "send_email" | "update_status" | "assign_agent" | "condition";
  config: Record<string, unknown>;
}

interface WorkflowRow {
  id: string;
  organization_id: string;
  steps: WorkflowStep[] | null;
  total_runs: number | null;
}

interface DispatchSummary {
  matched: number;
  fired: number;
  failed: number;
}

// ── Public API ──────────────────────────────────────────────────

/**
 * Fire all active workflows for the org whose `trigger_type` matches.
 * Returns a summary; individual failures are logged via console.error
 * and do not abort other workflows.
 */
export async function triggerWorkflows(
  trigger: TriggerType,
  ctx: DispatchContext,
): Promise<DispatchSummary> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: workflows, error } = await supabase
    .from("workflows")
    .select("id, organization_id, steps, total_runs")
    .eq("organization_id", ctx.organizationId)
    .eq("trigger_type", trigger)
    .eq("status", "active");

  if (error) {
    console.error(`[workflow] load failed for ${trigger}:`, error.message);
    return { matched: 0, fired: 0, failed: 0 };
  }

  const rows = (workflows ?? []) as WorkflowRow[];
  if (rows.length === 0) {
    return { matched: 0, fired: 0, failed: 0 };
  }

  // Resolve contact + org once (used by all workflows for substitution)
  const subContext = await loadSubstitutionContext(supabase, ctx);

  let fired = 0;
  let failed = 0;

  for (const wf of rows) {
    try {
      const steps = Array.isArray(wf.steps) ? wf.steps : [];
      if (steps.length === 0) {
        console.warn(`[workflow] ${wf.id} has no steps; skipping`);
        continue;
      }

      const step = steps[0]; // Phase 1: only step[0]
      const ok = await executeStep(step, subContext);

      if (ok) {
        fired++;
        // Best-effort: bump total_runs and last_run_at
        await supabase
          .from("workflows")
          .update({
            total_runs: (wf.total_runs ?? 0) + 1,
            last_run_at: new Date().toISOString(),
          })
          .eq("id", wf.id);
      } else {
        failed++;
      }
    } catch (err) {
      failed++;
      console.error(`[workflow] ${wf.id} threw:`, err);
    }
  }

  console.log(
    `[workflow] dispatched ${trigger}: ${fired} fired, ${failed} failed (of ${rows.length} matched)`,
  );

  return { matched: rows.length, fired, failed };
}

// ── Step execution ──────────────────────────────────────────────

interface SubContext {
  contact: {
    first_name: string;
    last_name: string;
    phone: string | null;
  } | null;
  business: {
    name: string;
  };
  appointment: {
    date_human: string;     // "Thursday, April 30"
    time_human: string;     // "11:00 AM PT"
    raw_date: string | null;
    raw_start: string | null;
  } | null;
}

async function executeStep(step: WorkflowStep, ctx: SubContext): Promise<boolean> {
  if (step.type === "send_sms") {
    return executeSendSms(step, ctx);
  }
  // Phase 1: only send_sms is supported. Other types are silently skipped
  // (logged, not failed) so existing demo rows with `wait` etc don't blow up.
  console.log(`[workflow] step type '${step.type}' not yet supported; skipped`);
  return false;
}

async function executeSendSms(step: WorkflowStep, ctx: SubContext): Promise<boolean> {
  const cfg = step.config as { message?: string };
  const rawMessage = cfg.message ?? "";

  if (!rawMessage) {
    console.warn("[workflow] send_sms step has no message; skipping");
    return false;
  }
  if (!ctx.contact?.phone) {
    console.warn("[workflow] send_sms step skipped: contact has no phone");
    return false;
  }

  const message = substituteWorkflowVars(rawMessage, ctx);
  const result = await sendSms({ to: ctx.contact.phone, text: message });

  if (!result.ok) {
    console.error(`[workflow] sendSms failed: ${result.error}`);
    return false;
  }

  return true;
}

// ── Substitution ────────────────────────────────────────────────

function substituteWorkflowVars(text: string, ctx: SubContext): string {
  const c = ctx.contact;
  const a = ctx.appointment;
  return text
    .replace(/\{\s*first_name\s*\}/g, c?.first_name || "there")
    .replace(/\{\s*last_name\s*\}/g, c?.last_name || "")
    .replace(/\{\s*business_name\s*\}/g, ctx.business.name || "us")
    .replace(/\{\s*appointment_date\s*\}/g, a?.date_human || "")
    .replace(/\{\s*appointment_time\s*\}/g, a?.time_human || "");
}

// ── Substitution context loader ─────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadSubstitutionContext(supabase: any, ctx: DispatchContext): Promise<SubContext> {
  // Org name
  const { data: org } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", ctx.organizationId)
    .maybeSingle();

  // Contact
  let contact: SubContext["contact"] = null;
  if (ctx.contactId) {
    const { data: c } = await supabase
      .from("contacts")
      .select("first_name, last_name, phone")
      .eq("id", ctx.contactId)
      .maybeSingle();
    if (c) {
      contact = {
        first_name: (c.first_name as string | null) || "",
        last_name: (c.last_name as string | null) || "",
        phone: (c.phone as string | null) || null,
      };
    }
  }

  // Appointment context — only present for appointment_booked triggers
  const apptDate = ctx.payload.appointmentDate as string | undefined; // "YYYY-MM-DD"
  const apptStart = ctx.payload.startTime as string | undefined;     // "HH:MM" or "HH:MM:SS"
  let appointment: SubContext["appointment"] = null;
  if (apptDate && apptStart) {
    appointment = {
      date_human: formatDateHuman(apptDate),
      time_human: formatTimeHuman(apptStart),
      raw_date: apptDate,
      raw_start: apptStart,
    };
  }

  return {
    contact,
    business: { name: (org?.name as string | null) || "us" },
    appointment,
  };
}

// ── Date/time formatting (Pacific Time) ─────────────────────────

function formatDateHuman(yyyymmdd: string): string {
  // Parse as local date components — avoid the new Date("YYYY-MM-DD") UTC
  // pitfall we hit in the calendar UI fix earlier today.
  const [yStr, mStr, dStr] = yyyymmdd.split("-");
  const y = Number(yStr), m = Number(mStr), d = Number(dStr);
  if (!y || !m || !d) return yyyymmdd;
  // Construct a noon-PT instant on that calendar date so DST transitions
  // don't shift the day. Noon is safely inside any DST window.
  const dt = new Date(Date.UTC(y, m - 1, d, 19, 0, 0)); // 19:00 UTC = ~12:00 PT
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(dt);
}

function formatTimeHuman(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(":");
  const h = Number(hStr), m = Number(mStr || "0");
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const period = h < 12 ? "AM" : "PM";
  const h12 = ((h + 11) % 12) + 1;
  const mm = String(m).padStart(2, "0");
  return `${h12}:${mm} ${period} PT`;
}
