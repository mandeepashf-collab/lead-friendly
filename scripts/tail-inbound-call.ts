/**
 * Phase 3 test helper — show the last ~30s of activity from both sides
 * of an inbound SIP call so you can diagnose "Maya didn't answer" quickly.
 *
 *   - Railway: agent-worker logs (how LiveKit saw the call, worker errors)
 *   - Telnyx : recent CDRs / call history for +12722194909 (did Telnyx
 *              route to LiveKit at all?)
 *
 * Degrades gracefully: if either CLI / API is unavailable, prints the
 * portal URL to check manually instead of failing.
 *
 * Usage:
 *   npx tsx scripts/tail-inbound-call.ts
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { spawnSync } from "child_process";

// ── .env.local loader (matches scripts/setup-livekit-sip.ts) ──
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
  // optional
}

const TARGET_NUMBER = "+12722194909";
const TELNYX_API_KEY = process.env.TELNYX_API_KEY ?? "";
const AGENT_WORKER_DIR = resolve(process.cwd(), "agent-worker");

const RAILWAY_PROJECT_URL =
  "https://railway.com/project/2bc9bad7-856f-4b59-9f23-e6cf6859d067";
const TELNYX_CALL_HISTORY_URL =
  "https://portal.telnyx.com/#/app/debugging/calls";

// ── Railway tail ──────────────────────────────────────────────
function tailRailway(): void {
  console.log("─── Railway (agent-worker) — last 50 lines ────────────────────");
  // `railway logs` with no follow flag returns recent log lines and exits.
  // --tail is not supported on all railway CLI versions; try plain first.
  const cmd = process.platform === "win32" ? "railway.cmd" : "railway";
  const result = spawnSync(cmd, ["logs"], {
    cwd: AGENT_WORKER_DIR,
    encoding: "utf-8",
    timeout: 20_000,
  });

  if (result.error) {
    console.log(`  (railway CLI not available: ${result.error.message})`);
    console.log(`  Open the dashboard instead:`);
    console.log(`    ${RAILWAY_PROJECT_URL}`);
    console.log("");
    return;
  }

  if (result.status !== 0) {
    console.log(`  (railway exited ${result.status})`);
    if (result.stderr) console.log(`  stderr: ${result.stderr.slice(0, 300)}`);
    console.log(`  Open the dashboard instead: ${RAILWAY_PROJECT_URL}`);
    console.log("");
    return;
  }

  // Trim to last ~50 lines so it fits on screen.
  const lines = (result.stdout ?? "").split(/\r?\n/);
  const tail = lines.slice(-50);
  for (const line of tail) console.log(line);
  console.log("");
}

// ── Telnyx recent calls ───────────────────────────────────────
interface TelnyxCdr {
  id?: string;
  start_time?: string;
  end_time?: string;
  from?: string;
  to?: string;
  direction?: string;
  hangup_cause?: string;
  duration?: number;
  call_control_id?: string;
}

async function tailTelnyx(): Promise<void> {
  console.log(`─── Telnyx — recent CDRs for ${TARGET_NUMBER} ────────────────`);

  if (!TELNYX_API_KEY) {
    console.log("  (TELNYX_API_KEY not set — skipping API call)");
    console.log(`  Open the portal instead: ${TELNYX_CALL_HISTORY_URL}`);
    console.log("");
    return;
  }

  // Window: last 5 minutes (we said "last 30s" but CDRs can lag a bit;
  // 5-min window is a safe middle ground that stays readable).
  const since = new Date(Date.now() - 5 * 60_000).toISOString();

  // Telnyx CDR endpoint. If this returns 4xx/5xx, skip and show portal URL.
  const url =
    `https://api.telnyx.com/v2/detail_records/phone_numbers/voice` +
    `?filter[to]=${encodeURIComponent(TARGET_NUMBER)}` +
    `&filter[start_time][gte]=${encodeURIComponent(since)}` +
    `&page[size]=10`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${TELNYX_API_KEY}` },
    });
  } catch (err) {
    console.log(`  (Telnyx API network error: ${err instanceof Error ? err.message : err})`);
    console.log(`  Open the portal instead: ${TELNYX_CALL_HISTORY_URL}`);
    console.log("");
    return;
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.log(`  (Telnyx CDR API returned ${res.status} — may not be enabled on this account)`);
    if (body) console.log(`  ${body.slice(0, 200)}`);
    console.log(`  Open the portal instead: ${TELNYX_CALL_HISTORY_URL}`);
    console.log("");
    return;
  }

  let payload: { data?: TelnyxCdr[] };
  try {
    payload = (await res.json()) as { data?: TelnyxCdr[] };
  } catch {
    console.log("  (could not parse Telnyx response)");
    console.log(`  Open the portal: ${TELNYX_CALL_HISTORY_URL}`);
    console.log("");
    return;
  }

  const cdrs = payload.data ?? [];
  if (cdrs.length === 0) {
    console.log(`  No calls to ${TARGET_NUMBER} in the last 5 minutes.`);
    console.log(`  If a call just ended, CDRs can lag 30-60s — refresh in a bit.`);
    console.log(`  Portal: ${TELNYX_CALL_HISTORY_URL}`);
    console.log("");
    return;
  }

  for (const c of cdrs) {
    console.log(
      `  ${c.start_time ?? "?"} → ${c.end_time ?? "active"}` +
        `  from=${c.from ?? "?"} to=${c.to ?? "?"}` +
        `  dir=${c.direction ?? "?"}` +
        `  hangup=${c.hangup_cause ?? "?"}` +
        `  dur=${c.duration ?? "?"}s`,
    );
    if (c.call_control_id) console.log(`    call_control_id: ${c.call_control_id}`);
  }
  console.log("");
}

// ── Main ──────────────────────────────────────────────────────
async function main() {
  console.log("");
  console.log(`Phase 3 inbound test — tailing both sides for ${TARGET_NUMBER}`);
  console.log("");

  tailRailway();
  await tailTelnyx();

  console.log("Done. If both sides look clean, the call was handled correctly.");
  console.log("If Railway shows no job but Telnyx shows an inbound call, the SIP");
  console.log("dispatch rule didn't fire — check LiveKit Cloud project settings.");
  console.log("");
}

main().catch((err) => {
  console.error("Tail helper failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
