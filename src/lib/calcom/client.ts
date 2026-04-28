import { createClient as createServiceClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// Cal.com integration helper
// ─────────────────────────────────────────────────────────────────────────────
//
// Cal.com is the chosen calendar integration for v1 (vs Google Calendar OAuth)
// because:
//   1. Users paste a single API key — no OAuth dance, no Google Cloud Console
//      project, no app verification.
//   2. Cal.com handles availability, conflicts, time-zone math, and connects
//      to the user's downstream calendar (Google, Outlook, Apple) on their end.
//   3. The booking call is one HTTP POST.
//
// Storage
//   We persist the API key + Event Type ID in the existing
//   `calendar_integrations` table with provider='cal_com'. The schema
//   already has access_token (we store the API key here), default_event_type_id,
//   organization_id, user_id, and status.
//
// Booking flow
//   When the AI agent's book_meeting tool fires, /api/appointments/book inserts
//   the appointment locally and then (best-effort) calls bookCalcomMeeting() to
//   push the booking to Cal.com. If Cal.com fails, the local appointment row
//   still wins — same pattern as Google Calendar would have used.
// ─────────────────────────────────────────────────────────────────────────────

const CAL_API_BASE = 'https://api.cal.com/v2'

// Cal.com API expects ISO-8601 with timezone offset for booking start time.
// We accept date='YYYY-MM-DD' + startTime='HH:MM' + timezone (IANA), and
// build the right ISO string. Cal.com does the rest of the time-zone math.
export function buildCalcomStartISO(
  date: string,
  startTime: string,
  timezone: string,
): string {
  // Cal.com /v2/bookings expects `start` in ISO-8601 plus a separate
  // `attendee.timeZone`. We pass the raw local-wall-clock time and let
  // Cal.com interpret it via the attendee timezone.
  const time = startTime.length === 5 ? `${startTime}:00` : startTime
  return `${date}T${time}`
}

export interface CalcomIntegration {
  apiKey: string
  eventTypeId: number
  organizationId: string
  userId: string | null
}

/**
 * Read the Cal.com integration row for an organization. Returns null when
 * the org hasn't connected Cal.com yet, so callers can no-op cleanly.
 */
export async function getCalcomIntegration(
  organizationId: string,
): Promise<CalcomIntegration | null> {
  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )

  const { data, error } = await supabase
    .from('calendar_integrations')
    .select('access_token, default_event_type_id, user_id')
    .eq('organization_id', organizationId)
    .eq('provider', 'cal_com')
    .eq('status', 'active')
    .maybeSingle()

  if (error || !data) return null
  if (!data.access_token || !data.default_event_type_id) return null

  const eventTypeId = Number(data.default_event_type_id)
  if (!Number.isFinite(eventTypeId) || eventTypeId <= 0) return null

  return {
    apiKey: data.access_token,
    eventTypeId,
    organizationId,
    userId: data.user_id ?? null,
  }
}

export interface CalcomBookingInput {
  apiKey: string
  eventTypeId: number
  start: string                  // ISO 8601 local wall time (no offset)
  attendeeName: string
  attendeeEmail: string
  attendeePhone?: string
  attendeeTimezone: string       // IANA tz, e.g. 'America/Los_Angeles'
  notes?: string
}

export interface CalcomBookingResult {
  ok: boolean
  bookingId?: string
  uid?: string
  error?: string
}

/**
 * Push a booking to Cal.com. Best-effort — caller is expected to log failures
 * and continue. We never throw because callers are inside webhook handlers
 * where one bad downstream shouldn't take down the whole appointment flow.
 */
export async function bookCalcomMeeting(
  input: CalcomBookingInput,
): Promise<CalcomBookingResult> {
  try {
    const res = await fetch(`${CAL_API_BASE}/bookings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json',
        'cal-api-version': '2024-08-13',
      },
      body: JSON.stringify({
        eventTypeId: input.eventTypeId,
        start: input.start,
        attendee: {
          name: input.attendeeName,
          email: input.attendeeEmail,
          timeZone: input.attendeeTimezone,
          phoneNumber: input.attendeePhone,
        },
        bookingFieldsResponses: input.notes ? { notes: input.notes } : undefined,
      }),
    })

    if (!res.ok) {
      let detail = ''
      try {
        const j = await res.json()
        detail = typeof j?.error?.message === 'string' ? j.error.message : JSON.stringify(j)
      } catch {
        try {
          detail = await res.text()
        } catch {
          detail = `HTTP ${res.status}`
        }
      }
      return { ok: false, error: `Cal.com booking failed: ${detail}` }
    }

    const data = await res.json()
    const booking = data?.data ?? data
    return {
      ok: true,
      bookingId: booking?.id ? String(booking.id) : undefined,
      uid: typeof booking?.uid === 'string' ? booking.uid : undefined,
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Unknown Cal.com error',
    }
  }
}

/**
 * Validate a Cal.com API key by hitting the /v2/me endpoint. Used by the
 * save flow to give immediate feedback when the user pastes a bad key.
 * Returns true if the key works, false otherwise. Never throws.
 */
export async function validateCalcomApiKey(apiKey: string): Promise<boolean> {
  try {
    const res = await fetch(`${CAL_API_BASE}/me`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'cal-api-version': '2024-08-13',
      },
    })
    return res.ok
  } catch {
    return false
  }
}
