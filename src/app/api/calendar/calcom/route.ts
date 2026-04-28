import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { validateCalcomApiKey } from '@/lib/calcom/client'

// ─────────────────────────────────────────────────────────────────────────────
// /api/calendar/calcom — save, read, disconnect Cal.com integration
// ─────────────────────────────────────────────────────────────────────────────
//
// POST   — save (or replace) Cal.com API key + Event Type ID for the org.
//          Validates the key against Cal.com /v2/me before persisting.
// GET    — return the current integration row (or null) for the org. Sensitive
//          fields are stripped: only `connected`, `eventTypeId`, and
//          `connectedAt` are returned to the client.
// DELETE — disconnect (status='revoked'). Keeps the row for audit but
//          getCalcomIntegration() filters by status='active' so booking calls
//          stop firing.
//
// Auth: standard session-based auth via Supabase cookies. We resolve the
// user's organization_id via profiles like every other settings endpoint.
// ─────────────────────────────────────────────────────────────────────────────

interface SaveBody {
  apiKey?: string
  eventTypeId?: string | number
}

async function getUserOrg(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Unauthorized', status: 401 as const }
  }
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .maybeSingle()
  if (profileErr || !profile?.organization_id) {
    return { error: 'No organization for user', status: 400 as const }
  }
  return { user, organizationId: profile.organization_id, supabase }
}

export async function POST(req: NextRequest) {
  const ctx = await getUserOrg(req)
  if ('error' in ctx) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  }
  const { user, organizationId, supabase } = ctx

  let body: SaveBody = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : ''
  const eventTypeIdRaw = body.eventTypeId
  const eventTypeIdNum = Number(eventTypeIdRaw)

  if (!apiKey) {
    return NextResponse.json({ error: 'Cal.com API key is required' }, { status: 400 })
  }
  if (!Number.isFinite(eventTypeIdNum) || eventTypeIdNum <= 0) {
    return NextResponse.json({ error: 'Event Type ID must be a positive number' }, { status: 400 })
  }

  // Validate the key actually works before saving — better UX than silent
  // booking failures later.
  const valid = await validateCalcomApiKey(apiKey)
  if (!valid.ok) {
    console.error('[cal_com] validation failed:', valid.error)
    return NextResponse.json(
      { error: valid.error || 'Cal.com rejected the API key. Double-check the key and try again.' },
      { status: 400 },
    )
  }

  // Upsert the integration row. We key on (organization_id, provider) so each
  // org has a single Cal.com row regardless of which user connected it.
  const { error: upsertErr } = await supabase
    .from('calendar_integrations')
    .upsert(
      {
        organization_id: organizationId,
        user_id: user.id,
        provider: 'cal_com',
        access_token: apiKey,
        default_event_type_id: String(eventTypeIdNum),
        status: 'active',
        connected_at: new Date().toISOString(),
        last_synced_at: new Date().toISOString(),
      },
      { onConflict: 'organization_id,provider' },
    )

  if (upsertErr) {
    console.error('[cal_com] upsert failed:', upsertErr)
    return NextResponse.json(
      { error: 'Failed to save Cal.com integration', details: upsertErr.message },
      { status: 500 },
    )
  }

  return NextResponse.json({ ok: true, connected: true, eventTypeId: eventTypeIdNum })
}

export async function GET(req: NextRequest) {
  const ctx = await getUserOrg(req)
  if ('error' in ctx) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  }
  const { organizationId, supabase } = ctx

  const { data, error } = await supabase
    .from('calendar_integrations')
    .select('default_event_type_id, status, connected_at')
    .eq('organization_id', organizationId)
    .eq('provider', 'cal_com')
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!data || data.status !== 'active') {
    return NextResponse.json({ connected: false, eventTypeId: null, connectedAt: null })
  }

  return NextResponse.json({
    connected: true,
    eventTypeId: data.default_event_type_id ? Number(data.default_event_type_id) : null,
    connectedAt: data.connected_at,
  })
}

export async function DELETE(req: NextRequest) {
  const ctx = await getUserOrg(req)
  if ('error' in ctx) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  }
  const { organizationId, supabase } = ctx

  const { error } = await supabase
    .from('calendar_integrations')
    .update({ status: 'revoked' })
    .eq('organization_id', organizationId)
    .eq('provider', 'cal_com')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, connected: false })
}
