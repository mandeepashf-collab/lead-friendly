import { NextRequest, NextResponse } from 'next/server'
import { checkElevenLabsHealth } from '@/lib/elevenlabs'

// GET /api/health
// Returns status of all external services
// Useful for monitoring and debugging

export async function GET(request: NextRequest) {
  const [elHealth] = await Promise.allSettled([
    checkElevenLabsHealth(),
  ])

  const el = elHealth.status === 'fulfilled' ? elHealth.value : { ok: false }

  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      elevenlabs: {
        ...el,
        model: 'eleven_flash_v2_5',
        endpoint: 'streaming (/stream)',
        retryEnabled: true,
      },
      telnyx: {
        configured: !!process.env.TELNYX_API_KEY,
        phoneNumber: process.env.TELNYX_PHONE_NUMBER || 'not set',
      },
      deepgram: {
        configured: !!process.env.DEEPGRAM_API_KEY,
      },
      supabase: {
        configured: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        url: process.env.NEXT_PUBLIC_SUPABASE_URL,
      },
    }
  })
}
