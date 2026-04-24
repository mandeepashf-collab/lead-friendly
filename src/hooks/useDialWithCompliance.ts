"use client";

/**
 * useDialWithCompliance — unified dial hook that wraps the full TCPA flow.
 *
 * Before: components called `fetch("/api/softphone/initiate", ...)` or
 * `fetch("/api/calls/sip-outbound", ...)` directly.
 *
 * After: call `dial({ endpoint, body, contactName, phone })` and this hook
 * handles the 403/409 responses, opens the override modal if needed,
 * retries with the token, and returns the final result.
 */

import { useCallback } from "react";
import { useTcpaOverride, type TcpaWarning } from "@/components/tcpa/TcpaOverrideProvider";
import { useToast } from "@/lib/toast";

export type DialEndpoint =
  | "/api/softphone/initiate"
  | "/api/calls/sip-outbound";

export type DialArgs = {
  endpoint: DialEndpoint;
  body: Record<string, unknown>;
  contactName: string;
  phone: string;
};

export type DialResult =
  | { ok: true; data: unknown }
  | { ok: false; reason: "hard_blocked"; blocks: TcpaWarning[] }
  | { ok: false; reason: "cancelled" }
  | { ok: false; reason: "error"; message: string };

export function useDialWithCompliance() {
  const tcpa = useTcpaOverride();
  const toast = useToast();

  const dial = useCallback(
    async (args: DialArgs): Promise<DialResult> => {
      const attempt = async (bodyOverride?: Record<string, unknown>): Promise<DialResult> => {
        const res = await fetch(args.endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bodyOverride ?? args.body),
        });

        const data = await res.json().catch(() => ({}));

        // 200 success (or automated skip, which also returns 200 but with skipped:true —
        // automated paths shouldn't use this hook, so we treat skipped as error here).
        if (res.ok && !data.skipped) {
          return { ok: true, data };
        }

        if (res.ok && data.skipped) {
          return {
            ok: false,
            reason: "error",
            message: "Call skipped for compliance (this hook shouldn't see this).",
          };
        }

        // 403 hard block
        if (res.status === 403 && data.blocks) {
          toast.error(`Can't call: ${data.blocks.map((b: TcpaWarning) => b.reason).join(", ")}`);
          return { ok: false, reason: "hard_blocked", blocks: data.blocks };
        }

        // 409 soft block — show modal
        if (res.status === 409 && data.requiresOverride && data.overrideToken) {
          const result = await tcpa.request({
            warnings: data.warnings,
            token: data.overrideToken,
            contactName: args.contactName,
            phone: args.phone,
            tokenExpired: Boolean(data.tokenExpired),
          });

          if (!result.confirmed) {
            return { ok: false, reason: "cancelled" };
          }

          // Retry with token + note
          return attempt({
            ...args.body,
            overrideToken: data.overrideToken,
            overrideNote: result.note,
          });
        }

        // Other error
        const msg = data.error ?? data.message ?? `Request failed (${res.status})`;
        toast.error(msg);
        return { ok: false, reason: "error", message: msg };
      };

      return attempt();
    },
    [tcpa, toast]
  );

  return { dial };
}
