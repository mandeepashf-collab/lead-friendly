/**
 * Phase 3 rollback — rebind +1-272-219-4909 from the LiveKit-Inbound
 * SIP Connection back to the original "Lead Friendly CC" Voice API App
 * so inbound calls flow through the legacy TeXML path again.
 *
 * Use when the new LiveKit SIP inbound path misbehaves (agent doesn't
 * answer, audio issues, etc.). Designed to run in <30s start to finish.
 *
 * Usage:
 *   npx tsx scripts/rollback-inbound-sip.ts --confirm
 *   # or:
 *   npx tsx scripts/rollback-inbound-sip.ts
 *     (then type YES when prompted)
 *
 * Idempotent — safe to re-run.
 *
 * Defensive: refuses to touch +17196421726 or +14255481585 (the other
 * two numbers in the pool). Only rebinds the one number by ID, and
 * re-verifies the phone number string before mutating.
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import * as readline from "readline";

// ── .env.local loader (CRLF-safe, matches scripts/setup-livekit-sip.ts) ──
const envPath = resolve(process.cwd(), ".env.local");
try {
  const lines = readFileSync(envPath, "utf-8").split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
    if (!m) continue;
    const key = m[1].trim();
    const value = m[2].replace(/\r$/, "").trim();
    if (process.env[key] === undefined) process.env[key] = value;
  }
} catch {
  // .env.local is optional
}

// ── Hard-coded targets (intentionally NOT from env so a typo in env
// can't retarget the rollback onto a different number) ──
const PHONE_NUMBER_ID = "2935182819799860964";
const EXPECTED_PHONE = "+12722194909";

// Voice API App "Lead Friendly CC" — the pre-migration binding
const LEAD_FRIENDLY_CC_CONNECTION_ID = "2935474723410151094";

// LiveKit-Inbound SIP Connection — current binding (what we're rolling back FROM)
const LIVEKIT_INBOUND_CONNECTION_ID = "2942540376197563605";

// Paranoia: these are the other two numbers. If somehow the Telnyx API
// returns one of these for the ID above, abort.
const FORBIDDEN_NUMBERS = new Set(["+17196421726", "+14255481585"]);

const TELNYX_API_KEY = process.env.TELNYX_API_KEY ?? "";
const TELNYX_BASE = "https://api.telnyx.com/v2";

// ── HTTP helpers ──────────────────────────────────────────────
async function telnyxGetNumber(id: string): Promise<{
  id: string;
  phone_number: string;
  connection_id: string | null;
}> {
  const res = await fetch(`${TELNYX_BASE}/phone_numbers/${id}`, {
    headers: { Authorization: `Bearer ${TELNYX_API_KEY}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telnyx GET phone_numbers/${id} failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    data: { id: string; phone_number: string; connection_id?: string | null };
  };
  return {
    id: json.data.id,
    phone_number: json.data.phone_number,
    connection_id: json.data.connection_id ?? null,
  };
}

async function telnyxPatchConnectionId(id: string, connectionId: string): Promise<{
  id: string;
  phone_number: string;
  connection_id: string | null;
}> {
  const res = await fetch(`${TELNYX_BASE}/phone_numbers/${id}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${TELNYX_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ connection_id: connectionId }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telnyx PATCH phone_numbers/${id} failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as {
    data: { id: string; phone_number: string; connection_id?: string | null };
  };
  return {
    id: json.data.id,
    phone_number: json.data.phone_number,
    connection_id: json.data.connection_id ?? null,
  };
}

// ── Confirmation prompt ───────────────────────────────────────
async function confirmViaStdin(): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer: string = await new Promise((res) => {
    rl.question(
      `Type YES (case-sensitive) to rebind ${EXPECTED_PHONE} back to Lead Friendly CC: `,
      (a) => {
        rl.close();
        res(a);
      },
    );
  });
  return answer.trim() === "YES";
}

// ── Connection-ID → human label ───────────────────────────────
function labelForConnection(id: string | null): string {
  if (!id) return "(unbound)";
  if (id === LEAD_FRIENDLY_CC_CONNECTION_ID) return `Lead Friendly CC (Voice API App) [${id}]`;
  if (id === LIVEKIT_INBOUND_CONNECTION_ID) return `LiveKit-Inbound (SIP Connection) [${id}]`;
  return `unknown connection [${id}]`;
}

// ── Main ──────────────────────────────────────────────────────
async function main() {
  if (!TELNYX_API_KEY) {
    console.error("Missing TELNYX_API_KEY in env. Add it to .env.local or export it.");
    process.exit(1);
  }

  console.log("");
  console.log("Phase 3 inbound SIP rollback");
  console.log(`  Target phone number ID : ${PHONE_NUMBER_ID}`);
  console.log(`  Expected phone string  : ${EXPECTED_PHONE}`);
  console.log(`  Rolling back to        : ${labelForConnection(LEAD_FRIENDLY_CC_CONNECTION_ID)}`);
  console.log("");

  // ── 1. Fetch current binding (before-state) ──
  console.log("Reading current binding from Telnyx...");
  const before = await telnyxGetNumber(PHONE_NUMBER_ID);

  // Defensive check #1: the number string must match EXPECTED_PHONE.
  // If we somehow got a different phone, abort — do not mutate.
  if (before.phone_number !== EXPECTED_PHONE) {
    console.error(
      `ABORT: phone number ID ${PHONE_NUMBER_ID} resolves to ${before.phone_number}, ` +
        `not the expected ${EXPECTED_PHONE}. Refusing to rebind.`,
    );
    process.exit(2);
  }

  // Defensive check #2: phone string must not be in the forbidden set.
  // (Redundant given check #1, but belt-and-suspenders.)
  if (FORBIDDEN_NUMBERS.has(before.phone_number)) {
    console.error(
      `ABORT: ${before.phone_number} is in the forbidden list. This script only ` +
        `operates on ${EXPECTED_PHONE}.`,
    );
    process.exit(2);
  }

  console.log(`  Before : ${before.phone_number}`);
  console.log(`           bound to ${labelForConnection(before.connection_id)}`);
  console.log("");

  // ── 2. Idempotency check ──
  if (before.connection_id === LEAD_FRIENDLY_CC_CONNECTION_ID) {
    console.log(
      `Already bound to Lead Friendly CC — no change needed. Exiting cleanly.`,
    );
    process.exit(0);
  }

  // ── 3. Confirmation gate ──
  const autoConfirm = process.argv.includes("--confirm");
  if (!autoConfirm) {
    const ok = await confirmViaStdin();
    if (!ok) {
      console.log("Aborted (did not type YES).");
      process.exit(0);
    }
  } else {
    console.log("--confirm flag set — proceeding without prompt.");
  }

  // ── 4. Rebind ──
  console.log("");
  console.log("Patching connection_id back to Lead Friendly CC...");
  const after = await telnyxPatchConnectionId(PHONE_NUMBER_ID, LEAD_FRIENDLY_CC_CONNECTION_ID);

  // ── 5. After-state ──
  console.log("");
  console.log(`  After  : ${after.phone_number}`);
  console.log(`           bound to ${labelForConnection(after.connection_id)}`);
  console.log("");

  if (after.connection_id !== LEAD_FRIENDLY_CC_CONNECTION_ID) {
    console.error(
      "WARNING: Telnyx returned an unexpected connection_id after PATCH. " +
        "The rebind may not have taken effect. Check the portal.",
    );
    process.exit(3);
  }

  console.log("Rollback complete. Inbound calls to +1-272-219-4909 will now route");
  console.log("through the TeXML path (POST /api/voice/answer) as before migration.");
  console.log("");
}

main().catch((err) => {
  console.error("");
  console.error("Rollback FAILED:");
  if (err instanceof Error) {
    console.error(`  ${err.message}`);
  } else {
    console.error(err);
  }
  process.exit(1);
});
