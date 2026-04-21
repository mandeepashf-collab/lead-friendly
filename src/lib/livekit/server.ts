/**
 * LiveKit Server Helpers
 *
 * Wraps `livekit-server-sdk` for:
 *  - Creating rooms
 *  - Minting access tokens (browser participant + agent worker)
 *  - Webhook verification
 */

import {
  AccessToken,
  AgentDispatchClient,
  RoomAgentDispatch,
  RoomConfiguration,
  RoomServiceClient,
  WebhookReceiver,
} from "livekit-server-sdk";

// ── Environment ────────────────────────────────────────────────
const LK_URL = process.env.LIVEKIT_URL ?? "";
const LK_API_KEY = process.env.LIVEKIT_API_KEY ?? "";
const LK_API_SECRET = process.env.LIVEKIT_API_SECRET ?? "";
const LK_WEBHOOK_SECRET = process.env.LIVEKIT_WEBHOOK_SECRET ?? LK_API_SECRET;

// ── Agent Dispatch Service ─────────────────────────────────────

let _agentDispatch: AgentDispatchClient | null = null;

export function getAgentDispatchClient(): AgentDispatchClient {
  if (!_agentDispatch) {
    if (!LK_URL || !LK_API_KEY || !LK_API_SECRET) {
      throw new Error("Missing LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET env vars");
    }
    // AgentDispatchClient needs https:// URL, not wss://
    const httpUrl = LK_URL.replace("wss://", "https://").replace("ws://", "http://");
    _agentDispatch = new AgentDispatchClient(httpUrl, LK_API_KEY, LK_API_SECRET);
  }
  return _agentDispatch;
}

/**
 * Explicitly dispatch an agent to a room.
 * This is the recommended way to trigger agent dispatch in LiveKit Cloud.
 */
export async function dispatchAgent(
  roomName: string,
  agentName: string,
  metadata?: string,
): Promise<void> {
  const client = getAgentDispatchClient();
  await client.createDispatch(roomName, agentName, metadata ? { metadata } : undefined);
}

// ── Room Service ───────────────────────────────────────────────

let _roomService: RoomServiceClient | null = null;

export function getRoomService(): RoomServiceClient {
  if (!_roomService) {
    if (!LK_URL || !LK_API_KEY || !LK_API_SECRET) {
      throw new Error("Missing LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET env vars");
    }
    _roomService = new RoomServiceClient(LK_URL, LK_API_KEY, LK_API_SECRET);
  }
  return _roomService;
}

/**
 * Create a LiveKit room with metadata attached.
 *
 * Agent dispatch is handled separately via dispatchAgent() using the
 * AgentDispatchClient — this is the reliable way to trigger explicit dispatch
 * in LiveKit Cloud.
 */
export async function createRoom(
  roomName: string,
  metadata: string,
  emptyTimeout = 300,
): Promise<void> {
  const svc = getRoomService();
  await svc.createRoom({
    name: roomName,
    emptyTimeout,
    metadata,
  });
}

/**
 * Delete a LiveKit room (cleanup).
 */
export async function deleteRoom(roomName: string): Promise<void> {
  const svc = getRoomService();
  await svc.deleteRoom(roomName);
}

// ── Access Tokens ──────────────────────────────────────────────

export interface TokenOptions {
  identity: string;
  name?: string;
  room: string;
  canPublish?: boolean;
  canSubscribe?: boolean;

  /**
   * Added Apr 21 for browser softphone.
   * Required true when the rep browser needs to publish DTMF via the
   * LiveKit data channel (topic "lk.dtmf"). Defaults to true to match
   * LiveKit SDK defaults — passing false revokes data-channel publishing.
   */
  canPublishData?: boolean;

  ttlSeconds?: number;
  metadata?: string;
  agentDispatch?: {
    agentName: string;
    metadata?: string;
  };
}

export async function createAccessToken(opts: TokenOptions): Promise<string> {
  if (!LK_API_KEY || !LK_API_SECRET) {
    throw new Error("Missing LIVEKIT_API_KEY / LIVEKIT_API_SECRET env vars");
  }

  const token = new AccessToken(LK_API_KEY, LK_API_SECRET, {
    identity: opts.identity,
    name: opts.name ?? opts.identity,
    ttl: opts.ttlSeconds ?? 3600,
    metadata: opts.metadata,
  });

  token.addGrant({
    roomJoin: true,
    room: opts.room,
    canPublish: opts.canPublish ?? true,
    canSubscribe: opts.canSubscribe ?? true,
    canPublishData: opts.canPublishData ?? true,
  });

  if (opts.agentDispatch) {
    const { agentName, metadata: agentMetadata } = opts.agentDispatch;
    token.roomConfig = new RoomConfiguration({
      agents: [
        new RoomAgentDispatch({
          agentName,
          metadata: agentMetadata ?? "",
        }),
      ],
    });
  }

  return await token.toJwt();
}

// ── Webhook Verification ───────────────────────────────────────

let _webhookReceiver: WebhookReceiver | null = null;

export function getWebhookReceiver(): WebhookReceiver {
  if (!_webhookReceiver) {
    _webhookReceiver = new WebhookReceiver(LK_API_KEY, LK_WEBHOOK_SECRET);
  }
  return _webhookReceiver;
}

// ── Constants ──────────────────────────────────────────────────

export function getLiveKitUrl(): string {
  return LK_URL;
}
