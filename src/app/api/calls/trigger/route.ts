import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

/**
 * POST /api/calls/trigger
 * DEPRECATED — Use /api/calls/human (Path A bridge) or /api/calls/agent instead.
 *
 * This route is kept as a compatibility shim. New code should call:
 *   - /api/calls/human  → for human-dialed calls (callback bridge)
 *   - /api/calls/agent  → for AI agent outbound calls
 *
 * Body: { contactId?, contactPhone, fromNumber, agentId?, campaignId?, organizationId?, callMode? }
 */
export async function POST(request: NextRequest) {
  console.warn("[DEPRECATED] /api/calls/trigger called — migrate to /api/calls/human or /api/calls/agent");
  let body: {
    contactId?: string;
    contactPhone?: string;
    fromNumber?: string;
    agentId?: string;
    campaignId?: string;
    organizationId?: string;
    callMode?: 'manual' | 'ai_agent';
  } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { contactId, contactPhone, fromNumber, agentId, organizationId, callMode } = body;
  if (!contactPhone) {
    return NextResponse.json({ error: 'contactPhone is required' }, { status: 400 });
  }

  if (!process.env.TELNYX_API_KEY || !process.env.TELNYX_APP_ID) {
    console.error('Missing TELNYX env vars');
    return NextResponse.json(
      { error: 'Server misconfigured: missing Telnyx credentials' },
      { status: 500 }
    );
  }

  const campaignKey = request.headers.get('x-campaign-launch-key');
  const isCampaignLaunch = !!campaignKey
    && !!process.env.SUPABASE_SERVICE_ROLE_KEY
    && campaignKey === process.env.SUPABASE_SERVICE_ROLE_KEY;

  let orgId: string | null = null;

  if (isCampaignLaunch) {
    if (!organizationId) {
      return NextResponse.json(
        { error: 'organizationId required for campaign launch' },
        { status: 400 }
      );
    }
    orgId = organizationId;
  } else {
    const userSupabase = await createClient();
    const { data: { user }, error: authError } = await userSupabase.auth.getUser();
    console.log('Auth result:', user?.id ?? 'NO USER', authError?.message ?? 'no error');
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized — no user session', authError: authError?.message }, { status: 401 });
    }
    const { data: profile, error: profileError } = await userSupabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single();
    console.log('Profile result:', profile?.organization_id ?? 'NO ORG', profileError?.message ?? 'no error');
    if (!profile?.organization_id) {
      return NextResponse.json({ error: 'Organization not found for user', userId: user.id, profileError: profileError?.message }, { status: 400 });
    }
    orgId = profile.organization_id;
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('SUPABASE_SERVICE_ROLE_KEY not set');
    return NextResponse.json({ error: 'Server config error: SUPABASE_SERVICE_ROLE_KEY missing' }, { status: 500 });
  }
  console.log('Using service-role client, orgId:', orgId);
  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const toNumber = contactPhone.startsWith('+') ? contactPhone : `+1${contactPhone.replace(/\D/g, '')}`;

  // Number Pool Rotation
  let from: string;
  if (fromNumber) {
    from = fromNumber.startsWith('+') ? fromNumber : `+1${fromNumber.replace(/\D/g, '')}`;
  } else {
    const { data: availableNumbers, error: numError } = await supabase
      .from('phone_numbers')
      .select('id, number, daily_used, daily_cap, rotation_order, last_used_at')
      .eq('organization_id', orgId!)
      .eq('status', 'active')
      .order('rotation_order', { ascending: true })
      .order('last_used_at', { ascending: true, nullsFirst: true });

    if (numError || !availableNumbers || availableNumbers.length === 0) {
      console.error('No available phone numbers:', numError?.message);
      return NextResponse.json(
        { error: 'No active phone numbers available. Add a phone number in Settings > Phone Numbers.' },
        { status: 400 }
      );
    }

    const underLimit = availableNumbers.filter(n => {
      const cap = (n.daily_cap as number) || 50;
      const used = (n.daily_used as number) || 0;
      return used < cap;
    });

    if (underLimit.length === 0) {
      console.warn('All phone numbers exhausted daily limits for org:', orgId);
      return NextResponse.json(
        { error: 'All phone numbers have reached their daily call limit. Add more numbers or wait until tomorrow.' },
        { status: 429 }
      );
    }

    const selectedNumber = underLimit[0];
    from = selectedNumber.number as string;

    const newCount = ((selectedNumber.daily_used as number) || 0) + 1;
    await supabase
      .from('phone_numbers')
      .update({
        daily_used: newCount,
        last_used_at: new Date().toISOString(),
      })
      .eq('id', selectedNumber.id);

    const cap = (selectedNumber.daily_cap as number) || 50;
    if (newCount >= cap) {
      await supabase
        .from('phone_numbers')
        .update({ status: 'exhausted' })
        .eq('id', selectedNumber.id);
      console.log(`Number ${from} exhausted (${newCount}/${cap}), marked as exhausted`);
    }

    console.log(`[Number Pool] Selected ${from} (${newCount}/${cap} daily) from ${availableNumbers.length} numbers`);
  }

  const insertPayload = {
    organization_id: orgId!,
    contact_id: contactId ?? null,
    direction: 'outbound' as const,
    status: 'initiated',
    from_number: from,
    to_number: toNumber,
    ai_agent_id: agentId ?? null,
    started_at: new Date().toISOString(),
  };
  console.log('Inserting call record:', JSON.stringify(insertPayload));

  const { data: callRecord, error: dbError } = await supabase
    .from('calls')
    .insert(insertPayload)
    .select('id, organization_id')
    .maybeSingle();

  if (dbError) {
    console.error('Call record insert error:', JSON.stringify(dbError));
    return NextResponse.json(
      { error: `DB insert failed: ${dbError.message}`, code: dbError.code, hint: dbError.hint },
      { status: 500 }
    );
  }

  let callRecordId: string;
  if (!callRecord) {
    console.warn('Insert returned no data — trying direct lookup');
    const { data: latestCall } = await supabase
      .from('calls')
      .select('id')
      .eq('organization_id', orgId!)
      .eq('to_number', toNumber)
      .eq('status', 'initiated')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!latestCall) {
      console.error('Call record truly not created — insert returned no data and lookup found nothing');
      return NextResponse.json({ error: 'DB insert succeeded but record not found on lookup' }, { status: 500 });
    }
    console.log('Found call record via lookup:', latestCall.id);
    callRecordId = latestCall.id;
  } else {
    console.log('Call record created:', callRecord.id);
    callRecordId = callRecord.id;
  }

  const isManualCall = callMode === 'manual' || !agentId;
  const clientState = Buffer.from(
    JSON.stringify({
      callRecordId: callRecordId,
      contactId: contactId ?? null,
      agentId: agentId ?? null,
      organizationId: orgId,
      callMode: isManualCall ? 'manual' : 'ai_agent',
      conversationHistory: [],
      turnCount: 0,
    })
  ).toString('base64');

  const webhookUrl = process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL}/api/voice/answer`
    : 'https://www.leadfriendly.com/api/voice/answer';

  const telnyxRes = await fetch('https://api.telnyx.com/v2/calls', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.TELNYX_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      connection_id: process.env.TELNYX_APP_ID,
      to: toNumber,
      from,
      webhook_url: webhookUrl,
      webhook_url_method: 'POST',
      client_state: clientState,
    }),
  });

  const telnyxText = await telnyxRes.text();
  console.log('Telnyx status:', telnyxRes.status, 'body:', telnyxText.slice(0, 300));

  if (!telnyxRes.ok) {
    await supabase.from('calls').update({ status: 'failed' }).eq('id', callRecordId);
    return NextResponse.json(
      { error: 'Telnyx call failed', details: telnyxText, status: telnyxRes.status },
      { status: 500 }
    );
  }

  let telnyxData: { data?: { call_control_id?: string } } = {};
  try {
    telnyxData = JSON.parse(telnyxText);
  } catch {
    /* ignore */
  }

  const callControlId = telnyxData.data?.call_control_id ?? null;

  await supabase
    .from('calls')
    .update({ telnyx_call_id: callControlId, status: 'ringing' })
    .eq('id', callRecordId);

  return NextResponse.json({
    callRecordId: callRecordId,
    telnyxCallControlId: callControlId,
    status: 'ringing',
  });
}
