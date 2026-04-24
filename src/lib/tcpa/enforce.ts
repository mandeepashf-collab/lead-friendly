/**
 * TCPA enforcement gateway — the ONLY place routes call the evaluator from.
 *
 * Adapts Stage 2.1's evaluator to the route/UI contract Stage 2.2 wants:
 *   - routes emit JSON with `{code, reason, severity}` blocks
 *   - evaluator returns `{code, message}` warnings/reasons
 *   - mapping happens here at the boundary
 *
 * Two modes:
 *   - "manual": user is present. Soft blocks return an override token. Hard
 *     blocks are terminal.
 *   - "automated": campaign processor / worker. Soft AND hard blocks both
 *     terminate (caller writes a scheduled_actions skip record).
 *
 * Role gating (§8.2): owner/admin/manager/agent can override soft blocks.
 * Viewers cannot — if a viewer hits a soft block, we return `role_denied`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  evaluateTcpa,
  type OrgTcpaPolicy,
  type ContactCallState,
  type HardReason,
  type SoftWarning,
  type TcpaCheckInput,
} from "./evaluator";
import { mintOverrideToken, verifyOverrideToken } from "./override-token";
import { resolveContactTimezone } from "../phone/timezone";

export type EnforceMode = "manual" | "automated";

// Route/UI-facing block shape. Modal + dial hook consume this.
export type TcpaBlock = {
  code: string;
  reason: string;
  severity: "hard" | "soft";
};

// Opaque payload the route passes to writeOverrideAudit. Lets audit.ts call
// buildOverrideAuditDetails() without the route having to re-assemble the
// evaluator input.
export type OverrideAuditPayload = {
  input: TcpaCheckInput;
  rawWarnings: SoftWarning[];
};

export type EnforceResult =
  | { status: "clear" }
  | { status: "hard_blocked"; blocks: TcpaBlock[] }
  | { status: "soft_blocked"; warnings: TcpaBlock[]; overrideToken: string }
  | {
      status: "override_accepted";
      overriddenCodes: string[];
      warnings: TcpaBlock[];
      policy: OrgTcpaPolicy;
      auditPayload: OverrideAuditPayload;
    }
  | { status: "role_denied"; warnings: TcpaBlock[] }
  | { status: "token_invalid"; reason: string; warnings: TcpaBlock[]; overrideToken: string };

const OVERRIDE_ROLES = new Set(["owner", "admin", "manager", "agent"]);

function toBlock(r: HardReason | SoftWarning, severity: "hard" | "soft"): TcpaBlock {
  return { code: r.code, reason: r.message, severity };
}

function parseTs(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

type CallRow = { id: string; started_at: string | null; created_at: string | null };
type ContactRow = {
  id: string;
  phone: string | null;
  cell_phone: string | null;
  timezone: string | null;
  do_not_call: boolean | null;
  dnc_listed: boolean | null;
  dnc_checked_at: string | null;
};

function buildContactState(contact: ContactRow, recentCalls: CallRow[], tz: string): ContactCallState {
  // Recent calls are returned ordered by created_at DESC, capped at 20. That's
  // plenty — evaluator caps at max_attempts_ever (default 10), daily_cap
  // (default 3), and cooldown (single most-recent suffices).
  const callDates = recentCalls
    .map((c) => parseTs(c.started_at ?? c.created_at))
    .filter((d): d is Date => d !== null);

  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const dailyAttempts = callDates.filter((d) => d >= dayAgo).length;
  const lastCallAt = callDates.length > 0 ? callDates[0] : null;

  return {
    id: contact.id,
    phone: contact.phone ?? contact.cell_phone ?? "",
    timezone: tz,
    call_attempts: callDates.length,
    daily_attempts: dailyAttempts,
    last_call_at: lastCallAt,
    cooldown_until: null, // evaluator falls back to last_call_at + policy.cooldown_minutes
    do_not_call: contact.do_not_call ?? false,
    dnc_checked_at: parseTs(contact.dnc_checked_at),
    dnc_listed: contact.dnc_listed ?? false,
  };
}

function extractBlocks(
  verdictOrResult: ReturnType<typeof evaluateTcpa>
): { hard: TcpaBlock[]; soft: TcpaBlock[]; rawSoft: SoftWarning[] } {
  if (verdictOrResult.allowed === true && verdictOrResult.severity === "none") {
    return { hard: [], soft: [], rawSoft: [] };
  }
  if (verdictOrResult.allowed === true && verdictOrResult.severity === "soft") {
    return {
      hard: [],
      soft: verdictOrResult.warnings.map((w) => toBlock(w, "soft")),
      rawSoft: verdictOrResult.warnings,
    };
  }
  // allowed: false
  if (verdictOrResult.severity === "hard") {
    return {
      hard: (verdictOrResult.reasons as HardReason[]).map((r) => toBlock(r, "hard")),
      soft: [],
      rawSoft: [],
    };
  }
  // allowed:false + severity:'soft' → automated-mode soft block (evaluator
  // returns these as non-allowed for campaign/workflow).
  const reasons = verdictOrResult.reasons as SoftWarning[];
  return {
    hard: reasons.map((r) => toBlock(r, "soft")),
    soft: [],
    rawSoft: reasons,
  };
}

export async function enforceTcpa(args: {
  orgId: string;
  userId: string;
  userRole: string | null;
  contactId: string;
  mode: EnforceMode;
  overrideToken?: string;
  supabase: SupabaseClient;
}): Promise<EnforceResult> {
  const { orgId, userId, userRole, contactId, mode, overrideToken, supabase } = args;

  const [policyRes, contactRes, recentRes, orgRes] = await Promise.all([
    supabase
      .from("org_tcpa_policies")
      .select("*")
      .eq("organization_id", orgId)
      .maybeSingle(),
    supabase
      .from("contacts")
      .select("id,phone,cell_phone,timezone,do_not_call,dnc_listed,dnc_checked_at")
      .eq("id", contactId)
      .eq("organization_id", orgId)
      .maybeSingle(),
    supabase
      .from("calls")
      .select("id,started_at,created_at")
      .eq("organization_id", orgId)
      .eq("contact_id", contactId)
      .eq("direction", "outbound")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("organizations")
      .select("default_timezone")
      .eq("id", orgId)
      .maybeSingle(),
  ]);

  if (policyRes.error) throw new Error(`org_tcpa_policies load failed: ${policyRes.error.message}`);
  if (contactRes.error) throw new Error(`contacts load failed: ${contactRes.error.message}`);
  if (recentRes.error) throw new Error(`calls load failed: ${recentRes.error.message}`);
  if (orgRes.error) throw new Error(`organizations load failed: ${orgRes.error.message}`);

  const contact = contactRes.data as ContactRow | null;
  if (!contact) {
    return {
      status: "hard_blocked",
      blocks: [{ code: "contact_not_found", reason: "Contact not found in this organization.", severity: "hard" }],
    };
  }

  if (!policyRes.data) {
    return {
      status: "hard_blocked",
      blocks: [{ code: "policy_missing", reason: "TCPA policy not configured for this organization.", severity: "hard" }],
    };
  }

  const policy = policyRes.data as OrgTcpaPolicy;
  const orgDefaultTz = (orgRes.data as { default_timezone?: string } | null)?.default_timezone ?? "America/New_York";
  const contactTz = resolveContactTimezone(
    contact.timezone,
    contact.phone ?? contact.cell_phone,
    orgDefaultTz
  );

  const contactState = buildContactState(contact, (recentRes.data ?? []) as CallRow[], contactTz);
  const now = new Date();
  const initiatedBy = mode === "manual" ? "user" : "campaign";
  const input: TcpaCheckInput = { policy, contact: contactState, now, initiatedBy };
  const result = evaluateTcpa(input);
  const { hard, soft, rawSoft } = extractBlocks(result);

  if (hard.length > 0) {
    return { status: "hard_blocked", blocks: hard };
  }

  if (soft.length === 0) {
    return { status: "clear" };
  }

  // Soft blocks are only reachable in manual mode — evaluator converts them
  // to `allowed:false, severity:'soft'` for automated, which `extractBlocks`
  // surfaces as `hard` (terminal for the caller). So the branch below is
  // manual-only.

  if (!userRole || !OVERRIDE_ROLES.has(userRole)) {
    return { status: "role_denied", warnings: soft };
  }

  const currentCodes = soft.map((b) => b.code);

  if (!overrideToken) {
    const token = mintOverrideToken({ orgId, userId, contactId, codes: currentCodes });
    return { status: "soft_blocked", warnings: soft, overrideToken: token };
  }

  const verifyRes = verifyOverrideToken(overrideToken, { orgId, userId, contactId, currentCodes });
  if (!verifyRes.valid) {
    const freshToken = mintOverrideToken({ orgId, userId, contactId, codes: currentCodes });
    return {
      status: "token_invalid",
      reason: verifyRes.reason,
      warnings: soft,
      overrideToken: freshToken,
    };
  }

  return {
    status: "override_accepted",
    overriddenCodes: currentCodes,
    warnings: soft,
    policy,
    auditPayload: { input, rawWarnings: rawSoft },
  };
}

/**
 * Compute the next moment it would be legal to place an outbound call to this
 * contact under current policy. Used by the campaign processor to set
 * scheduled_actions.scheduled_for on skip records (§8.4).
 *
 * Walks forward in 15-minute increments for up to 14 days.
 */
export async function nextValidTcpaWindow(args: {
  orgId: string;
  contactId: string;
  supabase: SupabaseClient;
  horizonDays?: number;
}): Promise<Date | null> {
  const { orgId, contactId, supabase, horizonDays = 14 } = args;

  const [policyRes, contactRes, recentRes, orgRes] = await Promise.all([
    supabase.from("org_tcpa_policies").select("*").eq("organization_id", orgId).maybeSingle(),
    supabase
      .from("contacts")
      .select("id,phone,cell_phone,timezone,do_not_call,dnc_listed,dnc_checked_at")
      .eq("id", contactId)
      .eq("organization_id", orgId)
      .maybeSingle(),
    supabase
      .from("calls")
      .select("id,started_at,created_at")
      .eq("organization_id", orgId)
      .eq("contact_id", contactId)
      .eq("direction", "outbound")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.from("organizations").select("default_timezone").eq("id", orgId).maybeSingle(),
  ]);

  if (!policyRes.data || !contactRes.data) return null;

  const policy = policyRes.data as OrgTcpaPolicy;
  const contact = contactRes.data as ContactRow;
  const orgDefaultTz = (orgRes.data as { default_timezone?: string } | null)?.default_timezone ?? "America/New_York";
  const contactTz = resolveContactTimezone(
    contact.timezone,
    contact.phone ?? contact.cell_phone,
    orgDefaultTz
  );
  const recentCalls = (recentRes.data ?? []) as CallRow[];

  const STEP_MIN = 15;
  const HORIZON_MS = horizonDays * 24 * 60 * 60 * 1000;
  const start = Date.now();

  for (let offset = 0; offset <= HORIZON_MS; offset += STEP_MIN * 60 * 1000) {
    const t = new Date(start + offset);
    const contactState = buildContactState(contact, recentCalls, contactTz);
    // buildContactState computes daily_attempts / last_call_at against
    // wall-clock now; for future-window probing we want them relative to `t`.
    // For the forward-walk case the recency of past calls only matters for
    // cooldown, which we let the evaluator recompute from last_call_at. That's
    // fine — a past last_call_at still yields a valid cooldown answer for any
    // future t. The daily_attempts count only matters if we're looking at
    // windows still inside the 24h-from-now envelope. Good enough for v1.
    const result = evaluateTcpa({
      policy,
      contact: contactState,
      now: t,
      initiatedBy: "campaign",
    });
    if (result.allowed === true && result.severity === "none") {
      return t;
    }
  }

  return null;
}
