import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createRoom, createAccessToken, getLiveKitUrl } from "@/lib/livekit/server";

/**
 * POST /api/webrtc/create-call
 *
 * Bootstrap a WebRTC voice call:
 *  1. Authenticate user and verify organization ownership
 *  2. Load the AI agent config from DB
 *  3. Create a LiveKit room with agent metadata
 *  4. Mint a browser-participant access token
 *  5. Insert a call record in the DB
 *  6. Return { serverUrl, accessToken, callId, roomName }
 *
 * The LiveKit Agents framework auto-dispatches a Python worker when it
 * sees a new room matching its dispatch rules.
 */

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

// Simple in-memory rate limiter: max 5 concurrent WebRTC calls per org
const activeCallsByOrg = new Map<string, number>();

export async function POST(req: NextRequest) {
  try {
    // ── Auth check ────────────────────────────────────────────
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const orgId = profile.organization_id;

    const body = await req.json();
    const { agentId, contactId, testMode } = body as {
      agentId: string;
      contactId?: string;
      testMode?: boolean;
    };

    if (!agentId) {
      return NextResponse.json({ error: "agentId is required" }, { status: 400 });
    }

    // ── Rate limit: max 5 concurrent WebRTC calls per org ─────
    const activeCalls = activeCallsByOrg.get(orgId) ?? 0;
    if (activeCalls >= 5) {
      return NextResponse.json(
        { error: "Too many concurrent WebRTC calls. Please wait for an active call to end." },
        { status: 429 },
      );
    }

    // ── 1. Load agent (verify org ownership) ──────────────────
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

    // Cast to Record for flexible access — Supabase types don't cover all columns
    const a = agent as unknown as Record<string, unknown>;

    // Verify agent belongs to user's organization
    if (a.organization_id !== orgId) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    const settings = (a.settings ?? {}) as Record<string, unknown>;

    // ── 2. Build room metadata (agent worker reads this) ───────
    const roomName = `call_${agentId}_${Date.now()}`;

    const agentConfig = {
      agentId: a.id as string,
      organizationId: a.organization_id as string,
      name: (a.name as string) || "Assistant",
      systemPrompt: (a.system_prompt as string) ?? "",
      inboundPrompt: (a.inbound_prompt as string) ?? null,
      inboundGreeting: (a.inbound_greeting as string) ?? null,
      outboundPrompt: (a.outbound_prompt as string) ?? null,
      outboundGreeting: (a.outbound_greeting as string) ?? null,
      greeting: (a.greeting_message as string) ?? `Hi, this is ${a.name}. How can I help you?`,
      voiceId: (a.voice_id as string) ?? "21m00Tcm4TlvDq8ikWAM",
      voiceSpeed: (a.voice_speed as number) ?? 1.0,
      voiceStability: (settings.voice_stability as number) ?? 0.5,
      aiTemperature: (settings.ai_temperature as number) ?? 0.7,
      enableRecording: (settings.enable_recording as boolean) ?? true,
      personality: (a.personality as string) ?? "",
      transferNumber: (a.transfer_number as string) ?? null,
      maxDurationMins: (a.max_duration_mins as number) ?? (a.max_call_duration as number) ?? 10,
      dncPhrases: (a.dnc_phrases as string[]) ?? [],
      objectionHandling: (a.objection_handling as string) ?? "",
      knowledgeBase: (a.knowledge_base as string) ?? "",
      closingScript: (a.closing_script as string) ?? "",
      testMode: !!testMode,
    };

    // ── 3. Create call record FIRST so we have callRecordId for room metadata ──
    const { data: callRecord, error: callErr } = await supabaseAdmin
      .from("calls")
      .insert({
        organization_id: a.organization_id as string,
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
      return NextResponse.json({ error: "Failed to create call record" }, { status: 500 });
    }

    // ── 4. Create LiveKit room with full metadata + agent dispatch ──
    const fullMetadata = JSON.stringify({
      agentConfig,
      contactId: contactId ?? null,
      callRecordId: callRecord.id,
    });

    try {
      await createRoom(roomName, fullMetadata);
    } catch (err) {
      console.error("[webrtc/create-call] room creation failed:", err);
      // Roll back the call record so we don't leak orphans
      await supabaseAdmin.from("calls").delete().eq("id", callRecord.id);
      throw err;
    }

    console.log(`[webrtc/create-call] room=${roomName} call=${callRecord.id}`);

    // ── 5. Mint browser participant token ──────────────────────
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

    // Track active calls for rate limiting
    activeCallsByOrg.set(orgId, (activeCallsByOrg.get(orgId) ?? 0) + 1);
    // Auto-decrement after max duration + buffer (12 min)
    setTimeout(() => {
      const current = activeCallsByOrg.get(orgId) ?? 1;
      activeCallsByOrg.set(orgId, Math.max(0, current - 1));
    }, 12 * 60 * 1000);

    // ── 6. Return connection details ───────────────────────────
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
