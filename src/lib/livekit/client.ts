/**
 * LiveKit Browser-Side Helpers
 *
 * Re-exports commonly used types from `livekit-client` and provides
 * convenience functions for connecting to rooms from the browser.
 */

"use client";

export {
  Room,
  RoomEvent,
  Track,
  ConnectionState,
  createLocalAudioTrack,
  type RemoteTrack,
  type RemoteTrackPublication,
  type LocalTrackPublication,
  type Participant,
  type RemoteParticipant,
  type DataPacket_Kind,
} from "livekit-client";

/**
 * Fetch a LiveKit access token + room info from our bootstrap API.
 */
export async function createWebRTCCall(opts: {
  agentId: string;
  contactId?: string;
  testMode?: boolean;
}): Promise<{
  serverUrl: string;
  accessToken: string;
  callId: string;
  roomName: string;
}> {
  const res = await fetch("/api/webrtc/create-call", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to create WebRTC call: ${err}`);
  }

  return res.json();
}

/**
 * Refresh an expiring LiveKit token.
 */
export async function refreshToken(opts: {
  roomName: string;
  identity: string;
}): Promise<{ accessToken: string }> {
  const res = await fetch("/api/webrtc/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  });

  if (!res.ok) {
    throw new Error("Failed to refresh LiveKit token");
  }

  return res.json();
}
