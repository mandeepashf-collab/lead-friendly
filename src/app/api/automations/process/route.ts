import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { enforceTcpa, nextValidTcpaWindow } from "@/lib/tcpa/enforce";

/**
 * POST /api/automations/process
 * Cron-compatible endpoint: processes pending automation triggers.
 * Call this from a Vercel cron job or external scheduler every minute.
 *
 * Authorization: Pass CRON_SECRET in the Authorization header
 * to prevent unauthorized triggering.
 */
export async function POST(req: NextRequest) {
  // Parse optional body (campaign_launch path uses it; cron path doesn't)
  let body: { type?: string; campaign_id?: string } = {};
  try { body = await req.json(); } catch { /* no body — cron call */ }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // ── campaign_launch: called from the app when a user launches a campaign ──
  if (body.type === 'campaign_launch') {
    const { campaign_id } = body;
    if (!campaign_id) {
      return NextResponse.json({ error: 'campaign_id required' }, { status: 400 });
    }

    const { data: campaign } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaign_id)
      .single();

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    // Note: from-number selection is delegated to /api/calls/sip-outbound,
    // which does its own number-pool rotation. We don't need to resolve a
    // fromNumber here anymore.

    // Build the set of contact IDs this campaign has already called so we
    // don't double-dial. A contact counts as "called" if a call record
    // exists with (campaign_id = X, contact_id = contact).
    const { data: alreadyCalled } = await supabase
      .from('calls')
      .select('contact_id')
      .eq('campaign_id', campaign_id)
      .not('contact_id', 'is', null);
    const calledSet = new Set<string>();
    (alreadyCalled || []).forEach((c: { contact_id: string | null }) => {
      if (c.contact_id) calledSet.add(c.contact_id);
    });

    const dailyLimit = campaign.daily_call_limit || 10;

    // Resolve dialable contact IDs via RPC. This applies:
    //   - contact_filter.tags (OR semantics)
    //   - campaigns.snapshot_at (post-launch tags excluded)
    //   - do_not_call=false (TCPA baseline)
    //   - phone IS NOT NULL AND phone <> ''
    // Does NOT dedupe against already-called contacts — that's done below
    // against `calledSet`.
    const { data: resolvedIds, error: resolveErr } = await supabase
      .rpc('resolve_campaign_contacts', { p_campaign_id: campaign_id });
    if (resolveErr) {
      console.error('resolve_campaign_contacts failed:', resolveErr);
      return NextResponse.json({ ok: false, error: resolveErr.message }, { status: 500 });
    }
    // RPC return shape varies between supabase-js minor releases. For
    // RETURNS SETOF uuid the client may give us either:
    //   1. an array of bare uuid strings:  ['uuid1', 'uuid2']
    //   2. an array of objects keyed by function name:
    //      [{ resolve_campaign_contacts: 'uuid1' }, ...]
    // The earlier code only handled shape (2) and silently dropped to an
    // array of `undefined` for shape (1) — which then fed `.in('id', ...)`
    // and matched zero rows, producing the misleading
    // "no uncalled contacts remain" early return on every fresh launch.
    // Defend by accepting both.
    const resolvedIdList: string[] = Array.isArray(resolvedIds)
      ? resolvedIds
          .map((r: unknown) =>
            typeof r === 'string'
              ? r
              : (r as { resolve_campaign_contacts?: string } | null)?.resolve_campaign_contacts,
          )
          .filter((s): s is string => typeof s === 'string' && s.length > 0)
      : [];
    console.log(
      '[campaign_launch] resolved %d contacts for campaign %s',
      resolvedIdList.length,
      campaign_id,
    );

    // Now pull phone/id for those contact IDs
    let contacts: { id: string; phone: string | null }[] = [];
    if (resolvedIdList.length) {
      const { data: contactRows } = await supabase
        .from('contacts')
        .select('id, phone')
        .in('id', resolvedIdList);
      contacts = contactRows ?? [];
    }

    const toCall = (contacts || [])
      .filter((c) => c.phone && !calledSet.has(c.id))
      .slice(0, dailyLimit);

    if (toCall.length === 0) {
      return NextResponse.json({
        ok: true,
        message: 'No uncalled contacts remain (all contacts already dialed by this campaign or none available)',
        triggered: 0,
      });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    let triggered = 0;
    let failed = 0;
    let skippedForCompliance = 0;
    for (const contact of toCall) {
      if (!contact.phone) continue;

      // TCPA compliance gate — runs per-contact BEFORE dispatching to
      // /api/calls/trigger. Hard blocks and soft blocks both terminate for
      // automated mode; the contact gets a scheduled_actions retry row for
      // the next valid window so the ops team can see why it was held back.
      const verdict = await enforceTcpa({
        orgId: campaign.organization_id,
        userId: (campaign.created_by as string | null) ?? '',
        userRole: 'admin', // campaign processor acts with system privileges
        contactId: contact.id,
        mode: 'automated',
        supabase,
      });

      if (verdict.status === 'hard_blocked') {
        const nextWindow = await nextValidTcpaWindow({
          orgId: campaign.organization_id,
          contactId: contact.id,
          supabase,
        });
        await supabase.from('scheduled_actions').insert({
          organization_id: campaign.organization_id,
          contact_id: contact.id,
          action_type: 'retry_call',
          action_payload: {
            source: 'campaign',
            campaign_id: campaign_id,
            ai_agent_id: campaign.ai_agent_id,
            blocks: verdict.blocks,
            original_attempt_at: new Date().toISOString(),
          },
          scheduled_for: nextWindow?.toISOString() ?? null,
          status: 'skipped_compliance',
          last_error: `TCPA: ${verdict.blocks.map((b) => b.code).join(',')}`,
        });
        skippedForCompliance++;
        continue;
      }

      try {
        // Route through /api/calls/sip-outbound — the LiveKit/Deepgram
        // pipeline. ~1-2s turn time, always-on Room Composite recording,
        // async Deepgram nova-3 transcription. Same path the softphone
        // uses (per docs/browser-softphone-architecture-memo.md).
        // The earlier inline-Telnyx path produced 10-13s turn time, no
        // recording, and no transcript — regression we just unwound.
        const res = await fetch(`${appUrl}/api/calls/sip-outbound`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // Service-role key matches the campaign-launch auth path on
            // /api/calls/sip-outbound. organizationId travels in the body.
            'x-campaign-launch-key': process.env.SUPABASE_SERVICE_ROLE_KEY || '',
          },
          body: JSON.stringify({
            agentId: campaign.ai_agent_id,
            contactId: contact.id,
            campaignId: campaign_id,
            organizationId: campaign.organization_id,
          }),
        });

        if (res.ok) {
          triggered++;
        } else {
          failed++;
          console.error(
            '[campaign_launch] sip-outbound failed for contact %s: %s %s',
            contact.id, res.status, (await res.text()).slice(0, 300),
          );
        }
        // 1-second inter-call spacing so we don't tail-slam LiveKit's
        // SIP creation rate limits.
        await new Promise((r) => setTimeout(r, 1000));
      } catch (err) {
        console.error('Failed to trigger call for contact', contact.id, err);
        failed++;
      }
    }

    // Bump the campaign's total_contacted by the new triggers (not set-to)
    await supabase.from('campaigns')
      .update({ total_contacted: (campaign.total_contacted || 0) + triggered })
      .eq('id', campaign_id);

    return NextResponse.json({
      ok: true,
      triggered,
      failed,
      skippedForCompliance,
      remaining: toCall.length,
    });
  }

  // ── cron path: original automation processing ─────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const in1h = new Date(now.getTime() + 60 * 60 * 1000);
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

  const processed: string[] = [];

  // Fetch active automations
  const { data: automations } = await supabase
    .from("automations")
    .select("*, templates(*)")
    .eq("is_active", true);

  if (!automations || automations.length === 0) {
    return NextResponse.json({ processed: 0, message: "No active automations" });
  }

  // Helper to build a date-range filter on the split (appointment_date, start_time) schema
  // used by the frontend. Filters on date first (cheap) then narrows by time in memory.
  const windowInMemory = (
    appts: Array<{ appointment_date?: string; start_time?: string; end_time?: string }>,
    from: Date,
    to: Date,
    field: "start" | "end"
  ) => {
    return appts.filter((a) => {
      const t = field === "start" ? a.start_time : a.end_time;
      if (!a.appointment_date || !t) return false;
      // Combine date + time into a single Date in the server's timezone.
      // Appointments are stored in the org's local time; for reminder math
      // we treat them as ISO local and compare against `now`.
      const ts = new Date(`${a.appointment_date}T${t}`);
      return ts >= from && ts <= to;
    });
  };

  for (const automation of automations) {
    try {
      if (automation.trigger_type === "appointment_reminder" && automation.delay_minutes === -1440) {
        // 24h before appointments
        const fromDate = now.toISOString().slice(0, 10);
        const toDate = in24h.toISOString().slice(0, 10);
        const { data: appointments } = await supabase
          .from("appointments")
          .select("id, contact_id, appointment_date, start_time, end_time, contacts(phone, first_name)")
          .gte("appointment_date", fromDate)
          .lte("appointment_date", toDate)
          .in("status", ["confirmed", "scheduled"]);

        for (const appt of windowInMemory(appointments || [], now, in24h, "start")) {
          await sendAutomation(supabase, automation, appt, "appointment_reminder_24h", processed);
        }
      }

      if (automation.trigger_type === "appointment_reminder" && automation.delay_minutes === -60) {
        // 1h before appointments
        const today = now.toISOString().slice(0, 10);
        const { data: appointments } = await supabase
          .from("appointments")
          .select("id, contact_id, appointment_date, start_time, end_time, contacts(phone, first_name)")
          .eq("appointment_date", today)
          .in("status", ["confirmed", "scheduled"]);

        for (const appt of windowInMemory(appointments || [], now, in1h, "start")) {
          await sendAutomation(supabase, automation, appt, "appointment_reminder_1h", processed);
        }
      }

      if (automation.trigger_type === "appointment_completed" && automation.delay_minutes === 120) {
        // 2 hours after completed appointments
        const today = now.toISOString().slice(0, 10);
        const yday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const { data: appointments } = await supabase
          .from("appointments")
          .select("id, contact_id, appointment_date, start_time, end_time, contacts(phone, first_name)")
          .in("appointment_date", [today, yday])
          .eq("status", "completed");

        for (const appt of windowInMemory(appointments || [], twoHoursAgo, oneHourAgo, "end")) {
          await sendAutomation(supabase, automation, appt, "appointment_followup", processed);
        }
      }
    } catch (err) {
      console.error(`Automation ${automation.id} error:`, err);
    }
  }

  return NextResponse.json({ processed: processed.length, items: processed });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function sendAutomation(
  supabase: any,
  automation: any,
  appointment: any,
  refType: string,
  processed: string[]
) {
  const contact_id = appointment.contact_id;
  const appt_id = appointment.id;

  if (!contact_id) return;

  // Check if already sent
  const { data: existing } = await supabase
    .from("automation_log")
    .select("id")
    .eq("automation_id", automation.id)
    .eq("contact_id", contact_id)
    .eq("reference_id", appt_id)
    .limit(1);

  if (existing && existing.length > 0) return; // Already sent

  const contact = appointment.contacts;
  const phone = contact?.phone;
  const firstName = contact?.first_name || "there";

  if (!phone) return;

  // Build message from template. Combine appointment_date + start_time so
  // the formatting helpers work consistently whether we're looking at a row
  // with split date/time fields (new schema) or a legacy starts_at row.
  const apptDateStr = appointment.appointment_date || appointment.starts_at;
  const apptTimeStr = appointment.start_time || "";
  const combined = apptTimeStr ? new Date(`${apptDateStr}T${apptTimeStr}`) : new Date(apptDateStr);
  let message = automation.templates?.body || "";
  message = message
    .replace(/{{first_name}}/g, firstName)
    .replace(/{{appointment_date}}/g, combined.toLocaleDateString())
    .replace(/{{appointment_time}}/g, combined.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));

  if (!message) return;

  // Send SMS via internal route
  const smsUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/sms/send`;
  await fetch(smsUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to: phone, message, contact_id, template_id: automation.template_id }),
  });

  // Log the automation
  await supabase.from("automation_log").insert({
    automation_id: automation.id,
    contact_id,
    reference_id: appt_id,
    status: "sent",
  });

  processed.push(`${refType}:${contact_id}:${appt_id}`);
}
