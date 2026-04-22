/**
 * Submit a recording to Deepgram for async prerecorded transcription.
 *
 * Flow:
 * - Caller passes a signed URL to the OGG file (Supabase Storage)
 * - We POST to Deepgram's /v1/listen with transcription params + callback URL
 * - Deepgram responds immediately with a request_id and queues the job
 * - Deepgram later POSTs the transcript to our callback URL
 *
 * Returns { request_id } on success, throws on failure.
 * Caller is responsible for persisting request_id to calls.deepgram_request_id
 * so the callback can correlate.
 */

const DEEPGRAM_ENDPOINT = "https://api.deepgram.com/v1/listen";

export async function submitToDeepgram(opts: {
  audioSignedUrl: string;
  callbackBaseUrl: string; // e.g. "https://www.leadfriendly.com"
}): Promise<{ request_id: string }> {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  const callbackUser = process.env.DEEPGRAM_CALLBACK_BASIC_AUTH_USER;
  const callbackPass = process.env.DEEPGRAM_CALLBACK_BASIC_AUTH_PASS;

  if (!apiKey || !callbackUser || !callbackPass) {
    throw new Error("Deepgram env vars missing");
  }

  // Basic Auth embedded in callback URL — Deepgram's recommended auth method
  const host = opts.callbackBaseUrl.replace(/^https?:\/\//, "");
  const callbackUrl = `https://${encodeURIComponent(callbackUser)}:${encodeURIComponent(callbackPass)}@${host}/api/webhooks/deepgram`;

  const params = new URLSearchParams({
    model: "nova-3",
    smart_format: "true",
    diarize: "true",
    utterances: "true",
    punctuate: "true",
    callback: callbackUrl,
  });

  const res = await fetch(`${DEEPGRAM_ENDPOINT}?${params.toString()}`, {
    method: "POST",
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url: opts.audioSignedUrl }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Deepgram submit failed: HTTP ${res.status} ${body}`);
  }

  const data = (await res.json()) as { request_id?: string };
  if (!data.request_id) {
    throw new Error(`Deepgram submit returned no request_id: ${JSON.stringify(data)}`);
  }

  return { request_id: data.request_id };
}
