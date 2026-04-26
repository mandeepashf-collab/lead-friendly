// scripts/verify-inbound-sip.ts
// Ephemeral — do not commit. Read-only LiveKit SIP verification.
//
// NOTE: spec called for `import 'dotenv/config'`, but dotenv is not a
// dependency of this repo. Using the same manual .env.local loader that
// scripts/setup-livekit-sip.ts uses — behavior is identical.

import { readFileSync } from "fs";
import { resolve } from "path";
import { SipClient } from "livekit-server-sdk";

// ── .env.local loader (CRLF-safe) ────────────────────────────────────────────
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
  // .env.local optional
}

const EXPECTED_TRUNK_ID = "ST_B53NtoUbZnwJ";
const EXPECTED_NUMBER = "+12722194909";
const EXPECTED_AGENT_NAME = "lead-friendly";
const OTHER_NUMBERS = ["+17196421726", "+14255481585"];

async function main() {
  const url = process.env.LIVEKIT_URL;
  const key = process.env.LIVEKIT_API_KEY;
  const secret = process.env.LIVEKIT_API_SECRET;
  if (!url || !key || !secret) {
    console.error("Missing LIVEKIT_* env vars");
    process.exit(1);
  }
  // SipClient wants https://, not wss://.
  const httpUrl = url.replace("wss://", "https://").replace("ws://", "http://");
  const sip = new SipClient(httpUrl, key, secret);

  // --- Trunks ---
  const trunks = await sip.listSipInboundTrunk();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const target = trunks.find((t: any) => t.sipTrunkId === EXPECTED_TRUNK_ID);

  console.log("=== STEP 2: INBOUND TRUNK ===");
  if (!target) {
    console.log(`HARD FAIL: trunk ${EXPECTED_TRUNK_ID} not found`);
    console.log(
      "All inbound trunks:",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      trunks.map((t: any) => ({ id: t.sipTrunkId, name: t.name, numbers: t.numbers })),
    );
  } else {
    console.log(`Trunk: ${target.sipTrunkId} (${target.name})`);
    console.log(`Numbers: ${JSON.stringify(target.numbers)}`);
    console.log(
      `+12722194909 present: ${target.numbers?.includes(EXPECTED_NUMBER) ? "YES" : "NO"}`,
    );
    for (const n of OTHER_NUMBERS) {
      console.log(`${n} present: ${target.numbers?.includes(n) ? "YES" : "NO"}`);
    }
  }

  // --- Dispatch rules ---
  console.log("\n=== STEP 3: DISPATCH RULES ===");
  const rules = await sip.listSipDispatchRule();
  // A rule matches our trunk if trunkIds is empty (catch-all) or includes EXPECTED_TRUNK_ID
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const matching = rules.filter((r: any) => {
    const ids = r.trunkIds ?? [];
    return ids.length === 0 || ids.includes(EXPECTED_TRUNK_ID);
  });

  if (matching.length === 0) {
    console.log("HARD FAIL: no dispatch rule covers this trunk");
    console.log("All rules:", JSON.stringify(rules, null, 2));
  } else {
    for (const r of matching) {
      console.log(`Rule: ${r.sipDispatchRuleId} (${r.name ?? "(no name)"})`);
      console.log(
        `  trunkIds: ${JSON.stringify(r.trunkIds ?? [])} ${
          (r.trunkIds ?? []).length === 0 ? "(catch-all)" : ""
        }`,
      );
      console.log(`  rule body: ${JSON.stringify(r.rule, null, 2)}`);
      const agents = r.roomConfig?.agents ?? [];
      console.log(`  roomConfig.agents: ${JSON.stringify(agents)}`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const agentNames = agents.map((a: any) => a.agentName);
      console.log(`  agent_name values: ${JSON.stringify(agentNames)}`);
      const match = agentNames.includes(EXPECTED_AGENT_NAME);
      console.log(
        `  Case-sensitive match with worker ("${EXPECTED_AGENT_NAME}"): ${
          match ? "YES" : "NO"
        }`,
      );
    }
  }

  // --- Verdict ---
  console.log("\n=== VERDICT ===");
  const trunkOk = target && target.numbers?.includes(EXPECTED_NUMBER);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ruleOk = matching.some((r: any) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (r.roomConfig?.agents ?? []).some((a: any) => a.agentName === EXPECTED_AGENT_NAME),
  );
  if (trunkOk && ruleOk) console.log("GO for test call");
  else if (!trunkOk && !ruleOk)
    console.log("NO-GO: trunk missing number AND no matching dispatch rule");
  else if (!trunkOk) console.log("NO-GO: trunk does not have +12722194909 attached");
  else console.log('NO-GO: no dispatch rule with matching agent_name "lead-friendly"');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
