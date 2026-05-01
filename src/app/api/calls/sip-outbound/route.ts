import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createRoom, deleteRoom, dispatchAgent } from "@/lib/livekit/server";
import { buildCallRecordingEgress } from "@/lib/livekit/egress";
import { createSipParticipant } from "@/lib/livekit/sip";
import { substituteVariables, type PromptVarContext } from "@/lib/prompt-vars";
import { enforceTcpa } from "@/lib/tcpa/enforce";
import { writeOverrideAudit } from "@/lib/tcpa/audit";
import { checkOutboundCallAllowed } from "@/lib/billing/wallet-guard";

/**
 * POST /api/calls/sip-outbound
 *
 * Outbound AI phone call via LiveKit SIP. Replaces the TeXML Gather/Say
 * round-trip (10-13s latency) with the same low-latency LiveKit pipeline
 * that powers WebRTC calls (~1-2s turn time).
 *
 * Flow (Stage C refactor, Apr 22):
 *   1. Auth user → resolve org_id
 *   2. Feature flag gate (USE_LIVEKIT_SIP must be "true")
 *   3. Load agent + contact (both must belong to org, contact must have phone)
 *   4. Build agentConfig with template variables substituted
 *   5. Pick a from-number via number-pool rotation
 *   6. Insert calls row FIRST so callId is available for room metadata + egress filepath
 *   7. createRoom + dispatchAgent + createSipParticipant — each with cleanup-on-fail
 *   8. Return { callId, roomName }
 *
 * Why calls row first (changed Apr 22):
 *   - Egress filepath is "{orgId}/{callId}.ogg" — can't compute without callId
 *   - Room metadata includes callRecordId — webhook uses it to resolve the call
 *     for egress_ended, participant_joined, etc. Previously the webhook fell
 *     back to livekit_room_id lookup, which worked but was brittle.
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
    // Two paths:
    //   (a) User session (softphone manual dial / build page test call) — cookies
    //   (b) Campaign-launch (service-role) — header `x-campaign-launch-key`
    //       matching SUPABASE_SERVICE_ROLE_KEY. Used by /api/automations/process
    //       so campaigns dial via the same LiveKit SIP pipeline as softphone,
    //       getting fast turn time + always-on recording + Deepgram transcript.
    //       organizationId must be in the body (no profile lookup possible).
    const campaignKey = req.headers.get("x-campaign-launch-key");
    const isCampaignLaunch =
      !!campaignKey
      && !!process.env.SUPABASE_SERVICE_ROLE_KEY
      && campaignKey === process.env.SUPABASE_SERVICE_ROLE_KEY;

    let orgId: string;
    let userRole: string | null = null;
    let userFullName: string | null = null;
    let userId: string | null = null;

    if (isCampaignLaunch) {
      // organizationId comes from the body in this branch — pulled out
      // after body parse below. We set a sentinel here and re-assign later.
      orgId = "__pending_body__";
    } else {
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
        .select("organization_id, role, full_name")
        .eq("id", user.id)
        .single();

      if (!profile?.organization_id) {
        return NextResponse.json({ error: "Profile not found" }, { status: 404 });
      }
      orgId = profile.organization_id as string;
      userRole = (profile.role as string | null) ?? null;
      userFullName = (profile.full_name as string | null) ?? null;
      userId = user.id;
    }

    // ── 3. Parse body ─────────────────────────────────────────
    let body: {
      agentId?: string;
      contactId?: string;
      contactPhone?: string;
      campaignId?: string;
      organizationId?: string;
      isTest?: boolean;
      overrideToken?: string;
      overrideNote?: string;
    } = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const { agentId, contactId, contactPhone: rawContactPhone, isTest, campaignId } = body;

    // Resolve orgId for campaign-launch path now that the body is parsed.
    if (isCampaignLaunch) {
      if (!body.organizationId) {
        return NextResponse.json(
          { error: "organizationId required for campaign launch" },
          { status: 400 },
        );
      }
      orgId = body.organizationId;
    }

    if (!agentId) {
      return NextResponse.json({ error: "agentId is required" }, { status: 400 });
    }
    if (!contactId && !rawContactPhone) {
      return NextResponse.json(
        { error: "contactId or contactPhone is required" },
        { status: 400 },
      );
    }

    // ── Wallet guard: block if trial exhausted, wallet blocked, or sub canceled ──
    // Phase 1.6 — runs before agent/contact load + TCPA gate. Applies equally
    // to user-session and campaign-launch paths since both ultimately consume
    // the same org's wallet for overage.
    const guard = await checkOutboundCallAllowed({
      organizationId: orgId,
      supabase: supabaseAdmin,
    });
    if (!guard.allowed) {
      return NextResponse.json(
        { error: guard.message, reason: guard.reason },
        { status: guard.httpStatus },
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
      contactPhone = rawContactPhone!.trim();
      if (!contactPhone) {
        return NextResponse.json(
          { error: "contactPhone cannot be empty" },
          { status: 400 },
        );
      }
    }

    // ── 5b. TCPA compliance gate (manual mode) ────────────────
    // Only enforced when a contactId is present — test calls and raw-phone
    // paths skip the gate by design (no contact row to evaluate against).
    // Runs before number-pool rotation + calls.insert so a blocked call
    // neither burns a number nor creates a DB row.
    const overrideToken =
      typeof body.overrideToken === "string" && body.overrideToken.trim()
        ? body.overrideToken.trim()
        : undefined;
    const overrideNote =
      typeof body.overrideNote === "string" ? body.overrideNote.slice(0, 500) : null;

    let overrideInfo: {
      codes: string[];
      auditPayload: Parameters<typeof writeOverrideAudit>[0]["auditPayload"];
    } | null = null;

    if (c && contactId) {
      const verdict = await enforceTcpa({
        orgId,
        // Campaign-launch runs from a service-role context with no user;
        // pass an empty sentinel since enforceTcpa doesn't use userId in
        // automated mode (no token minting, no role check).
        userId: userId ?? "",
        userRole,
        contactId,
        // Campaign launches are automated and skip the soft-warning override
        // flow entirely — they obey TCPA but do not surface a UI prompt.
        mode: isCampaignLaunch ? "automated" : "manual",
        overrideToken,
        supabase: supabaseAdmin,
      });

      if (verdict.status === "hard_blocked") {
        return NextResponse.json(
          {
            ok: false,
            blocked: true,
            blocks: verdict.blocks,
            evaluatedAt: new Date().toISOString(),
          },
          { status: 403 },
        );
      }
      if (verdict.status === "role_denied") {
        return NextResponse.json(
          {
            ok: false,
            blocked: true,
            blocks: [
              {
                code: "insufficient_role",
                reason: "Your role cannot override compliance warnings. Contact an admin.",
                severity: "hard",
              },
            ],
            evaluatedAt: new Date().toISOString(),
          },
          { status: 403 },
        );
      }
      if (verdict.status === "soft_blocked") {
        return NextResponse.json(
          {
            ok: false,
            blocked: false,
            requiresOverride: true,
            warnings: verdict.warnings,
            overrideToken: verdict.overrideToken,
            evaluatedAt: new Date().toISOString(),
          },
          { status: 409 },
        );
      }
      if (verdict.status === "token_invalid") {
        return NextResponse.json(
          {
            ok: false,
            blocked: false,
            requiresOverride: true,
            warnings: verdict.warnings,
            overrideToken: verdict.overrideToken,
            tokenExpired: true,
            tokenReason: verdict.reason,
            evaluatedAt: new Date().toISOString(),
          },
          { status: 409 },
        );
      }
      // status is "clear" or "override_accepted"
      if (verdict.status === "override_accepted") {
        overrideInfo = {
          codes: verdict.overriddenCodes,
          auditPayload: verdict.auditPayload,
        };
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

    // Inject current-date context. Without this, Haiku defaults dates from
    // training data (e.g. picks 2025 when the lead says "today") and sends
    // past dates to book_meeting, which Cal.com rejects. We pre-resolve the
    // next 7 days in Pacific Time as an explicit calendar table so the model
    // doesn't have to do weekday math — it just looks up the right row.
    const ptFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    const ptDateOnlyFormatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Los_Angeles",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }); // en-CA gives YYYY-MM-DD
    const ptTimeFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    const now = new Date();
    const calendarRows: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
      const label = i === 0 ? "TODAY" : i === 1 ? "TOMORROW" : `+${i} days`;
      const human = ptFormatter.format(d);          // "Wednesday, April 29, 2026"
      const iso = ptDateOnlyFormatter.format(d);    // "2026-04-29"
      calendarRows.push(`  ${label.padEnd(9)} → ${human} → use date="${iso}"`);
    }
    const dateContext =
      `CURRENT DATE & TIME (Pacific Time)\n` +
      `It is currently ${ptTimeFormatter.format(now)} on ${ptFormatter.format(now)}.\n\n` +
      `When the lead says "today", "tomorrow", "Friday", "next Monday", or any relative date, use this calendar:\n\n` +
      calendarRows.join("\n") +
      `\n\nALWAYS pass dates to book_meeting in YYYY-MM-DD format using the values above. Never use a date earlier than today's date. If the lead requests a date more than 7 days out, compute it from today's date — never from your training data.\n\n` +
      `═══════════════════════════════════════════\n\n`;

    const agentConfig = {
      agentId: a.id as string,
      organizationId: orgId,
      name: (a.name as string) || "Assistant",
      systemPrompt: dateContext + substituteVariables(rawSystemPrompt, promptCtx),
      greeting: substituteVariables(rawGreeting, promptCtx),
      voiceId: (a.voice_id as string) ?? "21m00Tcm4TlvDq8ikWAM",
      voiceSpeed: (a.voice_speed as number) ?? 1.0,
      voiceStability: (settings.voice_stability as number) ?? 0.5,
      aiTemperature: (settings.ai_temperature as number) ?? 0.7,
      transferNumber: (settings.transfer_number as string | null) ?? null,
    };

    // ── 7. Number-pool rotation ────────────────────────────────
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

    // ── 8. Insert calls row FIRST (new in Stage C) ────────────
    // Previously this happened after SIP dial — which meant we couldn't
    // include callRecordId in room metadata and couldn't compute the egress
    // filepath. Now the row is written up front; any downstream failure
    // marks it failed via bestEffortCleanup() instead of leaving it silent.
    const roomName = `sip-out-${randomUUID()}`;

    const { data: callRecord, error: callErr } = await supabaseAdmin
      .from("calls")
      .insert({
        organization_id: orgId,
        ai_agent_id: a.id,
        contact_id: c ? (c.id as string) : null,
        campaign_id: campaignId ?? null,
        direction: "outbound",
        status: "initiated",
        call_type: "webrtc", // TODO: consider 'sip_outbound' after UI audit
        livekit_room_id: roomName,
        from_number: fromNumber,
        to_number: contactPhone,
        started_at: new Date().toISOString(),
        provider: "livekit",
        recording_disclosed: true,
      })
      .select("id")
      .single();

    if (callErr || !callRecord) {
      console.error("[sip-outbound] calls insert failed:", callErr?.message);
      return NextResponse.json(
        { error: "call_record_insert_failed", detail: callErr?.message ?? null },
        { status: 500 },
      );
    }
    const callId = callRecord.id as string;

    const displayName = c
      ? `${(c.first_name as string | null) ?? ""} ${(c.last_name as string | null) ?? ""}`
          .trim() || "Contact"
      : isTest
        ? "Test Call"
        : "Contact";

    // Stamp calls.metadata.tcpa_override + write the audit row when the rep
    // placed this call over a soft-block warning. Override path is manual-mode
    // only — campaign launches use automated mode and never reach here.
    if (overrideInfo && userId) {
      await supabaseAdmin
        .from("calls")
        .update({
          metadata: {
            tcpa_override: {
              codes: overrideInfo.codes,
              at: new Date().toISOString(),
              by: userId,
            },
          },
        })
        .eq("id", callId);

      await writeOverrideAudit({
        supabase: supabaseAdmin,
        orgId,
        userId: userId,
        userName: userFullName,
        contactId: (c?.id as string) ?? contactId ?? "",
        contactDisplayName: displayName,
        contactPhoneE164: contactPhone,
        callId,
        auditPayload: overrideInfo.auditPayload,
        path: "sip_outbound_manual",
        note: overrideNote,
        ipAddress: req.headers.get("x-forwarded-for") ?? null,
      });
    }

    // ── 9. Build metadata and egress config ───────────────────
    //
    // Metadata now includes callRecordId + callType + organizationId so the
    // webhook handler can resolve the calls row directly from room metadata
    // (matches softphone pattern from Apr 21).
    const metadata = JSON.stringify({
      source: "sip_outbound",
      agentId: a.id,
      contactId: c ? (c.id as string) : null,
      orgId,
      organizationId: orgId,
      callRecordId: callId,
      callType: "webrtc_outbound_pstn", // for webhook routing; calls.call_type stays 'webrtc' above
      agentConfig,
      fromNumber,
      isTest: !!isTest,
    });

    const egressConfig = buildCallRecordingEgress(orgId, callId, roomName);

    // ── 10. Create LiveKit room ───────────────────────────────
    try {
      await createRoom({
        name: roomName,
        metadata,
        emptyTimeout: 0,
        egress: egressConfig,
      });
    } catch (err) {
      console.error("[sip-outbound] createRoom failed:", err);
      await bestEffortCleanup(callId, roomName, "room_create_failed");
      return NextResponse.json(
        {
          error: "sip_dispatch_failed",
          detail: err instanceof Error ? err.message : "createRoom error",
        },
        { status: 500 },
      );
    }

    // ── 11. Dispatch AI agent worker ──────────────────────────
    try {
      await dispatchAgent(roomName, "lead-friendly", metadata);
    } catch (err) {
      console.error("[sip-outbound] dispatchAgent failed:", err);
      await bestEffortCleanup(callId, roomName, "dispatch_failed");
      return NextResponse.json(
        {
          error: "sip_dispatch_failed",
          detail: err instanceof Error ? err.message : "dispatchAgent error",
        },
        { status: 500 },
      );
    }

    // ── 12. Dial the contact via LiveKit SIP ──────────────────
    const outboundTrunkId = process.env.LIVEKIT_SIP_OUTBOUND_TRUNK_ID;
    if (!outboundTrunkId) {
      console.error("[sip-outbound] LIVEKIT_SIP_OUTBOUND_TRUNK_ID not set");
      await bestEffortCleanup(callId, roomName, "missing_trunk_config");
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
      await bestEffortCleanup(callId, roomName, "sip_dispatch_failed");
      return NextResponse.json(
        {
          error: "sip_dispatch_failed",
          detail: err instanceof Error ? err.message : "createSipParticipant error",
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      callId,
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

// ── Helpers ──────────────────────────────────────────────────

/**
 * Mark the calls row as failed and tear down the room, if any. Called when
 * a post-insert step (room create / dispatch / SIP dial) fails and we want
 * to leave a visible failure record rather than a silently-stuck 'initiated'
 * row. All errors are logged but not thrown — we're already in an error path.
 */
async function bestEffortCleanup(
  callId: string,
  roomName: string,
  hangupCause: string,
): Promise<void> {
  try {
    await supabaseAdmin
      .from("calls")
      .update({
        status: "failed",
        ended_at: new Date().toISOString(),
        hangup_cause: hangupCause,
        hangup_source: "livekit",
      })
      .eq("id", callId);
  } catch (e) {
    console.error(`[sip-outbound] cleanup: mark-failed error:`, e);
  }
  try {
    await deleteRoom(roomName);
  } catch (e) {
    // deleteRoom throws if room never existed or already gone — harmless
    console.error(`[sip-outbound] cleanup: deleteRoom error (benign if room not created):`, e);
  }
}
