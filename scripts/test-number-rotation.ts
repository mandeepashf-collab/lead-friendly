/**
 * DIAGNOSTIC SCRIPT — makes 3 REAL billable test calls to verify carrier
 * deliverability across all Lead Friendly outbound numbers.
 *
 * Cost: ~$0.03 total (3 calls × ~20s each × $0.005/min).
 *
 * Run: npx tsx scripts/test-number-rotation.ts +1YOURCELL
 *
 * What to watch for:
 *   - Each call should actually ring the target phone
 *   - If one of the 3 doesn't ring, that number has a deliverability issue
 *     (spam flag, port issue, SIP misconfiguration)
 *   - If ALL 3 ring clean, rotation will solve the deliverability problem
 *     → then wire up rotation in /api/calls/trigger/route.ts
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'

// ── CRLF-safe .env.local parser (copied from scripts/update-maya-prompt.ts) ──
// .trim() alone misses \r on Windows CRLF line endings, so we strip \r explicitly.
const envPath = resolve(process.cwd(), '.env.local')
const envLines = readFileSync(envPath, 'utf-8').split(/\r?\n/)
const env: Record<string, string> = {}
for (const line of envLines) {
  const m = line.match(/^([^#=\s][^=]*)=(.*)$/)
  if (m) env[m[1].trim()] = m[2].replace(/\r$/, '').trim()
}

const SUPABASE_URL = env['NEXT_PUBLIC_SUPABASE_URL']
const SUPABASE_SERVICE_ROLE_KEY = env['SUPABASE_SERVICE_ROLE_KEY']
const TELNYX_API_KEY = env['TELNYX_API_KEY']
const TELNYX_APP_ID = env['TELNYX_APP_ID']

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local',
  )
  process.exit(1)
}
if (!TELNYX_API_KEY || !TELNYX_APP_ID) {
  console.error('Missing TELNYX_API_KEY or TELNYX_APP_ID in .env.local')
  process.exit(1)
}

// ── CLI arg: target phone number ─────────────────────────────────────────────
const rawTarget = process.argv[2]
if (!rawTarget || !/^\+1\d{10}$/.test(rawTarget)) {
  console.error('Invalid phone number. Usage: npx tsx scripts/test-number-rotation.ts +15551234567')
  process.exit(1)
}
const targetNumber = rawTarget

// ── The 3 "from" numbers assigned to the Lead Friendly CC voice app ──────────
const FROM_NUMBERS = [
  '+17196421726',
  '+14255481585',
  '+12722194909',
] as const

// ── Result tracking ──────────────────────────────────────────────────────────
type CallResult = {
  from: string
  status: 'initiated' | 'error'
  call_control_id: string | null
  notes: string
}
const results: CallResult[] = []

// ── Helper: POST to Telnyx Call Control v2 ───────────────────────────────────
async function dialOne(fromNumber: string): Promise<CallResult> {
  console.log(`\nCalling ${targetNumber} from ${fromNumber}...`)

  try {
    const res = await fetch('https://api.telnyx.com/v2/calls', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TELNYX_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        connection_id: TELNYX_APP_ID,
        to: targetNumber,
        from: fromNumber,
        webhook_url: 'https://www.leadfriendly.com/api/webrtc/webhook',
        webhook_url_method: 'POST',
        timeout_secs: 30,
        answering_machine_detection: 'disabled',
      }),
    })

    const text = await res.text()
    let data: { data?: { call_control_id?: string } } = {}
    try {
      data = JSON.parse(text)
    } catch {
      /* ignore parse error */
    }

    if (!res.ok) {
      console.error(`  ✗ Telnyx ${res.status}: ${text.slice(0, 200)}`)
      return {
        from: fromNumber,
        status: 'error',
        call_control_id: null,
        notes: `HTTP ${res.status}: ${text.slice(0, 120)}`,
      }
    }

    const ccid = data.data?.call_control_id ?? null
    console.log(`  ✓ call_control_id: ${ccid}`)
    return {
      from: fromNumber,
      status: 'initiated',
      call_control_id: ccid,
      notes: 'watch phone — did it ring?',
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`  ✗ Network/exception: ${msg}`)
    return {
      from: fromNumber,
      status: 'error',
      call_control_id: null,
      notes: `exception: ${msg}`,
    }
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ── Main loop ────────────────────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('  Number Rotation Deliverability Test')
  console.log('  Target:', targetNumber)
  console.log('  From  :', FROM_NUMBERS.join(', '))
  console.log('  Note  : 45s gap between calls — answer & hang up to free line.')
  console.log('═══════════════════════════════════════════════════════════════')

  for (let i = 0; i < FROM_NUMBERS.length; i++) {
    const from = FROM_NUMBERS[i]
    const result = await dialOne(from)
    results.push(result)

    // Wait between calls (but not after the last one) so the user can answer
    // each one before the next rings.
    if (i < FROM_NUMBERS.length - 1) {
      console.log('  ...waiting 45s before next call...')
      await sleep(45_000)
    }
  }

  // ── Summary table ──────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════════')
  console.log('  SUMMARY')
  console.log('═══════════════════════════════════════════════════════════════')
  console.log(
    'FROM              | STATUS     | CALL_CONTROL_ID                                | NOTES',
  )
  console.log(
    '------------------|------------|------------------------------------------------|---------------------------',
  )
  for (const r of results) {
    const from = r.from.padEnd(17)
    const status = r.status.padEnd(10)
    const ccid = (r.call_control_id ?? '—').padEnd(46)
    console.log(`${from} | ${status} | ${ccid} | ${r.notes}`)
  }
  console.log('\nDone. If any row shows "error" or the phone did not ring,')
  console.log('that number has a deliverability issue (spam-flag, port, SIP config).')
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
