import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/voice/preview?voiceId=xxx
 *
 * Proxies ElevenLabs premade voice preview audio through our own backend.
 * This eliminates CSP issues (previews served from 'self') and protects
 * against CDN URL changes. Responses are cached for 24h.
 */

// In-memory cache: voiceId -> { buffer, contentType, cachedAt }
const cache = new Map<string, { buffer: ArrayBuffer; contentType: string; cachedAt: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

export async function GET(req: NextRequest) {
  const voiceId = req.nextUrl.searchParams.get("voiceId");

  if (!voiceId || !/^[a-zA-Z0-9]{10,30}$/.test(voiceId)) {
    return NextResponse.json({ error: "Invalid voiceId" }, { status: 400 });
  }

  // Check cache
  const cached = cache.get(voiceId);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL) {
    return new NextResponse(cached.buffer, {
      status: 200,
      headers: {
        "Content-Type": cached.contentType,
        "Cache-Control": "public, max-age=86400, immutable",
        "X-Cache": "HIT",
      },
    });
  }

  // Try to get voice info from ElevenLabs API to find the preview URL
  const apiKey = process.env.ELEVENLABS_API_KEY;
  let previewUrl: string | null = null;

  if (apiKey) {
    try {
      const voiceRes = await fetch(`https://api.elevenlabs.io/v1/voices/${voiceId}`, {
        headers: { "xi-api-key": apiKey },
      });
      if (voiceRes.ok) {
        const data = (await voiceRes.json()) as { preview_url?: string };
        previewUrl = data.preview_url || null;
      }
    } catch {
      // Fall through to fallback
    }
  }

  // Fallback: construct the known Google Cloud Storage pattern
  if (!previewUrl) {
    // Can't construct without knowing the exact path, try the API without auth
    try {
      const voiceRes = await fetch(`https://api.elevenlabs.io/v1/voices/${voiceId}`);
      if (voiceRes.ok) {
        const data = (await voiceRes.json()) as { preview_url?: string };
        previewUrl = data.preview_url || null;
      }
    } catch {
      // Fall through
    }
  }

  if (!previewUrl) {
    return NextResponse.json(
      { error: "Voice preview not found" },
      { status: 404 },
    );
  }

  // Fetch the actual audio
  try {
    const audioRes = await fetch(previewUrl);
    if (!audioRes.ok) {
      return NextResponse.json(
        { error: "Failed to fetch preview audio" },
        { status: 502 },
      );
    }

    const buffer = await audioRes.arrayBuffer();
    const contentType = audioRes.headers.get("Content-Type") || "audio/mpeg";

    // Cache it
    cache.set(voiceId, { buffer, contentType, cachedAt: Date.now() });

    // Limit cache size (evict oldest)
    if (cache.size > 100) {
      const oldest = [...cache.entries()].sort((a, b) => a[1].cachedAt - b[1].cachedAt)[0];
      if (oldest) cache.delete(oldest[0]);
    }

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, immutable",
        "X-Cache": "MISS",
      },
    });
  } catch (err) {
    console.error("[Voice preview proxy error]", err);
    return NextResponse.json(
      { error: "Failed to proxy preview audio" },
      { status: 500 },
    );
  }
}
