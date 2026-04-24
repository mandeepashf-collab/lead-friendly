/**
 * TCPA override token — HMAC-signed, 5-minute TTL.
 *
 * Flow:
 *   1. Route hits enforceTcpa(), evaluator returns softBlocks[].
 *   2. enforceTcpa() mints a token binding (orgId, contactId, userId, sortedCodes, iat).
 *   3. Client receives 409 + token, shows modal, user confirms.
 *   4. Client retries the POST with overrideToken.
 *   5. enforceTcpa() re-evaluates AND verifies token — if soft codes changed
 *      between mint and retry (policy edit, time passed), token is rejected
 *      and a fresh one is issued. No stale-replay.
 *
 * Why HMAC not DB: avoids a round-trip and a scheduled cleanup job. Stateless.
 * Env: TCPA_OVERRIDE_SECRET (32+ bytes, set in Vercel + .env.local).
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_TTL_SECONDS = 5 * 60; // 5 minutes
const VERSION = "v1";

export type OverrideTokenPayload = {
  v: string;           // version
  orgId: string;
  userId: string;
  contactId: string;
  codes: string[];     // sorted ascending; compared exactly on verify
  iat: number;         // issued-at, unix seconds
};

export type TokenVerifyResult =
  | { valid: true; payload: OverrideTokenPayload }
  | { valid: false; reason: "malformed" | "bad_signature" | "expired" | "code_mismatch" | "org_mismatch" | "contact_mismatch" | "user_mismatch" };

function getSecret(): string {
  const s = process.env.TCPA_OVERRIDE_SECRET;
  if (!s || s.length < 32) {
    throw new Error(
      "TCPA_OVERRIDE_SECRET env var missing or too short (need 32+ bytes). " +
      "Add to Vercel project env + .env.local."
    );
  }
  return s;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

function sign(body: string): string {
  return b64url(createHmac("sha256", getSecret()).update(body).digest());
}

export function mintOverrideToken(args: {
  orgId: string;
  userId: string;
  contactId: string;
  codes: string[];
}): string {
  const payload: OverrideTokenPayload = {
    v: VERSION,
    orgId: args.orgId,
    userId: args.userId,
    contactId: args.contactId,
    codes: [...args.codes].sort(),
    iat: Math.floor(Date.now() / 1000),
  };
  const body = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = sign(body);
  return `${body}.${sig}`;
}

export function verifyOverrideToken(
  token: string,
  expected: { orgId: string; userId: string; contactId: string; currentCodes: string[] }
): TokenVerifyResult {
  const parts = token.split(".");
  if (parts.length !== 2) return { valid: false, reason: "malformed" };

  const [body, sig] = parts;
  const expectedSig = sign(body);

  // constant-time comparison
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { valid: false, reason: "bad_signature" };
  }

  let payload: OverrideTokenPayload;
  try {
    payload = JSON.parse(b64urlDecode(body).toString("utf8"));
  } catch {
    return { valid: false, reason: "malformed" };
  }

  if (payload.v !== VERSION) return { valid: false, reason: "malformed" };

  const now = Math.floor(Date.now() / 1000);
  if (now - payload.iat > TOKEN_TTL_SECONDS) {
    return { valid: false, reason: "expired" };
  }

  if (payload.orgId !== expected.orgId) return { valid: false, reason: "org_mismatch" };
  if (payload.userId !== expected.userId) return { valid: false, reason: "user_mismatch" };
  if (payload.contactId !== expected.contactId) return { valid: false, reason: "contact_mismatch" };

  // Exact set equality on sorted codes. If policy changed between mint and
  // retry (e.g. admin tightened daily_cap), codes will differ → reject,
  // caller mints a fresh token.
  const tokenCodes = [...payload.codes].sort();
  const currentCodes = [...expected.currentCodes].sort();
  if (
    tokenCodes.length !== currentCodes.length ||
    tokenCodes.some((c, i) => c !== currentCodes[i])
  ) {
    return { valid: false, reason: "code_mismatch" };
  }

  return { valid: true, payload };
}
