/**
 * LiveKit SIP helper — parallel to src/lib/livekit/server.ts but for the
 * SipClient (outbound SIP participants into rooms).
 *
 * Used by:
 *   - /api/calls/sip-outbound  (AI agent → PSTN)
 *   - /api/softphone/initiate  (rep browser → PSTN, Apr 21 build)
 *
 * Outbound calls are routed through the Telnyx SIP Connection trunk
 * provisioned in scripts/setup-livekit-sip.ts (trunk ID in env:
 * LIVEKIT_SIP_OUTBOUND_TRUNK_ID).
 */

import { SipClient } from "livekit-server-sdk";

const LK_URL = process.env.LIVEKIT_URL ?? "";
const LK_API_KEY = process.env.LIVEKIT_API_KEY ?? "";
const LK_API_SECRET = process.env.LIVEKIT_API_SECRET ?? "";

let _sipClient: SipClient | null = null;

export function getSipClient(): SipClient {
  if (!_sipClient) {
    if (!LK_URL || !LK_API_KEY || !LK_API_SECRET) {
      throw new Error("Missing LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET env vars");
    }
    const httpUrl = LK_URL.replace("wss://", "https://").replace("ws://", "http://");
    _sipClient = new SipClient(httpUrl, LK_API_KEY, LK_API_SECRET);
  }
  return _sipClient;
}

export interface CreateSipParticipantParams {
  trunkId: string;
  toNumber: string;
  roomName: string;
  participantIdentity: string;
  participantName?: string;
  krispEnabled?: boolean;

  // ── Added Apr 21 for browser softphone ──
  /**
   * Per-call outbound CLI. When unset, LiveKit uses the trunk's first
   * allowed number. For the browser softphone we pass the rep's selected
   * number from the dock picker.
   */
  fromNumber?: string;

  /**
   * If true, the promise resolves only after the PSTN leg answers.
   * Default (unset) returns as soon as the participant is created and
   * the dial is in progress. For the softphone we leave this unset so
   * the browser can react to ringing/answer events via LiveKit room
   * events rather than blocking on the HTTP response.
   */
  waitUntilAnswered?: boolean;

  /** Ringing timeout in seconds. If no answer by then, dial fails. */
  ringingTimeoutSeconds?: number;

  /** Hard cap on call duration in seconds. */
  maxCallDurationSeconds?: number;

  /** Play local dialtone/ringback to the LiveKit participant while dialing. */
  playDialtone?: boolean;

  /** Optional per-participant metadata (JSON string). */
  participantMetadata?: string;
}

export async function createSipParticipant(
  params: CreateSipParticipantParams,
): Promise<{ participantId: string; participantIdentity: string }> {
  const {
    trunkId,
    toNumber,
    roomName,
    participantIdentity,
    participantName,
    krispEnabled,
    fromNumber,
    waitUntilAnswered,
    ringingTimeoutSeconds,
    maxCallDurationSeconds,
    playDialtone,
    participantMetadata,
  } = params;

  if (!trunkId) throw new Error("trunkId is required (set LIVEKIT_SIP_OUTBOUND_TRUNK_ID in env)");
  if (!toNumber) throw new Error("toNumber is required");
  if (!roomName) throw new Error("roomName is required");
  if (!participantIdentity) throw new Error("participantIdentity is required");

  const sip = getSipClient();

  // Build options object, omitting undefined fields so we don't override
  // SDK defaults with explicit undefined.
  const opts: Record<string, unknown> = {
    participantIdentity,
    participantName,
    krispEnabled: krispEnabled ?? true,
  };

  if (fromNumber) opts.fromNumber = fromNumber;
  if (waitUntilAnswered !== undefined) opts.waitUntilAnswered = waitUntilAnswered;
  if (ringingTimeoutSeconds !== undefined) opts.ringingTimeout = ringingTimeoutSeconds;
  if (maxCallDurationSeconds !== undefined) opts.maxCallDuration = maxCallDurationSeconds;
  if (playDialtone !== undefined) opts.playDialtone = playDialtone;
  if (participantMetadata) opts.participantMetadata = participantMetadata;

  const info = await sip.createSipParticipant(trunkId, toNumber, roomName, opts);

  return {
    participantId: info.participantId,
    participantIdentity: info.participantIdentity,
  };
}
