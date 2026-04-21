// src/lib/client-state.ts
// Single source of truth for Telnyx client_state round-trip.
// Any new field added to ClientState MUST also be added to the
// decodeClientState whitelist below, or the build will fail.

export type ClientState = {
  callRecordId?: string;
  contactId?: string | null;
  agentId?: string | null;
  organizationId?: string | null;
  callMode?: "manual" | "ai_agent" | "callback_bridge";
  conversationHistory: { role: "user" | "assistant"; content: string }[];
  turnCount: number;
  emptyGatherStreak?: number;
  // agentConfig is refined to a richer type in voice/answer/route.ts via
  // intersection; kept loose here to avoid pulling agent logic into this
  // layer and creating circular deps.
  agentConfig?: unknown;
  systemPrompt?: string;
  draftGreeting?: string;
  draftSystemPrompt?: string;
  draftVoiceId?: string;
  isTestCall?: boolean;
  answeredAt?: number;
  transcribing?: boolean;
  lastSpeechTimestamp?: number;
  callDirection?: "inbound" | "outbound";
  pendingSpeakText?: string;
  elevenLabsDisabled?: boolean;
  declineStreak?: number;
  // Callback-bridge fields (previously untyped, accessed via `as any`).
  legA?: boolean;
  bridgeTarget?: string;
  bridgeFrom?: string;
  legACallControlId?: string;
};

export function emptyClientState(): ClientState {
  return { conversationHistory: [], turnCount: 0, emptyGatherStreak: 0 };
}

// Drift-proof decoder.
//
// The `satisfies` clause on the object literal makes TypeScript fail the
// build if any field on ClientState is missing from the mapping below.
// Adding a field to ClientState → you MUST add it here → compiler catches
// forgotten updates.
//
// Previously this function silently whitelist-dropped `callMode`,
// `declineStreak`, `legA`, `bridgeTarget`, `bridgeFrom`, and
// `legACallControlId`, making the callback_bridge flow completely
// unreachable at runtime.
export function decodeClientState(raw: string | undefined): ClientState {
  if (!raw) return emptyClientState();
  try {
    const parsed = JSON.parse(
      Buffer.from(raw, "base64").toString("utf-8"),
    ) as Record<string, unknown>;

    const decoded = {
      callRecordId: typeof parsed.callRecordId === "string" ? parsed.callRecordId : undefined,
      contactId:
        typeof parsed.contactId === "string"
          ? parsed.contactId
          : parsed.contactId === null
            ? null
            : undefined,
      agentId:
        typeof parsed.agentId === "string"
          ? parsed.agentId
          : parsed.agentId === null
            ? null
            : undefined,
      organizationId:
        typeof parsed.organizationId === "string"
          ? parsed.organizationId
          : parsed.organizationId === null
            ? null
            : undefined,
      callMode:
        parsed.callMode === "manual" ||
        parsed.callMode === "ai_agent" ||
        parsed.callMode === "callback_bridge"
          ? (parsed.callMode as ClientState["callMode"])
          : undefined,
      conversationHistory: Array.isArray(parsed.conversationHistory)
        ? (parsed.conversationHistory as ClientState["conversationHistory"])
        : [],
      turnCount: typeof parsed.turnCount === "number" ? parsed.turnCount : 0,
      emptyGatherStreak:
        typeof parsed.emptyGatherStreak === "number" ? parsed.emptyGatherStreak : 0,
      agentConfig: parsed.agentConfig ?? undefined,
      systemPrompt: typeof parsed.systemPrompt === "string" ? parsed.systemPrompt : undefined,
      draftGreeting: typeof parsed.draftGreeting === "string" ? parsed.draftGreeting : undefined,
      draftSystemPrompt:
        typeof parsed.draftSystemPrompt === "string" ? parsed.draftSystemPrompt : undefined,
      draftVoiceId: typeof parsed.draftVoiceId === "string" ? parsed.draftVoiceId : undefined,
      isTestCall: !!parsed.isTestCall,
      answeredAt: typeof parsed.answeredAt === "number" ? parsed.answeredAt : undefined,
      transcribing: !!parsed.transcribing,
      lastSpeechTimestamp:
        typeof parsed.lastSpeechTimestamp === "number"
          ? parsed.lastSpeechTimestamp
          : undefined,
      callDirection:
        parsed.callDirection === "inbound"
          ? "inbound"
          : parsed.callDirection === "outbound"
            ? "outbound"
            : undefined,
      pendingSpeakText:
        typeof parsed.pendingSpeakText === "string" ? parsed.pendingSpeakText : undefined,
      elevenLabsDisabled: !!parsed.elevenLabsDisabled,
      declineStreak: typeof parsed.declineStreak === "number" ? parsed.declineStreak : undefined,
      legA: typeof parsed.legA === "boolean" ? parsed.legA : undefined,
      bridgeTarget: typeof parsed.bridgeTarget === "string" ? parsed.bridgeTarget : undefined,
      bridgeFrom: typeof parsed.bridgeFrom === "string" ? parsed.bridgeFrom : undefined,
      legACallControlId:
        typeof parsed.legACallControlId === "string" ? parsed.legACallControlId : undefined,
    } satisfies Record<keyof ClientState, unknown>;
    // ^^ The `satisfies` clause enforces that the decoder literal contains
    // every key in ClientState — adding a field to the type without adding
    // it here causes TS2741 ("Property 'X' is missing"). `unknown` for
    // values keeps the check drift-focused rather than fighting
    // TypeScript's optional-property narrowing rules.

    return decoded as ClientState;
  } catch (err) {
    console.error("[CLIENT_STATE] decode failed, returning empty state:", err);
    return emptyClientState();
  }
}

export function encodeClientState(state: ClientState): string {
  // Telnyx's client_state has a ~8KB limit. Trim conversation history
  // proactively to stay under it. Earlier turns are summarized into the
  // system prompt elsewhere, so trimming tail-end turns is safe.
  const trimmed: ClientState = { ...state };

  // Normal trim: keep the last 24 messages (~12 turns).
  if (trimmed.conversationHistory.length > 24) {
    trimmed.conversationHistory = trimmed.conversationHistory.slice(-24);
  }

  const encoded = Buffer.from(JSON.stringify(trimmed)).toString("base64");

  // Safety check: if we're still over ~7.5KB (leaving headroom under Telnyx's
  // 8KB ceiling), emergency-trim to the last 12 messages (~6 turns).
  if (encoded.length > 7500) {
    trimmed.conversationHistory = trimmed.conversationHistory.slice(-12);
    return Buffer.from(JSON.stringify(trimmed)).toString("base64");
  }

  return encoded;
}
