-- ══════════════════════════════════════════════════════════════════
-- 009: WebRTC support columns
-- ══════════════════════════════════════════════════════════════════
-- Adds columns needed for LiveKit WebRTC voice calls alongside the
-- existing Telnyx webhook flow.

-- calls: distinguish call type and store LiveKit room ID
ALTER TABLE calls
  ADD COLUMN IF NOT EXISTS call_type text DEFAULT 'telnyx',
  ADD COLUMN IF NOT EXISTS livekit_room_id text;

-- ai_agents: per-agent toggle for WebRTC vs legacy Telnyx
ALTER TABLE ai_agents
  ADD COLUMN IF NOT EXISTS webrtc_enabled boolean DEFAULT false;

-- Index for looking up calls by LiveKit room
CREATE INDEX IF NOT EXISTS idx_calls_livekit_room_id
  ON calls (livekit_room_id)
  WHERE livekit_room_id IS NOT NULL;

-- Comment for clarity
COMMENT ON COLUMN calls.call_type IS 'telnyx = legacy webhook flow, webrtc = LiveKit WebRTC flow';
COMMENT ON COLUMN calls.livekit_room_id IS 'LiveKit room name for WebRTC calls';
COMMENT ON COLUMN ai_agents.webrtc_enabled IS 'Whether this agent uses the WebRTC pipeline (vs Telnyx webhooks)';
