/**
 * LiveKit SIP helper — parallel to src/lib/livekit/server.ts but for the
 * SipClient (outbound SIP participants into rooms).
 *
 * Used by /api/calls/sip-outbound to dial a phone number directly from
 * LiveKit, routed out through the Telnyx SIP Connection trunk provisioned
 * in scripts/setup-livekit-sip.ts.
 */

import { SipClient } from "livekit-server-sdk";

// ── Environment ────────────────────────────────────────────────
const LK_URL = process.env.LIVEKIT_URL ?? "";
const LK_API_KEY = process.env.LIVEKIT_API_KEY ?? "";
const LK_API_SECRET = process.env.LIVEKIT_API_SECRET ?? "";

// ── Lazy singleton (matches getAgentDispatchClient pattern in server.ts) ──
let _sipClient: SipClient | null = null;

export function getSipClient(): SipClient {
  if (!_sipClient) {
    if (!LK_URL || !LK_API_KEY || !LK_API_SECRET) {
      throw new Error("Missing LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET env vars");
    }
    // SipClient wants https://, not wss:// — same normalization as
    // getAgentDispatchClient().
    const httpUrl = LK_URL.replace("wss://", "https://").replace("ws://", "http://");
    _sipClient = new SipClient(httpUrl, LK_API_KEY, LK_API_SECRET);
  }
  return _sipClient;
}

// ── Outbound participant dial ──────────────────────────────────
export interface CreateSipParticipantParams {
  /** LiveKit SIP outbound trunk ID (from LIVEKIT_SIP_OUTBOUND_TRUNK_ID) */
  trunkId: string;
  /** E.164 phone number to dial (e.g. "+12534026951") */
  toNumber: string;
  /** LiveKit room the participant joins once answered */
  roomName: string;
  /** Identity visible to the worker (e.g. `caller-${contactId}`) */
  participantIdentity: string;
  /** Optional display name attached to the SIP participant */
  participantName?: string;
  /** Enable Krisp noise cancellation on the caller audio */
  krispEnabled?: boolean;
}

/**
 * Dial `toNumber` via LiveKit SIP and attach them as a participant in
 * `roomName`. The agent worker already dispatched into the room will
 * see the caller join and start the conversation.
 *
 * Throws on any LiveKit API failure — caller is responsible for catching
 * and translating to an HTTP response.
 */
export async function createSipParticipant(
  params: CreateSipParticipantParams,
): Promise<{ participantId: string; participantIdentity: string }> {
  const { trunkId, toNumber, roomName, participantIdentity, participantName, krispEnabled } =
    params;

  if (!trunkId) {
    throw new Error("trunkId is required (set LIVEKIT_SIP_OUTBOUND_TRUNK_ID in env)");
  }
  if (!toNumber) {
    throw new Error("toNumber is required");
  }
  if (!roomName) {
    throw new Error("roomName is required");
  }
  if (!participantIdentity) {
    throw new Error("participantIdentity is required");
  }

  const sip = getSipClient();
  const info = await sip.createSipParticipant(trunkId, toNumber, roomName, {
    participantIdentity,
    participantName,
    krispEnabled: krispEnabled ?? true,
  });

  return {
    participantId: info.participantId,
    participantIdentity: info.participantIdentity,
  };
}
