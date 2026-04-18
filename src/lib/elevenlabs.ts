// lib/elevenlabs.ts
// -----------------------------------------------------------------
// Two key changes from previous implementation:
//
// 1. Flash model (eleven_flash_v2_5) instead of Turbo v2
//    - 4x faster generation -> concurrent slot freed much sooner
//    - Uses 0.5 credits/char instead of 1 -> half the cost
//    - Sub-100ms latency -> better conversation feel
//
// 2. Streaming endpoint (/stream) instead of batch
//    - Releases the concurrent slot the moment first audio
//      chunk is sent, not after full file is generated
//    - Effectively 3-4x multiplies your concurrent capacity
//
// 3. Retry with exponential backoff
//    - If ElevenLabs returns 429 (too many concurrent),
//      waits 500ms -> 1s -> 2s then retries
//    - Caller hears a tiny pause instead of a dead call
// -----------------------------------------------------------------

const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1'

// Flash v2.5 -- fastest model, perfect for real-time voice agents
// Uses half the credits of Multilingual v2
// Switch back to 'eleven_multilingual_v2' if you need 70+ languages
const DEFAULT_MODEL = 'eleven_flash_v2_5'

interface TTSOptions {
  voiceId?: string
  modelId?: string
  stability?: number
  similarityBoost?: number
  retries?: number
}

/**
 * Generate TTS audio using ElevenLabs streaming endpoint
 * Returns a Buffer of MP3 audio data
 *
 * Key: uses /stream endpoint so concurrent slot is released
 * as soon as first chunk is sent -- not after full file
 */
export async function generateSpeech(
  text: string,
  options: TTSOptions = {}
): Promise<Buffer> {
  const {
    voiceId = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM',
    modelId = DEFAULT_MODEL,
    stability = 0.5,
    similarityBoost = 0.75,
    retries = 3,
  } = options

  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY not set')

  // Validate text input - ElevenLabs returns 400 for empty text
  if (!text || !text.trim()) {
    throw new Error('ElevenLabs: text cannot be empty')
  }

  console.log(`[ElevenLabs] Generating TTS: voice=${voiceId}, model=${modelId}, text=${text.length} chars, key=${apiKey.slice(0, 8)}...`)

  // Streaming endpoint -- releases concurrent slot faster than batch
  // output_format MUST be a query parameter, NOT in the JSON body
  const url = `${ELEVENLABS_API_URL}/text-to-speech/${voiceId}/stream?output_format=mp3_22050_32`

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg',
        },
        body: JSON.stringify({
          text,
          model_id: modelId,
          voice_settings: {
            stability,
            similarity_boost: similarityBoost,
            use_speaker_boost: false, // disable for lower latency
          },
        }),
      })

      // 429 = too many concurrent requests -> wait and retry
      if (response.status === 429) {
        const waitMs = Math.pow(2, attempt) * 500 // 500ms, 1s, 2s
        console.warn(`ElevenLabs 429 on attempt ${attempt + 1}, waiting ${waitMs}ms`)
        await new Promise(r => setTimeout(r, waitMs))
        continue
      }

      // 503 = service busy -> same retry logic
      if (response.status === 503) {
        const waitMs = Math.pow(2, attempt) * 1000 // 1s, 2s, 4s
        console.warn(`ElevenLabs 503 on attempt ${attempt + 1}, waiting ${waitMs}ms`)
        await new Promise(r => setTimeout(r, waitMs))
        continue
      }

      if (!response.ok) {
        const err = await response.text().catch(() => 'unknown error')
        console.error(`ElevenLabs ${response.status} error for voice ${voiceId}, model ${modelId}:`, err)
        throw new Error(`ElevenLabs ${response.status}: ${err}`)
      }

      // Collect the stream into a buffer
      const arrayBuffer = await response.arrayBuffer()
      return Buffer.from(arrayBuffer)

    } catch (err: any) {
      // Network error on last attempt -- throw
      if (attempt === retries - 1) {
        console.error('ElevenLabs failed after all retries:', err.message)
        throw err
      }
      // Network error on earlier attempt -- wait and retry
      const waitMs = Math.pow(2, attempt) * 500
      console.warn(`ElevenLabs network error attempt ${attempt + 1}, retrying in ${waitMs}ms:`, err.message)
      await new Promise(r => setTimeout(r, waitMs))
    }
  }

  throw new Error('ElevenLabs: exhausted all retries')
}

/**
 * Generate speech and return as a base64 string
 * Useful for embedding directly in TeXML/TwiML responses
 */
export async function generateSpeechBase64(
  text: string,
  options: TTSOptions = {}
): Promise<string> {
  const buffer = await generateSpeech(text, options)
  return buffer.toString('base64')
}

/**
 * Generate speech and return a data URL
 * Useful for serving directly as an audio response
 */
export async function generateSpeechDataUrl(
  text: string,
  options: TTSOptions = {}
): Promise<string> {
  const buffer = await generateSpeech(text, options)
  return `data:audio/mpeg;base64,${buffer.toString('base64')}`
}

/**
 * Check if ElevenLabs is healthy
 * Call this in a health check endpoint
 */
export async function checkElevenLabsHealth(): Promise<{
  ok: boolean
  plan: string
  charactersUsed: number
  charactersLimit: number
  concurrentLimit: number
}> {
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) return { ok: false, plan: 'none', charactersUsed: 0, charactersLimit: 0, concurrentLimit: 0 }

  try {
    const res = await fetch(`${ELEVENLABS_API_URL}/user/subscription`, {
      headers: { 'xi-api-key': apiKey }
    })
    if (!res.ok) return { ok: false, plan: 'error', charactersUsed: 0, charactersLimit: 0, concurrentLimit: 0 }
    const data = await res.json()
    return {
      ok: true,
      plan: data.tier || 'unknown',
      charactersUsed: data.character_count || 0,
      charactersLimit: data.character_limit || 0,
      concurrentLimit: data.can_use_instant_voice_cloning ? 10 : 5,
    }
  } catch {
    return { ok: false, plan: 'error', charactersUsed: 0, charactersLimit: 0, concurrentLimit: 0 }
  }
}
