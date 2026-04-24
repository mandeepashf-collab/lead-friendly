/**
 * NANPA area code -> timezone resolution.
 *
 * Used by:
 *   - TCPA evaluator (quiet hours check in contact's TZ)
 *   - CSV import (populate contacts.timezone when blank)
 *   - Contact create/update API routes (fill-if-null)
 *
 * Lookup order:
 *   1. If contact has explicit timezone set, use it (never overwrite user intent)
 *   2. Extract area code from phone, look up in NANPA table
 *   3. Toll-free / unknown -> fall back to org default timezone
 *
 * Regenerate nanpa-timezones.json via scripts/build_nanpa.py when NANPA
 * adds area codes (~once/year).
 */

import nanpaData from "./nanpa-timezones.json";

type NanpaEntry = {
  state: string;
  country: "US" | "CA";
  tz: string;
  label: string;
  shared_with?: string[];
};

const NANPA: Record<string, NanpaEntry> = nanpaData as Record<string, NanpaEntry>;

const NON_GEOGRAPHIC_CODES = new Set([
  "800", "822", "833", "844", "855", "866", "877", "888", "889",
  "880", "881", "882", "883", "884", "885", "886", "887",
  "500", "521", "522", "523", "524", "525", "526", "527", "528", "529",
  "532", "533", "544", "566", "577", "588",
  "600", "622", "633", "644", "655", "677", "688",
  "700", "710", "900",
]);

export function extractAreaCode(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return null;
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (national.length !== 10) return null;
  return national.slice(0, 3);
}

export type TimezoneInference = {
  areaCode: string;
  state: string;
  country: "US" | "CA";
  tz: string;
  label: string;
};

export function inferTimezone(phone: string | null | undefined): TimezoneInference | null {
  const ac = extractAreaCode(phone);
  if (!ac) return null;
  if (NON_GEOGRAPHIC_CODES.has(ac)) return null;
  const entry = NANPA[ac];
  if (!entry) return null;
  return {
    areaCode: ac,
    state: entry.state,
    country: entry.country,
    tz: entry.tz,
    label: entry.label,
  };
}

export function resolveContactTimezone(
  contactTimezone: string | null | undefined,
  contactPhone: string | null | undefined,
  orgDefaultTz: string,
): string {
  if (contactTimezone && contactTimezone.trim()) return contactTimezone.trim();
  const inferred = inferTimezone(contactPhone);
  if (inferred) return inferred.tz;
  return orgDefaultTz;
}

export function inferState(phone: string | null | undefined): string | null {
  const info = inferTimezone(phone);
  return info?.state ?? null;
}
