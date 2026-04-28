import { describe, it, expect } from "vitest";
import {
  evaluateTcpa,
  buildOverrideAuditDetails,
  type OrgTcpaPolicy,
  type ContactCallState,
} from "./evaluator";

function defaultPolicy(overrides: Partial<OrgTcpaPolicy> = {}): OrgTcpaPolicy {
  return {
    organization_id: "org-1",
    quiet_hours_start: "08:00",
    quiet_hours_end: "21:00",
    dnc_check_enabled: false,
    max_attempts_ever: 10,
    daily_cap_per_contact: 3,
    allow_sunday: false,
    cooldown_minutes: 240,
    ...overrides,
  };
}

function defaultContact(overrides: Partial<ContactCallState> = {}): ContactCallState {
  return {
    id: "contact-1",
    phone: "+14255481585",
    timezone: "America/Los_Angeles",
    call_attempts: 0,
    daily_attempts: 0,
    last_call_at: null,
    cooldown_until: null,
    do_not_call: false,
    dnc_checked_at: null,
    dnc_listed: false,
    ...overrides,
  };
}

const NOON_WEDNESDAY_UTC = new Date("2026-04-23T19:00:00Z");
const EARLY_MORNING_WEDNESDAY_UTC = new Date("2026-04-23T14:00:00Z");
const LATE_NIGHT_TUESDAY_UTC = new Date("2026-04-23T05:00:00Z");
const NOON_SUNDAY_UTC = new Date("2026-04-26T19:00:00Z");

describe("evaluateTcpa - happy path", () => {
  it("allows a normal call during business hours with no prior attempts", () => {
    const r = evaluateTcpa({
      policy: defaultPolicy(),
      contact: defaultContact(),
      now: NOON_WEDNESDAY_UTC,
      initiatedBy: "user",
    });
    expect(r.allowed).toBe(true);
    if (r.allowed) expect(r.severity).toBe("none");
  });
});

describe("evaluateTcpa - hard blocks (no override)", () => {
  it("blocks when contact.do_not_call is true", () => {
    const r = evaluateTcpa({
      policy: defaultPolicy(),
      contact: defaultContact({ do_not_call: true }),
      now: NOON_WEDNESDAY_UTC,
      initiatedBy: "user",
    });
    expect(r.allowed).toBe(false);
    if (!r.allowed) {
      expect(r.reasons.some((x) => "code" in x && x.code === "dnc_listed")).toBe(true);
    }
  });

  it("blocks when federal DNC cache shows listed", () => {
    const r = evaluateTcpa({
      policy: defaultPolicy({ dnc_check_enabled: true }),
      contact: defaultContact({
        dnc_listed: true,
        dnc_checked_at: new Date("2026-04-20T00:00:00Z"),
      }),
      now: NOON_WEDNESDAY_UTC,
      initiatedBy: "user",
    });
    expect(r.allowed).toBe(false);
    if (!r.allowed) {
      expect(r.reasons.some((x) => "code" in x && x.code === "dnc_listed")).toBe(true);
    }
  });

  it("fails closed when DNC check is enabled but never checked", () => {
    const r = evaluateTcpa({
      policy: defaultPolicy({ dnc_check_enabled: true }),
      contact: defaultContact({ dnc_checked_at: null, dnc_listed: false }),
      now: NOON_WEDNESDAY_UTC,
      initiatedBy: "user",
    });
    expect(r.allowed).toBe(false);
    if (!r.allowed) {
      expect(r.reasons.some((x) => "code" in x && x.code === "dnc_stale")).toBe(true);
    }
  });

  it("fails closed when DNC cache is older than 30 days", () => {
    const r = evaluateTcpa({
      policy: defaultPolicy({ dnc_check_enabled: true }),
      contact: defaultContact({
        dnc_listed: false,
        dnc_checked_at: new Date("2026-03-01T00:00:00Z"),
      }),
      now: NOON_WEDNESDAY_UTC,
      initiatedBy: "user",
    });
    expect(r.allowed).toBe(false);
    if (!r.allowed) {
      expect(r.reasons.some((x) => "code" in x && x.code === "dnc_stale")).toBe(true);
    }
  });

  it("allows when DNC cache is fresh and not listed", () => {
    const r = evaluateTcpa({
      policy: defaultPolicy({ dnc_check_enabled: true }),
      contact: defaultContact({
        dnc_listed: false,
        dnc_checked_at: new Date("2026-04-15T00:00:00Z"),
      }),
      now: NOON_WEDNESDAY_UTC,
      initiatedBy: "user",
    });
    expect(r.allowed).toBe(true);
  });

  it("blocks when contact has no phone", () => {
    const r = evaluateTcpa({
      policy: defaultPolicy(),
      contact: defaultContact({ phone: "" }),
      now: NOON_WEDNESDAY_UTC,
      initiatedBy: "user",
    });
    expect(r.allowed).toBe(false);
    if (!r.allowed) {
      expect(r.reasons.some((x) => "code" in x && x.code === "missing_phone")).toBe(true);
    }
  });

  it("blocks when contact has no timezone resolved", () => {
    const r = evaluateTcpa({
      policy: defaultPolicy(),
      contact: defaultContact({ timezone: "" }),
      now: NOON_WEDNESDAY_UTC,
      initiatedBy: "user",
    });
    expect(r.allowed).toBe(false);
    if (!r.allowed) {
      expect(r.reasons.some((x) => "code" in x && x.code === "missing_timezone")).toBe(true);
    }
  });
});

describe("evaluateTcpa - soft blocks (org-editable)", () => {
  it("soft warns before 08:00 contact local time", () => {
    const r = evaluateTcpa({
      policy: defaultPolicy(),
      contact: defaultContact(),
      now: EARLY_MORNING_WEDNESDAY_UTC,
      initiatedBy: "user",
    });
    expect(r.allowed).toBe(true);
    if (r.allowed && r.severity === "soft") {
      expect(r.requiresOverride).toBe(true);
      expect(r.warnings.some((w) => w.code === "quiet_hours")).toBe(true);
    }
  });

  it("soft warns after 21:00 contact local time", () => {
    const r = evaluateTcpa({
      policy: defaultPolicy(),
      contact: defaultContact(),
      now: LATE_NIGHT_TUESDAY_UTC,
      initiatedBy: "user",
    });
    expect(r.allowed).toBe(true);
    if (r.allowed && r.severity === "soft") {
      expect(r.requiresOverride).toBe(true);
      expect(r.warnings.some((w) => w.code === "quiet_hours")).toBe(true);
    }
  });

  it("soft warns when lifetime attempts reached max", () => {
    const r = evaluateTcpa({
      policy: defaultPolicy(),
      contact: defaultContact({ call_attempts: 10 }),
      now: NOON_WEDNESDAY_UTC,
      initiatedBy: "user",
    });
    expect(r.allowed).toBe(true);
    if (r.allowed && r.severity === "soft") {
      expect(r.requiresOverride).toBe(true);
      expect(r.warnings.some((w) => w.code === "max_attempts_ever")).toBe(true);
    }
  });

  it("warns and requires override when daily cap reached, initiated by user", () => {
    const r = evaluateTcpa({
      policy: defaultPolicy(),
      contact: defaultContact({ daily_attempts: 3 }),
      now: NOON_WEDNESDAY_UTC,
      initiatedBy: "user",
    });
    expect(r.allowed).toBe(true);
    if (r.allowed && r.severity === "soft") {
      expect(r.requiresOverride).toBe(true);
      expect(r.warnings.some((w) => w.code === "daily_cap")).toBe(true);
    }
  });

  it("blocks campaigns when daily cap reached (no override for automated)", () => {
    const r = evaluateTcpa({
      policy: defaultPolicy(),
      contact: defaultContact({ daily_attempts: 3 }),
      now: NOON_WEDNESDAY_UTC,
      initiatedBy: "campaign",
    });
    expect(r.allowed).toBe(false);
    if (!r.allowed) {
      expect(r.severity).toBe("soft");
      expect(r.reasons.some((x) => "code" in x && x.code === "daily_cap")).toBe(true);
    }
  });

  it("blocks workflows when daily cap reached (no override for automated)", () => {
    const r = evaluateTcpa({
      policy: defaultPolicy(),
      contact: defaultContact({ daily_attempts: 3 }),
      now: NOON_WEDNESDAY_UTC,
      initiatedBy: "workflow",
    });
    expect(r.allowed).toBe(false);
  });

  it("warns on Sunday when allow_sunday=false, user-initiated", () => {
    const r = evaluateTcpa({
      policy: defaultPolicy(),
      contact: defaultContact(),
      now: NOON_SUNDAY_UTC,
      initiatedBy: "user",
    });
    expect(r.allowed).toBe(true);
    if (r.allowed && r.severity === "soft") {
      expect(r.warnings.some((w) => w.code === "sunday")).toBe(true);
    }
  });

  it("no Sunday warning when allow_sunday=true", () => {
    const r = evaluateTcpa({
      policy: defaultPolicy({ allow_sunday: true }),
      contact: defaultContact(),
      now: NOON_SUNDAY_UTC,
      initiatedBy: "user",
    });
    expect(r.allowed).toBe(true);
    if (r.allowed) expect(r.severity).toBe("none");
  });

  it("warns on cooldown when last_call_at is within cooldown window", () => {
    const lastCall = new Date(NOON_WEDNESDAY_UTC.getTime() - 60 * 60 * 1000);
    const r = evaluateTcpa({
      policy: defaultPolicy({ cooldown_minutes: 240 }),
      contact: defaultContact({ last_call_at: lastCall }),
      now: NOON_WEDNESDAY_UTC,
      initiatedBy: "user",
    });
    expect(r.allowed).toBe(true);
    if (r.allowed && r.severity === "soft") {
      expect(r.warnings.some((w) => w.code === "recent_call")).toBe(true);
    }
  });

  it("warns on cooldown when cooldown_until is in the future", () => {
    const future = new Date(NOON_WEDNESDAY_UTC.getTime() + 60 * 60 * 1000);
    const r = evaluateTcpa({
      policy: defaultPolicy(),
      contact: defaultContact({ cooldown_until: future }),
      now: NOON_WEDNESDAY_UTC,
      initiatedBy: "user",
    });
    expect(r.allowed).toBe(true);
    if (r.allowed && r.severity === "soft") {
      expect(r.warnings.some((w) => w.code === "cooldown")).toBe(true);
    }
  });

  it("no cooldown warning when last_call_at is older than cooldown", () => {
    const lastCall = new Date(NOON_WEDNESDAY_UTC.getTime() - 5 * 60 * 60 * 1000);
    const r = evaluateTcpa({
      policy: defaultPolicy({ cooldown_minutes: 240 }),
      contact: defaultContact({ last_call_at: lastCall }),
      now: NOON_WEDNESDAY_UTC,
      initiatedBy: "user",
    });
    expect(r.allowed).toBe(true);
    if (r.allowed) expect(r.severity).toBe("none");
  });
});

describe("evaluateTcpa - precedence", () => {
  it("returns all hard reasons when multiple hard blocks hit", () => {
    const r = evaluateTcpa({
      policy: defaultPolicy({ dnc_check_enabled: true }),
      contact: defaultContact({
        do_not_call: true,
        dnc_checked_at: null,
      }),
      now: NOON_WEDNESDAY_UTC,
      initiatedBy: "user",
    });
    expect(r.allowed).toBe(false);
    if (!r.allowed) {
      expect(r.severity).toBe("hard");
      const codes = r.reasons.map((x) => ("code" in x ? x.code : ""));
      expect(codes).toContain("dnc_listed");
      expect(codes).toContain("dnc_stale");
    }
  });

  it("hard blocks trump soft warnings", () => {
    const r = evaluateTcpa({
      policy: defaultPolicy(),
      contact: defaultContact({
        do_not_call: true,
        daily_attempts: 5,
      }),
      now: NOON_WEDNESDAY_UTC,
      initiatedBy: "user",
    });
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.severity).toBe("hard");
  });

  it("multiple soft warnings accumulate", () => {
    const lastCall = new Date(NOON_SUNDAY_UTC.getTime() - 30 * 60 * 1000);
    const r = evaluateTcpa({
      policy: defaultPolicy(),
      contact: defaultContact({
        daily_attempts: 3,
        last_call_at: lastCall,
      }),
      now: NOON_SUNDAY_UTC,
      initiatedBy: "user",
    });
    expect(r.allowed).toBe(true);
    if (r.allowed && r.severity === "soft") {
      const codes = r.warnings.map((w) => w.code);
      expect(codes).toContain("daily_cap");
      expect(codes).toContain("sunday");
      expect(codes).toContain("recent_call");
    }
  });
});

describe("evaluateTcpa - timezone edge cases", () => {
  const ALL_CALLABLE_UTC = new Date("2026-04-23T16:00:00Z");

  it("Eastern contact is callable at 12:00 ET", () => {
    const r = evaluateTcpa({
      policy: defaultPolicy(),
      contact: defaultContact({ timezone: "America/New_York" }),
      now: ALL_CALLABLE_UTC,
      initiatedBy: "user",
    });
    expect(r.allowed).toBe(true);
  });

  it("Pacific contact is callable at 09:00 PT", () => {
    const r = evaluateTcpa({
      policy: defaultPolicy(),
      contact: defaultContact({ timezone: "America/Los_Angeles" }),
      now: ALL_CALLABLE_UTC,
      initiatedBy: "user",
    });
    expect(r.allowed).toBe(true);
  });

  const MORNING_UTC = new Date("2026-04-23T13:00:00Z");

  it("Eastern contact callable at 09:00 ET; Pacific contact soft-warned at 06:00 PT", () => {
    const eastern = evaluateTcpa({
      policy: defaultPolicy(),
      contact: defaultContact({ timezone: "America/New_York" }),
      now: MORNING_UTC,
      initiatedBy: "user",
    });
    expect(eastern.allowed).toBe(true);

    const pacific = evaluateTcpa({
      policy: defaultPolicy(),
      contact: defaultContact({ timezone: "America/Los_Angeles" }),
      now: MORNING_UTC,
      initiatedBy: "user",
    });
    expect(pacific.allowed).toBe(true);
    if (pacific.allowed && pacific.severity === "soft") {
      expect(pacific.warnings.some((w) => w.code === "quiet_hours")).toBe(true);
    }
  });

  it("Arizona (no DST) still respects quiet hours correctly in April", () => {
    const r = evaluateTcpa({
      policy: defaultPolicy(),
      contact: defaultContact({ timezone: "America/Phoenix" }),
      now: new Date("2026-04-23T15:00:00Z"),
      initiatedBy: "user",
    });
    expect(r.allowed).toBe(true);
  });

  it("Hawaii (no DST) at 08:00 HST is callable", () => {
    const r = evaluateTcpa({
      policy: defaultPolicy(),
      contact: defaultContact({ timezone: "Pacific/Honolulu" }),
      now: new Date("2026-04-23T18:00:00Z"),
      initiatedBy: "user",
    });
    expect(r.allowed).toBe(true);
  });

  it("Hawaii at 05:00 HST (15:00 UTC) soft-warns - before 08:00", () => {
    const r = evaluateTcpa({
      policy: defaultPolicy(),
      contact: defaultContact({ timezone: "Pacific/Honolulu" }),
      now: new Date("2026-04-23T15:00:00Z"),
      initiatedBy: "user",
    });
    expect(r.allowed).toBe(true);
    if (r.allowed && r.severity === "soft") {
      expect(r.warnings.some((w) => w.code === "quiet_hours")).toBe(true);
    }
  });
});

describe("buildOverrideAuditDetails", () => {
  it("snapshots policy and contact state at override time", () => {
    const input = {
      policy: defaultPolicy(),
      contact: defaultContact({ daily_attempts: 3, call_attempts: 5 }),
      now: NOON_WEDNESDAY_UTC,
      initiatedBy: "user" as const,
    };
    const details = buildOverrideAuditDetails(
      input,
      [{ code: "daily_cap", message: "..." }],
      "Customer called us back and asked for follow-up",
    );
    expect(details.overridden_warnings).toEqual(["daily_cap"]);
    expect(details.user_reason).toBe("Customer called us back and asked for follow-up");
    expect((details.policy_snapshot as Record<string, unknown>).daily_cap_per_contact).toBe(3);
    expect((details.contact_state as Record<string, unknown>).call_attempts).toBe(5);
    expect(details.evaluated_at).toBe(NOON_WEDNESDAY_UTC.toISOString());
  });
});
