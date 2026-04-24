/**
 * TCPA compliance evaluator - HYBRID policy model.
 *
 * Call sites: softphone manual dial, AI agent manual outbound, campaign launcher,
 *             workflow scheduled step, /automations retry scheduler.
 *
 * Hard blocks (federal rule - no override):
 *   - Quiet hours (default 08:00-21:00 in contact TZ)
 *   - DNC Registry (contacts.do_not_call = true OR federal list hit)
 *   - Max attempts ever (default 10)
 *
 * Soft blocks (per-org editable, UI shows warning + requires override for manual paths):
 *   - Daily cap per contact (default 3)
 *   - Sunday calling (default off)
 *   - Cooldown minutes between attempts (default 240 = 4h)
 *
 * For automated paths (campaign / workflow / scheduled retry), NO override is allowed -
 * soft blocks skip the contact and log; the caller is expected to treat `allowed=false`
 * as "skip, don't retry".
 *
 * The evaluator is a PURE FUNCTION - no DB, no Date.now() sourced internally.
 * All inputs (policy, contact, now) are injected. This makes testing trivial and
 * lets us run the same function in the Next.js route handlers AND the Railway
 * worker without any shared DB layer.
 */

export type InitiatedBy = "user" | "ai_agent" | "campaign" | "workflow";

export type OrgTcpaPolicy = {
  organization_id: string;
  quiet_hours_start: string;
  quiet_hours_end: string;
  dnc_check_enabled: boolean;
  max_attempts_ever: number;
  daily_cap_per_contact: number;
  allow_sunday: boolean;
  cooldown_minutes: number;
};

export type ContactCallState = {
  id: string;
  phone: string;
  timezone: string;
  call_attempts: number;
  daily_attempts: number;
  last_call_at: Date | null;
  cooldown_until: Date | null;
  do_not_call: boolean;
  dnc_checked_at: Date | null;
  dnc_listed: boolean;
};

export type TcpaCheckInput = {
  policy: OrgTcpaPolicy;
  contact: ContactCallState;
  now: Date;
  initiatedBy: InitiatedBy;
};

export type TcpaCheckResult =
  | { allowed: true; severity: "none" }
  | {
      allowed: true;
      severity: "soft";
      warnings: SoftWarning[];
      requiresOverride: boolean;
    }
  | {
      allowed: false;
      severity: "hard" | "soft";
      reasons: HardReason[] | SoftWarning[];
    };

export type HardReasonCode =
  | "quiet_hours"
  | "dnc_listed"
  | "dnc_stale"
  | "max_attempts_ever"
  | "missing_phone"
  | "missing_timezone";

export type SoftWarningCode =
  | "daily_cap"
  | "sunday"
  | "cooldown"
  | "recent_call";

export type HardReason = { code: HardReasonCode; message: string };
export type SoftWarning = { code: SoftWarningCode; message: string };

const DNC_CACHE_TTL_DAYS = 30;

function getTzParts(now: Date, tz: string): { hour: number; minute: number; dayOfWeek: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "numeric",
    weekday: "short",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const hour = parseInt(parts.find((p) => p.type === "hour")!.value, 10);
  const minute = parseInt(parts.find((p) => p.type === "minute")!.value, 10);
  const weekdayStr = parts.find((p) => p.type === "weekday")!.value;
  const dayOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekdayStr);
  return { hour: hour === 24 ? 0 : hour, minute, dayOfWeek };
}

function parseHHMM(s: string): { hour: number; minute: number } {
  const [h, m] = s.split(":").map((n) => parseInt(n, 10));
  return { hour: h, minute: m };
}

function isInQuietHours(
  contactLocal: { hour: number; minute: number },
  quietStart: string,
  quietEnd: string,
): boolean {
  const { hour, minute } = contactLocal;
  const start = parseHHMM(quietStart);
  const end = parseHHMM(quietEnd);
  const nowMin = hour * 60 + minute;
  const startMin = start.hour * 60 + start.minute;
  const endMin = end.hour * 60 + end.minute;
  return !(nowMin >= startMin && nowMin < endMin);
}

export function evaluateTcpa(input: TcpaCheckInput): TcpaCheckResult {
  const { policy, contact, now, initiatedBy } = input;
  const hard: HardReason[] = [];

  if (!contact.phone) {
    hard.push({ code: "missing_phone", message: "Contact has no phone number." });
    return { allowed: false, severity: "hard", reasons: hard };
  }
  if (!contact.timezone) {
    hard.push({
      code: "missing_timezone",
      message: "Cannot determine contact's timezone. Set contact timezone or verify phone.",
    });
  }

  if (contact.timezone) {
    const tzParts = getTzParts(now, contact.timezone);
    if (isInQuietHours(tzParts, policy.quiet_hours_start, policy.quiet_hours_end)) {
      hard.push({
        code: "quiet_hours",
        message: `Outside allowed calling hours (${policy.quiet_hours_start}-${policy.quiet_hours_end} ${contact.timezone}).`,
      });
    }
  }

  if (contact.do_not_call) {
    hard.push({ code: "dnc_listed", message: "Contact is marked Do Not Call." });
  }
  if (policy.dnc_check_enabled) {
    if (contact.dnc_listed) {
      hard.push({
        code: "dnc_listed",
        message: "Number is on the National Do Not Call Registry.",
      });
    } else if (contact.dnc_checked_at) {
      const ageDays =
        (now.getTime() - contact.dnc_checked_at.getTime()) / (1000 * 60 * 60 * 24);
      if (ageDays > DNC_CACHE_TTL_DAYS) {
        hard.push({
          code: "dnc_stale",
          message: `DNC check is stale (${Math.floor(ageDays)} days old). Refresh before calling.`,
        });
      }
    } else {
      hard.push({
        code: "dnc_stale",
        message: "DNC registry has not been checked for this contact.",
      });
    }
  }

  if (contact.call_attempts >= policy.max_attempts_ever) {
    hard.push({
      code: "max_attempts_ever",
      message: `Maximum ${policy.max_attempts_ever} attempts reached for this contact.`,
    });
  }

  if (hard.length > 0) {
    return { allowed: false, severity: "hard", reasons: hard };
  }

  const warnings: SoftWarning[] = [];
  const tzParts = getTzParts(now, contact.timezone);

  if (contact.daily_attempts >= policy.daily_cap_per_contact) {
    warnings.push({
      code: "daily_cap",
      message: `Daily cap of ${policy.daily_cap_per_contact} calls reached for this contact.`,
    });
  }

  if (!policy.allow_sunday && tzParts.dayOfWeek === 0) {
    warnings.push({
      code: "sunday",
      message: "Sunday calling is disabled for your organization.",
    });
  }

  if (contact.cooldown_until && contact.cooldown_until > now) {
    warnings.push({
      code: "cooldown",
      message: `Contact is in cooldown until ${contact.cooldown_until.toISOString()}.`,
    });
  } else if (contact.last_call_at) {
    const minutesSinceLastCall =
      (now.getTime() - contact.last_call_at.getTime()) / (1000 * 60);
    if (minutesSinceLastCall < policy.cooldown_minutes) {
      const remaining = Math.ceil(policy.cooldown_minutes - minutesSinceLastCall);
      warnings.push({
        code: "recent_call",
        message: `Called ${Math.floor(minutesSinceLastCall)} min ago; cooldown is ${policy.cooldown_minutes} min (${remaining} min remaining).`,
      });
    }
  }

  if (warnings.length === 0) {
    return { allowed: true, severity: "none" };
  }

  const isManual = initiatedBy === "user" || initiatedBy === "ai_agent";
  if (isManual) {
    return { allowed: true, severity: "soft", warnings, requiresOverride: true };
  }
  return { allowed: false, severity: "soft", reasons: warnings };
}

export function buildOverrideAuditDetails(
  input: TcpaCheckInput,
  warnings: SoftWarning[],
  reason: string,
): Record<string, unknown> {
  return {
    contact_id: input.contact.id,
    contact_phone: input.contact.phone,
    contact_timezone: input.contact.timezone,
    initiated_by: input.initiatedBy,
    overridden_warnings: warnings.map((w) => w.code),
    user_reason: reason,
    policy_snapshot: {
      daily_cap_per_contact: input.policy.daily_cap_per_contact,
      allow_sunday: input.policy.allow_sunday,
      cooldown_minutes: input.policy.cooldown_minutes,
    },
    contact_state: {
      call_attempts: input.contact.call_attempts,
      daily_attempts: input.contact.daily_attempts,
      last_call_at: input.contact.last_call_at?.toISOString() ?? null,
      cooldown_until: input.contact.cooldown_until?.toISOString() ?? null,
    },
    evaluated_at: input.now.toISOString(),
  };
}
