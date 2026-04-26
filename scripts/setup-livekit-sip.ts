/**
 * One-off setup: provision LiveKit SIP trunks + dispatch rule for the
 * Lead Friendly phone-call migration from Telnyx TeXML to LiveKit SIP.
 *
 * Run once: `npx tsx scripts/setup-livekit-sip.ts`
 *
 * Idempotent: if a trunk or dispatch rule with the same name already exists,
 * the script skips creation and prints the existing ID. Safe to re-run.
 *
 * After running, paste the printed IDs into Vercel env vars:
 *   LIVEKIT_SIP_INBOUND_TRUNK_ID
 *   LIVEKIT_SIP_OUTBOUND_TRUNK_ID
 *   LIVEKIT_SIP_OUTBOUND_ADDRESS (if not already set)
 *
 * Reads from .env.local so local runs work with no extra shell exports.
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import {
  SipClient,
  type SipDispatchRuleIndividual,
  type CreateSipDispatchRuleOptions,
  type CreateSipInboundTrunkOptions,
  type CreateSipOutboundTrunkOptions,
} from "livekit-server-sdk";
import { RoomAgentDispatch, RoomConfiguration, SIPTransport } from "@livekit/protocol";

// ── .env.local loader (CRLF-safe) ────────────────────────────────────────────
// Mirrors scripts/update-brandon-prompt.ts so `npx tsx` picks up env vars
// without needing a shell export or the `dotenv` dependency.
const envPath = resolve(process.cwd(), ".env.local");
try {
  const lines = readFileSync(envPath, "utf-8").split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
    if (!m) continue;
    const key = m[1].trim();
    const value = m[2].replace(/\r$/, "").trim();
    // Don't overwrite real shell-set vars (useful if someone runs this in CI).
    if (process.env[key] === undefined) process.env[key] = value;
  }
} catch {
  // .env.local is optional — real envs (Vercel, CI) may set directly.
}

// ── Config ───────────────────────────────────────────────────────────────────
const LK_URL = process.env.LIVEKIT_URL ?? "";
const LK_API_KEY = process.env.LIVEKIT_API_KEY ?? "";
const LK_API_SECRET = process.env.LIVEKIT_API_SECRET ?? "";
const TELNYX_SIP_USERNAME = process.env.TELNYX_SIP_USERNAME ?? "";
const TELNYX_SIP_PASSWORD = process.env.TELNYX_SIP_PASSWORD ?? "";
const OUTBOUND_ADDRESS = process.env.LIVEKIT_SIP_OUTBOUND_ADDRESS ?? "sip.telnyx.com";

const INBOUND_TRUNK_NAME = "lead-friendly-inbound";
const OUTBOUND_TRUNK_NAME = "lead-friendly-outbound";
const DISPATCH_RULE_NAME = "lead-friendly-inbound-default";
const AGENT_NAME = "lead-friendly";

const PHONE_NUMBERS = [
  "+17196421726",
  "+14255481585",
  "+12722194909",
] as const;

// ── Client construction (matches src/lib/livekit/server.ts pattern) ──────────
function getSipClient(): SipClient {
  if (!LK_URL || !LK_API_KEY || !LK_API_SECRET) {
    throw new Error(
      "Missing LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET. " +
        "Set them in .env.local or export them before running.",
    );
  }
  // SipClient wants https://, not wss://. Same normalization as
  // getAgentDispatchClient() in src/lib/livekit/server.ts.
  const httpUrl = LK_URL.replace("wss://", "https://").replace("ws://", "http://");
  return new SipClient(httpUrl, LK_API_KEY, LK_API_SECRET);
}

// ── Setup steps ──────────────────────────────────────────────────────────────

async function ensureInboundTrunk(sip: SipClient): Promise<string> {
  const existing = await sip.listSipInboundTrunk();
  const match = existing.find((t) => t.name === INBOUND_TRUNK_NAME);
  if (match) {
    console.log(
      `[skip] Inbound trunk "${INBOUND_TRUNK_NAME}" already exists: ${match.sipTrunkId}`,
    );
    return match.sipTrunkId;
  }

  const opts: CreateSipInboundTrunkOptions = {
    // No auth on inbound — Telnyx is the only sender and we trust the
    // number list + carrier-signed From headers. If we tighten later,
    // add authUsername/authPassword here.
    metadata: JSON.stringify({ source: "setup-livekit-sip", env: "production" }),
  };

  const created = await sip.createSipInboundTrunk(
    INBOUND_TRUNK_NAME,
    [...PHONE_NUMBERS],
    opts,
  );
  console.log(
    `[created] Inbound trunk "${INBOUND_TRUNK_NAME}": ${created.sipTrunkId}`,
  );
  return created.sipTrunkId;
}

async function ensureOutboundTrunk(sip: SipClient): Promise<string> {
  if (!TELNYX_SIP_USERNAME || !TELNYX_SIP_PASSWORD) {
    throw new Error(
      "Missing TELNYX_SIP_USERNAME / TELNYX_SIP_PASSWORD in env. " +
        "These are required for the outbound trunk to authenticate with Telnyx.",
    );
  }

  const existing = await sip.listSipOutboundTrunk();
  const match = existing.find((t) => t.name === OUTBOUND_TRUNK_NAME);
  if (match) {
    console.log(
      `[skip] Outbound trunk "${OUTBOUND_TRUNK_NAME}" already exists: ${match.sipTrunkId}`,
    );
    return match.sipTrunkId;
  }

  const opts: CreateSipOutboundTrunkOptions = {
    transport: SIPTransport.SIP_TRANSPORT_AUTO,
    authUsername: TELNYX_SIP_USERNAME,
    authPassword: TELNYX_SIP_PASSWORD,
    metadata: JSON.stringify({ source: "setup-livekit-sip", env: "production" }),
  };

  const created = await sip.createSipOutboundTrunk(
    OUTBOUND_TRUNK_NAME,
    OUTBOUND_ADDRESS,
    [...PHONE_NUMBERS],
    opts,
  );
  console.log(
    `[created] Outbound trunk "${OUTBOUND_TRUNK_NAME}": ${created.sipTrunkId}`,
  );
  return created.sipTrunkId;
}

async function ensureDispatchRule(
  sip: SipClient,
  inboundTrunkId: string,
): Promise<string> {
  const existing = await sip.listSipDispatchRule();
  const match = existing.find((r) => r.name === DISPATCH_RULE_NAME);
  if (match) {
    console.log(
      `[skip] Dispatch rule "${DISPATCH_RULE_NAME}" already exists: ${match.sipDispatchRuleId}`,
    );
    return match.sipDispatchRuleId;
  }

  // Individual room per inbound call — matches the WebRTC pattern where
  // every call_{agentId}_{timestamp} gets its own room.
  const rule: SipDispatchRuleIndividual = {
    type: "individual",
    roomPrefix: "call-",
  };

  // Auto-dispatch the lead-friendly agent into the room on call arrival.
  // The worker will read ctx.job.metadata (set below) and resolve the org's
  // default agent from DB. Same pattern webrtc/create-call uses for outbound.
  const metadataJson = JSON.stringify({
    source: "inbound_sip",
    routing: "default_agent",
  });

  const opts: CreateSipDispatchRuleOptions = {
    name: DISPATCH_RULE_NAME,
    trunkIds: [inboundTrunkId],
    metadata: metadataJson,
    roomConfig: new RoomConfiguration({
      agents: [
        new RoomAgentDispatch({
          agentName: AGENT_NAME,
          metadata: metadataJson,
        }),
      ],
    }),
  };

  const created = await sip.createSipDispatchRule(rule, opts);
  console.log(
    `[created] Dispatch rule "${DISPATCH_RULE_NAME}": ${created.sipDispatchRuleId}`,
  );
  return created.sipDispatchRuleId;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("");
  console.log("LiveKit SIP setup starting…");
  console.log(`  LIVEKIT_URL            = ${LK_URL || "(unset)"}`);
  console.log(`  Outbound SIP address   = ${OUTBOUND_ADDRESS}`);
  console.log(`  Phone numbers          = ${PHONE_NUMBERS.join(", ")}`);
  console.log("");

  const sip = getSipClient();

  const inboundTrunkId = await ensureInboundTrunk(sip);
  const outboundTrunkId = await ensureOutboundTrunk(sip);
  const dispatchRuleId = await ensureDispatchRule(sip, inboundTrunkId);

  console.log("");
  console.log("==========================================================");
  console.log("LiveKit SIP Setup Complete");
  console.log("");
  console.log("Add these to Vercel env vars:");
  console.log("");
  console.log(`LIVEKIT_SIP_INBOUND_TRUNK_ID=${inboundTrunkId}`);
  console.log(`LIVEKIT_SIP_OUTBOUND_TRUNK_ID=${outboundTrunkId}`);
  console.log(`LIVEKIT_SIP_OUTBOUND_ADDRESS=${OUTBOUND_ADDRESS}`);
  console.log("");
  console.log(`Dispatch rule ID (for reference): ${dispatchRuleId}`);
  console.log("==========================================================");
  console.log("");
}

main().catch((err) => {
  console.error("");
  console.error("LiveKit SIP setup FAILED:");
  if (err instanceof Error) {
    console.error(`  ${err.message}`);
    if (err.stack) console.error(err.stack.split("\n").slice(1, 4).join("\n"));
  } else {
    console.error(err);
  }
  process.exit(1);
});
