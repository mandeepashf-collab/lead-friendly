import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createRoom, dispatchAgent } from "@/lib/livekit/server";
import { createSipParticipant } from "@/lib/livekit/sip";
import { substituteVariables, type PromptVarContext } from "@/lib/prompt-vars";

/**
 * POST /api/calls/sip-outbound
 *
 * Outbound AI phone call via LiveKit SIP. Replaces the TeXML Gather/Say
 * round-trip (10-13s latency) with the same low-latency LiveKit pipeline
 * that powers WebRTC calls (~1-2s turn time).
 *
 * Flow:
 *   1. Auth user → resolve org_id
 *   2. Feature flag gate (USE_LIVEKIT_SIP must be "true")
 *   3. Load agent + contact (both must belong to org, contact must have phone)
 *   4. Build agentConfig with template variables substituted
 *   5. Pick a from-number via number-pool rotation
 *   6. createRoom + dispatchAgent + createSipParticipant
 *   7. Insert calls row, return { callId, roomName }
 *
 * TeXML path at /api/calls/trigger remains alive for rollback.
 */

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

export async function POST(req: NextRequest) {
  try {
    // ── 1. Feature flag ───────────────────────────────────────
    if (process.env.USE_LIVEKIT_SIP !== "true") {
      return NextResponse.json(
        { error: "sip_outbound_disabled" },
        { status: 503 },
      );
    }

    // ── 2. Auth ───────────────────────────────────────────────
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
    const orgId = profile.organization_id as string;

    // ── 3. Parse body ─────────────────────────────────────────
    // Accept EITHER contactId (normal contact call) OR contactPhone
    // (test-call from the agent edit page, no DB contact row). Matches
    // /api/calls/trigger which also supports isTest:true with raw phone.
    let body: {
      agentId?: string;
      contactId?: string;
      contactPhone?: string;
      campaignId?: string;
      isTest?: boolean;
    } = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const { agentId, contactId, contactPhone: rawContactPhone, isTest } = body;
    if (!agentId) {
      return NextResponse.json({ error: "agentId is required" }, { status: 400 });
    }
    if (!contactId && !rawContactPhone) {
      return NextResponse.json(
        { error: "contactId or contactPhone is required" },
        { status: 400 },
      );
    }

    // ── 4. Load agent (must belong to org) ────────────────────
    const { data: agent, error: agentErr } = await supabaseAdmin
      .from("ai_agents")
      .select(
        "id, organization_id, name, voice_id, voice_speed, system_prompt, " +
        "greeting_message, settings, status",
      )
      .eq("id", agentId)
      .single();

    if (agentErr || !agent) {
      console.error("[sip-outbound] agent lookup failed:", agentErr?.message);
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }
    const a = agent as unknown as Record<string, unknown>;
    if (a.organization_id !== orgId) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    // ── 5. Resolve contact — either by ID (from contacts) or raw phone ──
    type ContactRow = Record<string, unknown> | null;
    let c: ContactRow = null;
    let contactPhone: string;

    if (contactId) {
      const { data: contact, error: contactErr } = await supabaseAdmin
        .from("contacts")
        .select(
          "id, organization_id, first_name, last_name, phone, email, " +
          "lender_name, state, city",
        )
        .eq("id", contactId)
        .single();

      if (contactErr || !contact) {
        console.error("[sip-outbound] contact lookup failed:", contactErr?.message);
        return NextResponse.json({ error: "Contact not found" }, { status: 404 });
      }
      c = contact as unknown as Record<string, unknown>;
      if (c.organization_id !== orgId) {
        return NextResponse.json({ error: "Contact not found" }, { status: 404 });
      }
      const phone = c.phone as string | null;
      if (!phone) {
        return NextResponse.json(
          { error: "Contact has no phone number" },
          { status: 400 },
        );
      }
      contactPhone = phone;
    } else {
      // Test-call path — raw phone, no contact row. Template vars fall
      // back to "there" / "our team" via substituteVariables.
      contactPhone = rawContactPhone!.trim();
      if (!contactPhone) {
        return NextResponse.json(
          { error: "contactPhone cannot be empty" },
          { status: 400 },
        );
      }
    }

    // ── 6. Build agentConfig with template substitution ───────
    const { data: orgRow } = await supabaseAdmin
      .from("organizations")
      .select("name")
      .eq("id", orgId)
      .maybeSingle();

    const promptCtx: PromptVarContext = {
      contact: c
        ? {
            first_name: c.first_name as string | null,
            last_name: c.last_name as string | null,
            phone: c.phone as string | null,
            email: c.email as string | null,
            lender_name: c.lender_name as string | null,
            state: c.state as string | null,
            city: c.city as string | null,
          }
        : null,
      business: orgRow as { name?: string | null } | null,
    };

    const settings = (a.settings ?? {}) as Record<string, unknown>;
    const rawSystemPrompt = (a.system_prompt as string) ?? "";
    const rawGreeting =
      (a.greeting_message as string) ?? `Hi, this is ${a.name}. How can I help you?`;

    const agentConfig = {
      agentId: a.id as string,
      organizationId: orgId,
      name: (a.name as string) || "Assistant",
      systemPrompt: substituteVariables(rawSystemPrompt, promptCtx),
      greeting: substituteVariables(rawGreeting, promptCtx),
      voiceId: (a.voice_id as string) ?? "21m00Tcm4TlvDq8ikWAM",
      voiceSpeed: (a.voice_speed as number) ?? 1.0,
      voiceStability: (settings.voice_stability as number) ?? 0.5,
      aiTemperature: (settings.ai_temperature as number) ?? 0.7,
    };

    // ── 7. Number-pool rotation (mirrors /api/calls/trigger:92-149) ──
    const { data: nums, error: numsErr } = await supabaseAdmin
      .from("phone_numbers")
      .select("id, number, daily_used, daily_cap, rotation_order, last_used_at")
      .eq("organization_id", orgId)
      .eq("status", "active")
      .order("rotation_order", { ascending: true })
      .order("last_used_at", { ascending: true, nullsFirst: true });

    if (numsErr || !nums || nums.length === 0) {
      console.error("[sip-outbound] no phone numbers:", numsErr?.message);
      return NextResponse.json(
        { error: "No active phone numbers available. Add one in Phone Numbers." },
        { status: 400 },
      );
    }

    const underLimit = nums.filter(n => {
      const cap = (n.daily_cap as number) || 50;
      const used = (n.daily_used as number) || 0;
      return used < cap;
    });

    if (underLimit.length === 0) {
      return NextResponse.json(
        {
          error:
            "All phone numbers have reached their daily call limit. Add more numbers or wait until tomorrow.",
        },
        { status: 429 },
      );
    }

    const selectedNumber = underLimit[0];
    const fromNumber = selectedNumber.number as string;
    const newCount = ((selectedNumber.daily_used as number) || 0) + 1;
    await supabaseAdmin
      .from("phone_numbers")
      .update({
        daily_used: newCount,
        last_used_at: new Date().toISOString(),
      })
      .eq("id", selectedNumber.id);

    const cap = (selectedNumber.daily_cap as number) || 50;
    if (newCount >= cap) {
      await supabaseAdmin
        .from("phone_numbers")
        .update({ status: "exhausted" })
        .eq("id", selectedNumber.id);
    }

    // ── 8. Create LiveKit room + dispatch agent ───────────────
    //
    // Stage A (Apr 22): migrated to the new createRoom() options-object
    // signature. No egress yet — that's Stage B. No calls-row ordering
    // refactor yet — that's Stage C. This change is a mechanical signature
    // migration so the build stays green.
    const roomName = `sip-out-${randomUUID()}`;
    const displayName = c
      ? `${(c.first_name as string | null) ?? ""} ${(c.last_name as string | null) ?? ""}`
          .trim() || "Contact"
      : isTest
        ? "Test Call"
        : "Contact";

    const metadata = JSON.stringify({
      source: "sip_outbound",
      agentId: a.id,
      contactId: c ? (c.id as string) : null,
      orgId,
      agentConfig,
      fromNumber,
      isTest: !!isTest,
    });

    try {
      await createRoom({
        name: roomName,
        metadata,
        emptyTimeout: 0,
      });
    } catch (err) {
      console.error("[sip-outbound] createRoom failed:", err);
      return NextResponse.json(
        {
          error: "sip_dispatch_failed",
          detail: err instanceof Error ? err.message : "createRoom error",
        },
        { status: 500 },
      );
    }

    try {
      await dispatchAgent(roomName, "lead-friendly", metadata);
    } catch (err) {
      console.error("[sip-outbound] dispatchAgent failed:", err);
      return NextResponse.json(
        {
          error: "sip_dispatch_failed",
          detail: err instanceof Error ? err.message : "dispatchAgent error",
        },
        { status: 500 },
      );
    }

    // ── 9. Dial the contact via LiveKit SIP ───────────────────
    const outboundTrunkId = process.env.LIVEKIT_SIP_OUTBOUND_TRUNK_ID;
    if (!outboundTrunkId) {
      console.error("[sip-outbound] LIVEKIT_SIP_OUTBOUND_TRUNK_ID not set");
      return NextResponse.json(
        { error: "sip_dispatch_failed", detail: "outbound trunk not configured" },
        { status: 500 },
      );
    }

    try {
      await createSipParticipant({
        trunkId: outboundTrunkId,
        toNumber: contactPhone,
        roomName,
        participantIdentity: c ? `caller-${c.id as string}` : `test-${randomUUID()}`,
        participantName: displayName,
        krispEnabled: true,
      });
    } catch (err) {
      console.error("[sip-outbound] createSipParticipant failed:", err);
      return NextResponse.json(
        {
          error: "sip_dispatch_failed",
          detail: err instanceof Error ? err.message : "createSipParticipant error",
        },
        { status: 500 },
      );
    }

    // ── 10. Insert calls row (matches WebRTC shape) ───────────
    // contact_id is explicit null for test-call path, same pattern as
    // /api/calls/trigger and /api/webrtc/create-call use for no-contact
    // calls. The column is nullable.
    const { data: callRecord, error: callErr } = await supabaseAdmin
      .from("calls")
      .insert({
        organization_id: orgId,
        ai_agent_id: a.id,
        contact_id: c ? (c.id as string) : null,
        direction: "outbound",
        status: "initiated",
        call_type: "webrtc",
        livekit_room_id: roomName,
        from_number: fromNumber,
        to_number: contactPhone,
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (callErr || !callRecord) {
      console.error("[sip-outbound] calls insert failed:", callErr?.message);
      // Room is already up; we don't tear it down. The call is running, we
      // just failed to log it. Worker will still complete normally.
      return NextResponse.json(
        { error: "call_record_insert_failed", detail: callErr?.message ?? null },
        { status: 500 },
      );
    }

    return NextResponse.json({
      callId: callRecord.id,
      roomName,
    });
  } catch (err) {
    console.error("[sip-outbound] unhandled error:", err);
    return NextResponse.json(
      {
        error: "sip_dispatch_failed",
        detail: err instanceof Error ? err.message : "Internal server error",
      },
      { status: 500 },
    );
  }
}
