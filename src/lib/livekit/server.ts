/**
 * LiveKit Server Helpers
 *
 * Wraps `livekit-server-sdk` for:
 *  - Creating rooms
 *  - Minting access tokens (browser participant + agent worker)
 *  - Webhook verification
 */

import { AccessToken, RoomServiceClient, WebhookReceiver } from "livekit-server-sdk";

// ── Environment ────────────────────────────────────────────────
const LK_URL = process.env.LIVEKIT_URL ?? "";
const LK_API_KEY = process.env.LIVEKIT_API_KEY ?? "";
const LK_API_SECRET = process.env.LIVEKIT_API_SECRET ?? "";
const LK_WEBHOOK_SECRET = process.env.LIVEKIT_WEBHOOK_SECRET ?? LK_API_SECRET;

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
 * @param roomName  Unique room name (e.g. `call_{agentId}_{timestamp}`)
 * @param metadata  Stringified JSON metadata the agent worker will read
 * @param emptyTimeout  Seconds to keep the room alive after last participant leaves (default 300)
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
  /** Participant identity — unique per room */
  identity: string;
  /** Display name */
  name?: string;
  /** Room to grant access to */
  room: string;
  /** Can this participant publish audio/video? */
  canPublish?: boolean;
  /** Can this participant subscribe to tracks? */
  canSubscribe?: boolean;
  /** Token TTL in seconds (default: 3600 = 1 hour) */
  ttlSeconds?: number;
  /** Attach metadata to the participant */
  metadata?: string;
}

/**
 * Mint a LiveKit JWT access token.
 */
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
  });

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
