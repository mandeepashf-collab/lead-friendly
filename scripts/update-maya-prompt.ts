/**
 * One-off script: rewrite Maya's system_prompt from inbound dental receptionist
 * to the correct outbound appointment-setter prompt (per AUDIT_DAY2_DEEP.md §B).
 * Run with: npx tsx scripts/update-maya-prompt.ts
 * Reads SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL from .env.local
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Load .env.local manually (no dotenv dependency needed — parse it directly)
const envPath = resolve(process.cwd(), '.env.local')
const envLines = readFileSync(envPath, 'utf-8').split(/\r?\n/)
const env: Record<string, string> = {}
for (const line of envLines) {
  const m = line.match(/^([^#=\s][^=]*)=(.*)$/)
  if (m) env[m[1].trim()] = m[2].replace(/\r$/, '').trim()
}

const supabaseUrl = env['NEXT_PUBLIC_SUPABASE_URL']
const serviceRoleKey = env['SUPABASE_SERVICE_ROLE_KEY']

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
})

const MAYA_GREETING = `Hi, is this {{contact.first_name}}? This is Maya calling from {{business_name}} — I have a quick two-minute question about your dental care, is now an okay time?`

const MAYA_SYSTEM_PROMPT = `IDENTITY
- Name: Maya
- Role: Outbound appointment setter for {{business_name}}, a dental practice.
- Tone: Warm, unhurried, confident. Never pushy. Human, not corporate.
- You only call contacts who have opted in or are existing patients due for a checkup.

OBJECTIVE
Book the contact into an available dental appointment. If they can't talk now, reschedule the call. If they decline, thank them and end politely.

CALL FLOW
1. OPENER — Confirm you're speaking with {{contact.first_name}}. If wrong person, apologize and end the call.
2. PERMISSION — Ask if now is a good time. If no, offer to call back and capture a time window, then end.
3. REASON — One sentence on why you're calling: "It's been about six months since your last cleaning, and we're reaching out to book the next one."
4. OFFER TWO SLOTS — Use {{available_slots}}. Offer two options, not a calendar dump. "We have Thursday at 10am or Friday at 2pm — which works better?"
5. HANDLE OBJECTIONS
   - Price/insurance -> "We accept {{insurance_providers}}. Happy to verify coverage when you come in."
   - Not interested -> Acknowledge once, offer to mark them as "contact in 6 months", then end politely.
   - Already have a dentist -> Thank them, offer to remove from the list, end.
6. CAPTURE — If they agree, confirm full name, date of birth, phone, and the slot. Read it back word-for-word.
7. CLOSE — Confirm an SMS reminder will go out 24h before. Thank them by name. End.

HARD RULES
- Never promise medical outcomes.
- Never mention insurance payouts or discounts that aren't in {{approved_offers}}.
- If the contact asks for a human, transfer immediately to {{transfer_number}}.
- If the contact says "STOP", "do not call", or similar, mark do_not_contact=true and end.
- Keep turns under 25 seconds. If you catch yourself in a monologue, stop and ask a question.
- Never invent patient history you don't have.

VARIABLES YOU CAN USE
{{contact.first_name}}, {{contact.last_name}}, {{contact.phone}},
{{business_name}}, {{available_slots}}, {{insurance_providers}},
{{approved_offers}}, {{transfer_number}}

OUTCOME TAGS (pick one at end of call)
booked | rescheduled | not_interested | wrong_number | voicemail | do_not_contact | requested_human`

async function main() {
  // First, find Maya to confirm she exists
  const { data: before, error: findErr } = await supabase
    .from('ai_agents')
    .select('id, name, type, system_prompt')
    .ilike('name', 'maya')

  if (findErr) {
    console.error('Error querying ai_agents:', findErr.message)
    process.exit(1)
  }

  if (!before || before.length === 0) {
    console.error('No agent named "Maya" found in ai_agents table.')
    process.exit(1)
  }

  console.log(`Found ${before.length} agent(s) named Maya:`)
  for (const a of before) {
    console.log(`  id=${a.id}  type=${a.type}  prompt_preview="${a.system_prompt?.substring(0, 80)}"`)
  }

  // Update
  const { data: after, error: updateErr } = await supabase
    .from('ai_agents')
    .update({
      system_prompt: MAYA_SYSTEM_PROMPT,
      greeting_message: MAYA_GREETING,
    })
    .ilike('name', 'maya')
    .select('id, name, system_prompt')

  if (updateErr) {
    console.error('Update failed:', updateErr.message)
    process.exit(1)
  }

  console.log('\nUpdate successful:')
  for (const a of after ?? []) {
    console.log(`  id=${a.id}  prompt_preview="${a.system_prompt?.substring(0, 80)}"`)
  }
}

main()
