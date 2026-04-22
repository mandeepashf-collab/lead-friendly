import { useEffect, useState } from "react";

type RecordingUrlState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; signedUrl: string; expiresAt: string }
  | { status: "error"; error: string }
  | { status: "unavailable" };

/**
 * Resolves a playable signed URL for a call recording.
 *
 * Background: after the LiveKit egress pipeline (migration 014), `calls.recording_url`
 * stores a Supabase Storage key like "{org_id}/{call_id}.ogg" — not a playable URL.
 * Browsers cannot `<audio src>` a storage key directly. This hook exchanges the
 * callId for a short-lived signed URL via /api/softphone/recording-url.
 *
 * Legacy Telnyx-era recordings stored a full https:// URL in recording_url.
 * To stay backward-compatible, if the storedUrl already looks like an absolute
 * URL, return it verbatim without calling the API.
 *
 * Design:
 * - Skip the fetch entirely when the call has no recording yet (status 'unavailable')
 * - Skip the fetch when storedUrl is already a full URL (backward-compat for old rows)
 * - Only fetch when we have a callId AND the storedUrl is a storage key
 * - `enabled` flag lets callers defer the fetch until a player is expanded/opened
 *   (saves N requests on list pages where only one player plays at a time)
 */
export function useRecordingUrl(opts: {
  callId: string | null | undefined;
  storedUrl: string | null | undefined;
  enabled?: boolean;
}): RecordingUrlState {
  const { callId, storedUrl, enabled = true } = opts;
  const [state, setState] = useState<RecordingUrlState>({ status: "idle" });

  useEffect(() => {
    if (!enabled) return;
    if (!storedUrl) {
      setState({ status: "unavailable" });
      return;
    }
    // Backward-compat: legacy rows stored a full URL.
    // Detect by protocol prefix; storage keys never start with http(s)://
    if (/^https?:\/\//i.test(storedUrl)) {
      setState({
        status: "ready",
        signedUrl: storedUrl,
        // legacy URLs don't expire in a way we track; use far-future placeholder
        expiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
      });
      return;
    }
    if (!callId) {
      setState({ status: "error", error: "missing callId for storage key" });
      return;
    }

    let cancelled = false;
    setState({ status: "loading" });
    fetch(`/api/softphone/recording-url?callId=${encodeURIComponent(callId)}`, {
      credentials: "include",
    })
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 404) {
          setState({ status: "unavailable" });
          return;
        }
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          setState({ status: "error", error: `HTTP ${res.status}: ${body}` });
          return;
        }
        const data = (await res.json()) as {
          signedUrl: string;
          expiresAt: string;
        };
        setState({
          status: "ready",
          signedUrl: data.signedUrl,
          expiresAt: data.expiresAt,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [callId, storedUrl, enabled]);

  return state;
}
