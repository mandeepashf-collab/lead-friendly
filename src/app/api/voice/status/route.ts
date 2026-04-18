import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Use service role for webhook handler — no user session available in Telnyx callbacks
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export async function POST(request: NextRequest) {
  const supabase = getSupabase();

  const body = await request.json() as Record<string, unknown>;
  const data = body?.data as Record<string, unknown>;
  const event = data?.event_type as string;
  const payload = data?.payload as Record<string, unknown>;

  if (!payload) return NextResponse.json({ ok: true });

  // Extract our call record ID from the Telnyx client_state field
  let callRecordId: string | null = null;
  try {
    if (payload.client_state) {
      const decoded = JSON.parse(
        Buffer.from(payload.client_state as string, 'base64').toString()
      ) as { callRecordId?: string };
      callRecordId = decoded.callRecordId ?? null;
    }
  } catch { /* ignore malformed state */ }

  // Machine detection can fire before we have a callRecordId association via client_state,
  // so handle it up here using telnyx_call_id lookup instead.
  if (event === 'call.machine.detection.ended') {
    const callControlId = payload?.call_control_id as string;
    const result = payload?.result as string; // 'human' | 'machine' | 'not_sure'

    if (result === 'machine' && callControlId) {
      const { data: callRecord } = await supabase
        .from('calls')
        .select('agent_id')
        .eq('telnyx_call_id', callControlId)
        .single();

      if (callRecord?.agent_id) {
        const { data: agent } = await supabase
          .from('ai_agents')
          .select('voicemail_action, voicemail_message, name')
          .eq('id', callRecord.agent_id)
          .single();

        if (agent?.voicemail_action === 'leave_message' && agent?.voicemail_message) {
          await fetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/speak`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${process.env.TELNYX_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ payload: agent.voicemail_message, voice: 'female', language: 'en-US' }),
          });
        } else if (agent?.voicemail_action !== 'ignore') {
          await fetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/hangup`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${process.env.TELNYX_API_KEY}`, 'Content-Type': 'application/json' },
          });
        }

        await supabase.from('calls').update({ disposition: 'voicemail', status: 'completed' })
          .eq('telnyx_call_id', callControlId);
      }
    }
    return NextResponse.json({ ok: true });
  }

  if (!callRecordId) return NextResponse.json({ ok: true });

  if (event === 'call.answered') {
    await supabase.from('calls').update({ status: 'in_progress' }).eq('id', callRecordId);

  } else if (event === 'call.hangup') {
    await supabase.from('calls').update({
      status: 'completed',
      duration_seconds: (payload.call_duration_secs as number) ?? null,
      ended_at: new Date().toISOString(),
    }).eq('id', callRecordId);

    // Post-call AI extraction
    try {
      const { data: callData } = await supabase
        .from('calls')
        .select('transcript, ai_agents(post_call_extraction, system_prompt)')
        .eq('id', callRecordId)
        .single();

      if (callData?.transcript && Array.isArray(callData.transcript) && callData.transcript.length > 0) {
        const agentRel = callData.ai_agents as unknown;
        const agentRecord = (Array.isArray(agentRel) ? agentRel[0] : agentRel) as Record<string, unknown> | null;
        const extractionFields = (agentRecord?.post_call_extraction as { field: string; description: string; type: string }[]) || [];

        if (extractionFields.length > 0) {
          const transcriptText = (callData.transcript as { speaker: string; text: string }[])
            .map(l => `${l.speaker === 'agent' ? 'Agent' : 'Lead'}: ${l.text}`)
            .join('\n');

          const extractionPrompt = `You are analyzing a sales call transcript. Extract the following fields as JSON.
Return ONLY a valid JSON object, no explanation, no markdown.

Fields to extract:
${extractionFields.map(f => `- "${f.field}": ${f.description} (type: ${f.type})`).join('\n')}

Transcript:
${transcriptText}

Return JSON only:`;

          const Anthropic = (await import('@anthropic-ai/sdk')).default;
          const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
          const aiRes = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 500,
            messages: [{ role: 'user', content: extractionPrompt }],
          });

          const rawText = aiRes.content[0].type === 'text' ? aiRes.content[0].text.trim() : '{}';
          const cleanJson = rawText.replace(/```json|```/g, '').trim();
          const extracted = JSON.parse(cleanJson);

          await supabase.from('calls').update({ notes: JSON.stringify(extracted) }).eq('id', callRecordId);
        }
      }
    } catch (extractErr) {
      console.error('Post-call extraction error:', extractErr);
      // Non-fatal — don't fail the webhook
    }

  } else if (event === 'call.recording.saved') {
    const recordingUrls = payload.recording_urls as Record<string, string> | undefined;
    await supabase.from('calls').update({
      recording_url: recordingUrls?.mp3 ?? null,
    }).eq('id', callRecordId);
  }

  return NextResponse.json({ ok: true });
}
