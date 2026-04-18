import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { data, error } = await supabase
    .from('call_annotations')
    .insert({ ...body, user_id: user.id })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ annotation: data });
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const callId = searchParams.get('call_id');
  const agentId = searchParams.get('agent_id');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = supabase
    .from('call_annotations')
    .select('*, calls(agent_id)')
    .eq('user_id', user.id);

  if (callId) query = query.eq('call_id', callId);

  // Filter by agent_id via the joined calls table
  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // If filtering by agent, do it client-side on the join result
  const filtered = agentId
    ? (data as Array<{ calls?: { agent_id?: string } }>).filter(
        a => a.calls?.agent_id === agentId
      )
    : data;

  return NextResponse.json({ annotations: filtered });
}
