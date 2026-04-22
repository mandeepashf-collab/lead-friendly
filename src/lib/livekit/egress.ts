import {
  EncodedFileOutput,
  EncodedFileType,
  RoomCompositeEgressRequest,
  RoomEgress,
  S3Upload,
} from "@livekit/protocol";

/**
 * Build a Room Composite audio-only egress config that uploads an OGG
 * recording of the call to Supabase Storage via LiveKit's S3-compatible
 * upload path.
 *
 * Called at room-creation time by any route that wants the call recorded:
 *   - /api/softphone/initiate      (browser softphone, human rep)
 *   - /api/webrtc/create-call      (AI agent test call from builder)
 *   - /api/calls/sip-outbound      (AI agent outbound PSTN — campaigns)
 *
 * Returns undefined (callers proceed without recording) when:
 *   - RECORDING_ENABLED is not "true"
 *   - any SUPABASE_S3_* env var is missing
 *
 * We prefer "call proceeds, no recording" over "call fails because a
 * credential is missing". Recording is a supporting feature, not a
 * prerequisite for the call to happen.
 *
 * The storage key layout ("{orgId}/{callId}.ogg") matches Migration 014's
 * bucket-policy expectations — do not change without updating the RLS
 * policy on the call-recordings bucket.
 */
export function buildCallRecordingEgress(
  orgId: string,
  callId: string,
  roomName: string,
): RoomEgress | undefined {
  const enabled = process.env.RECORDING_ENABLED === "true";
  if (!enabled) return undefined;

  const required = [
    "SUPABASE_S3_ACCESS_KEY_ID",
    "SUPABASE_S3_SECRET_ACCESS_KEY",
    "SUPABASE_S3_ENDPOINT",
    "SUPABASE_S3_REGION",
    "SUPABASE_S3_BUCKET",
  ] as const;
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error(
      `[egress] RECORDING_ENABLED=true but missing env vars: ${missing.join(", ")}. ` +
        `Skipping egress for call ${callId} (room ${roomName}).`,
    );
    return undefined;
  }

  return new RoomEgress({
    room: new RoomCompositeEgressRequest({
      roomName,
      audioOnly: true,
      fileOutputs: [
        new EncodedFileOutput({
          fileType: EncodedFileType.OGG,
          filepath: `${orgId}/${callId}.ogg`,
          disableManifest: true,
          output: {
            case: "s3",
            value: new S3Upload({
              accessKey: process.env.SUPABASE_S3_ACCESS_KEY_ID!,
              secret: process.env.SUPABASE_S3_SECRET_ACCESS_KEY!,
              endpoint: process.env.SUPABASE_S3_ENDPOINT!,
              region: process.env.SUPABASE_S3_REGION!,
              bucket: process.env.SUPABASE_S3_BUCKET!,
              forcePathStyle: true,
            }),
          },
        }),
      ],
    }),
  });
}
