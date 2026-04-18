import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: call } = await supabase.from('calls')
    .select('telnyx_call_id')
    .eq('id', id)
    .single();

  if (call?.telnyx_call_id) {
    await fetch(
      `https://api.telnyx.com/v2/calls/${call.telnyx_call_id}/actions/hangup`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.TELNYX_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ call_control_id: call.telnyx_call_id }),
      }
    );
  }

  await supabase.from('calls').update({
    status: 'completed',
    ended_at: new Date().toISOString(),
  }).eq('id', id);

  return NextResponse.json({ success: true });
}
