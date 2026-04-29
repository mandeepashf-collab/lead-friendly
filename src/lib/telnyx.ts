/**
 * Telnyx Call Control v2 — thin wrapper for common operations.
 *
 * All calls go through the REST API. We don't use the Telnyx Node SDK
 * because it adds unnecessary weight for the small surface we need.
 */

const TELNYX_BASE = "https://api.telnyx.com/v2";

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${process.env.TELNYX_API_KEY}`,
    "Content-Type": "application/json",
  };
}

// ── SMS ──────────────────────────────────────────────────────────

export interface SendSmsOptions {
  to: string;
  text: string;
  from?: string;                 // defaults to TELNYX_PHONE_NUMBER
  messagingProfileId?: string;   // defaults to TELNYX_MESSAGING_PROFILE_ID
}

export interface SendSmsResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Send an outbound SMS via Telnyx /v2/messages. Used by the workflow
 * dispatcher (server-to-server, no HTTP roundtrip) and by /api/sms/send
 * (HTTP-callable wrapper).
 *
 * Never throws — returns { ok: false, error } on failure so callers in
 * best-effort hot paths (post-appointment workflow firing) don't break
 * the surrounding response.
 */
export async function sendSms(opts: SendSmsOptions): Promise<SendSmsResult> {
  const apiKey = process.env.TELNYX_API_KEY;
  const fromNumber = opts.from ?? process.env.TELNYX_PHONE_NUMBER;
  const messagingProfileId = opts.messagingProfileId ?? process.env.TELNYX_MESSAGING_PROFILE_ID;

  if (!apiKey || !fromNumber) {
    return { ok: false, error: "Telnyx credentials not configured" };
  }

  try {
    const res = await fetch(`${TELNYX_BASE}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromNumber,
        to: opts.to,
        text: opts.text,
        ...(messagingProfileId ? { messaging_profile_id: messagingProfileId } : {}),
      }),
    });

    const data = await res.json().catch(() => ({} as Record<string, unknown>));

    if (!res.ok) {
      const errs = (data as { errors?: Array<{ detail?: string }> }).errors;
      const detail = errs?.[0]?.detail || `HTTP ${res.status}`;
      return { ok: false, error: detail };
    }

    const messageId = (data as { data?: { id?: string } }).data?.id;
    return { ok: true, messageId };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "SMS send failed",
    };
  }
}

// ── Core API call ────────────────────────────────────────────────

export async function telnyxPost(path: string, body: Record<string, unknown>) {
  const res = await fetch(`${TELNYX_BASE}${path}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(text); } catch { /* non-JSON response */ }
  return { ok: res.ok, status: res.status, data, raw: text };
}

// ── Dial a new call ──────────────────────────────────────────────

export interface DialOptions {
  to: string;
  from: string;
  connectionId?: string;
  clientState?: Record<string, unknown>;
  webhookUrl?: string;
  answering_machine_detection?: "detect" | "detect_beep" | "premium" | "disabled";
}

export async function dial(opts: DialOptions) {
  const webhookUrl = opts.webhookUrl
    || (process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL}/api/voice/answer`
      : "https://www.leadfriendly.com/api/voice/answer");

  const clientState = opts.clientState
    ? Buffer.from(JSON.stringify(opts.clientState)).toString("base64")
    : undefined;

  return telnyxPost("/calls", {
    connection_id: opts.connectionId || process.env.TELNYX_APP_ID,
    to: opts.to,
    from: opts.from,
    webhook_url: webhookUrl,
    webhook_url_method: "POST",
    ...(clientState ? { client_state: clientState } : {}),
    ...(opts.answering_machine_detection ? { answering_machine_detection: opts.answering_machine_detection } : {}),
  });
}

// ── Call Control actions ─────────────────────────────────────────

export async function answer(callControlId: string, clientState?: Record<string, unknown>) {
  const cs = clientState ? Buffer.from(JSON.stringify(clientState)).toString("base64") : undefined;
  return telnyxPost(`/calls/${callControlId}/actions/answer`, {
    call_control_id: callControlId,
    ...(cs ? { client_state: cs } : {}),
  });
}

export async function bridge(callControlId: string, targetCallControlId: string) {
  return telnyxPost(`/calls/${callControlId}/actions/bridge`, {
    call_control_id: callControlId,
    call_control_id_target: targetCallControlId,
  });
}

export async function hangup(callControlId: string) {
  return telnyxPost(`/calls/${callControlId}/actions/hangup`, {
    call_control_id: callControlId,
  });
}

export async function speak(callControlId: string, text: string, voice = "female", language = "en-US", clientState?: Record<string, unknown>) {
  const cs = clientState ? Buffer.from(JSON.stringify(clientState)).toString("base64") : undefined;
  return telnyxPost(`/calls/${callControlId}/actions/speak`, {
    call_control_id: callControlId,
    payload: text,
    voice,
    language,
    ...(cs ? { client_state: cs } : {}),
  });
}

// ── Hangup cause → status mapping ────────────────────────────────

const HANGUP_MAP: Record<string, string> = {
  normal_clearing: "completed",
  originator_cancel: "canceled",
  call_rejected: "rejected",
  unallocated_number: "failed",
  no_user_response: "no_answer",
  no_answer: "no_answer",
  user_busy: "busy",
  normal_temporary_failure: "failed",
  recovery_on_timer_expire: "no_answer",
  destination_out_of_order: "failed",
  invalid_number_format: "failed",
  facility_rejected: "failed",
  media_timeout: "failed",
};

export function mapHangupCause(cause: string | undefined): string {
  if (!cause) return "completed";
  return HANGUP_MAP[cause] || "completed";
}
