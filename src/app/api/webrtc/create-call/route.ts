import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createRoom, createAccessToken, getLiveKitUrl } from "@/lib/livekit/server";

/**
 * POST /api/webrtc/create-call
 *
 * Bootstrap a WebRTC voice call:
 *  1. Load the AI agent config from DB
 *  2. Create a LiveKit room with agent metadata
 *  3. Mint a browser-participant access token
 *  4. Insert a call record in the DB
 *  5. Return { serverUrl, accessToken, callId, roomName }
 *
 * The LiveKit Agents framework auto-dispatches a Python worker when it
 * sees a new room matching its dispatch rules.
 */

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { agentId, contactId, testMode } = body as {
      agentId: string;
      contactId?: string;
      testMode?: boolean;
    };

    if (!agentId) {
      return NextResponse.json({ error: "agentId is required" }, { status: 400 });
    }

    // ── 1. Load agent ──────────────────────────────────────────
    const { data: agent, error: agentErr } = await supabaseAdmin
      .from("ai_agents")
      .select(
        "id, organization_id, name, voice_id, system_prompt, greeting_message, " +
        "inbound_prompt, inbound_greeting, outbound_prompt, outbound_greeting, " +
        "personality, max_duration_mins, max_call_duration, transfer_number, " +
        "dnc_phrases, objection_handling, knowledge_base, closing_script, " +
        "voice_speed, settings, status"
      )
      .eq("id", agentId)
      .single();

    if (agentErr || !agent) {
      console.error("[webrtc/create-call] agent lookup failed:", agentErr?.message);
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    const settings = (agent.settings ?? {}) as Record<string, unknown>;

    // ── 2. Build room metadata (agent worker reads this) ───────
    const roomName = `call_${agentId}_${Date.now()}`;

    const agentConfig = {
      agentId: agent.id,
      organizationId: agent.organization_id,
      name: agent.name,
      systemPrompt: agent.system_prompt ?? "",
      inboundPrompt: agent.inbound_prompt ?? null,
      inboundGreeting: agent.inbound_greeting ?? null,
      outboundPrompt: agent.outbound_prompt ?? null,
      outboundGreeting: agent.outbound_greeting ?? null,
      greeting: agent.greeting_message ?? `Hi, this is ${agent.name}. How can I help you?`,
      voiceId: agent.voice_id ?? "21m00Tcm4TlvDq8ikWAM",
      voiceSpeed: (agent.voice_speed as number) ?? 1.0,
      voiceStability: (settings.voice_stability as number) ?? 0.5,
      aiTemperature: (settings.ai_temperature as number) ?? 0.7,
      enableRecording: (settings.enable_recording as boolean) ?? true,
      personality: agent.personality ?? "",
      transferNumber: agent.transfer_number ?? null,
      maxDurationMins: (agent.max_duration_mins as number) ?? (agent.max_call_duration as number) ?? 10,
      dncPhrases: agent.dnc_phrases ?? [],
      objectionHandling: agent.objection_handling ?? "",
      knowledgeBase: agent.knowledge_base ?? "",
      closingScript: agent.closing_script ?? "",
      testMode: !!testMode,
    };

    const roomMetadata = JSON.stringify({
      agentConfig,
      contactId: contactId ?? null,
    });

    // ── 3. Create LiveKit room ─────────────────────────────────
    await createRoom(roomName, roomMetadata);
    console.log(`[webrtc/create-call] room created: ${roomName}`);

    // ── 4. Mint browser participant token ──────────────────────
    const participantIdentity = contactId
      ? `contact_${contactId}`
      : `web_user_${Date.now()}`;

    const accessToken = await createAccessToken({
      identity: participantIdentity,
      name: "Caller",
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      ttlSeconds: 3600,
    });

    // ── 5. Create call record ──────────────────────────────────
    const { data: callRecord, error: callErr } = await supabaseAdmin
      .from("calls")
      .insert({
        organization_id: agent.organization_id,
        ai_agent_id: agentId,
        contact_id: contactId ?? null,
        direction: "inbound",
        status: "initiated",
        call_type: "webrtc",
        livekit_room_id: roomName,
        outcome: null,
      })
      .select("id")
      .single();

    if (callErr) {
      console.error("[webrtc/create-call] call insert failed:", callErr.message);
      // Room was already created — try to clean up
      try {
        const { deleteRoom } = await import("@/lib/livekit/server");
        await deleteRoom(roomName);
      } catch { /* best effort */ }
      return NextResponse.json({ error: "Failed to create call record" }, { status: 500 });
    }

    // ── 6. Update room metadata with callRecordId ──────────────
    // The agent worker needs the DB call record ID for logging/outcomes
    const fullMetadata = JSON.stringify({
      agentConfig,
      contactId: contactId ?? null,
      callRecordId: callRecord.id,
    });

    try {
      const { getRoomService } = await import("@/lib/livekit/server");
      const svc = getRoomService();
      await svc.updateRoomMetadata(roomName, fullMetadata);
    } catch (err) {
      console.warn("[webrtc/create-call] metadata update failed (non-critical):", err);
    }

    console.log(
      `[webrtc/create-call] ✓ room=${roomName} call=${callRecord.id} agent=${agent.name}`,
    );

    // ── 7. Return connection details ───────────────────────────
    return NextResponse.json({
      serverUrl: getLiveKitUrl(),
      accessToken,
      callId: callRecord.id,
      roomName,
    });
  } catch (err) {
    console.error("[webrtc/create-call] unhandled error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
