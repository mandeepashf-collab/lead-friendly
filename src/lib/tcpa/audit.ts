/**
 * TCPA override audit writer.
 *
 * Builds on Stage 2.1's buildOverrideAuditDetails() to produce the canonical
 * details jsonb (policy_snapshot, contact_state, etc.), then merges the
 * Stage 2.2 keys the audit UI reads (codes, note, path, contact_display_name).
 *
 * Callsite contract: invoke AFTER the call row has been inserted so we have
 * calls.id to set resource_id. If the call insert fails after override
 * acceptance, skip the audit write.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildOverrideAuditDetails } from "./evaluator";
import type { OverrideAuditPayload } from "./enforce";

export type { OverrideAuditPayload };

export type OverridePath = "softphone_manual" | "sip_outbound_manual";

export async function writeOverrideAudit(args: {
  supabase: SupabaseClient;
  orgId: string;
  userId: string;
  userName: string | null;
  contactId: string;
  contactDisplayName: string;
  contactPhoneE164: string;
  callId: string;
  auditPayload: OverrideAuditPayload;
  path: OverridePath;
  note?: string | null;
  ipAddress?: string | null;
}): Promise<void> {
  const {
    supabase, orgId, userId, userName, contactId, contactDisplayName,
    contactPhoneE164, callId, auditPayload, path, note, ipAddress,
  } = args;

  const codes = auditPayload.rawWarnings.map((w) => w.code);

  // Stage 2.1 shape (policy_snapshot, contact_state, evaluated_at, ...)
  const base = buildOverrideAuditDetails(
    auditPayload.input,
    auditPayload.rawWarnings,
    note ?? ""
  );

  // Merge the Stage 2.2 UI-visible keys. The audit list page reads
  // details.codes / details.note / details.path.
  const details = {
    ...base,
    codes,
    note: note ?? null,
    path,
    contact_display_name: contactDisplayName,
    contact_id: contactId, // duplicate from base; explicit for UI reads
  };

  const resourceName = `${contactDisplayName} — ${formatPhoneForDisplay(contactPhoneE164)}`.slice(0, 200);

  const { error } = await supabase.from("audit_logs").insert({
    organization_id: orgId,
    user_id: userId,
    user_name: userName,
    action: "overridden",
    resource_type: "call",
    resource_name: resourceName,
    resource_id: callId,
    details,
    ip_address: ipAddress ?? null,
  });

  if (error) {
    // Don't throw — audit failure must not break a user-initiated call.
    console.error("[tcpa-audit] writeOverrideAudit failed", {
      orgId, callId, err: error.message,
    });
  }
}

function formatPhoneForDisplay(e164: string): string {
  const digits = e164.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return e164;
}

// --- Stats used by the Compliance tab ---

export type OverrideStats = {
  today: number;
  week: number;
  byCode: Record<string, number>;
  skippedByAutomationWeek: number;
};

export async function getOverrideStats(args: {
  supabase: SupabaseClient;
  orgId: string;
  orgTimezone: string;
}): Promise<OverrideStats> {
  const { supabase, orgId, orgTimezone } = args;

  // Compute "start of today" in org's timezone. audit_logs.created_at is UTC;
  // "today" depends on the org's local day boundary.
  const nowInOrgTz = new Date(new Date().toLocaleString("en-US", { timeZone: orgTimezone }));
  const todayStart = new Date(nowInOrgTz);
  todayStart.setHours(0, 0, 0, 0);
  const tzOffsetMs = new Date().getTime() - nowInOrgTz.getTime();
  const todayStartUtc = new Date(todayStart.getTime() + tzOffsetMs);

  const weekStartUtc = new Date(todayStartUtc.getTime() - 6 * 24 * 60 * 60 * 1000);

  const [todayRes, weekRes, skippedRes] = await Promise.all([
    supabase.from("audit_logs")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("action", "overridden")
      .eq("resource_type", "call")
      .gte("created_at", todayStartUtc.toISOString()),
    supabase.from("audit_logs")
      .select("details")
      .eq("organization_id", orgId)
      .eq("action", "overridden")
      .eq("resource_type", "call")
      .gte("created_at", weekStartUtc.toISOString()),
    supabase.from("scheduled_actions")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("status", "skipped_compliance")
      .gte("created_at", weekStartUtc.toISOString()),
  ]);

  const byCode: Record<string, number> = {};
  for (const row of (weekRes.data ?? []) as { details: { codes?: string[] } | null }[]) {
    const codes = row.details?.codes ?? [];
    for (const c of codes) byCode[c] = (byCode[c] ?? 0) + 1;
  }

  return {
    today: todayRes.count ?? 0,
    week: (weekRes.data ?? []).length,
    byCode,
    // scheduled_actions may not exist yet — guard against that at runtime.
    skippedByAutomationWeek: skippedRes.error ? 0 : (skippedRes.count ?? 0),
  };
}
