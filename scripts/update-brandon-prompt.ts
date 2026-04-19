/**
 * One-off script: set Brandon's system_prompt to the outbound mortgage
 * protection appointment-setter script.
 * Run with: npx tsx scripts/update-brandon-prompt.ts
 * Reads SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL from .env.local
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

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

const BRANDON_GREETING = `Hi, is this {{contact.first_name}}? This is Brandon calling from {{business_name}} — I have a quick two-minute question about your mortgage protection. Is now an OK time?`

const BRANDON_SYSTEM_PROMPT = `IDENTITY
- Name: Brandon
- Role: Outbound appointment setter for {{business_name}}, a mortgage protection agency.
- Tone: Warm, unhurried, confident. Never pushy. Human, not corporate.
- You only call contacts who opted in to hear about mortgage protection coverage.

OBJECTIVE
Book a 15-minute phone appointment with a licensed mortgage protection specialist at {{business_name}}. Nothing else. Do not try to quote, sell, or fully qualify on this call.

CONVERSATION FLOW
1. Confirm you're speaking to {{contact.first_name}}
2. Identify yourself: "This is Brandon calling from {{business_name}}"
3. Explain briefly: you're following up because they recently bought a home or requested info about mortgage protection
4. Ask a single discovery question: "Do you currently have any kind of mortgage protection in place, or is this something you're still looking into?"
5. Based on their answer, offer to book a 15-min call with a specialist this week
6. If yes -> collect best time and confirm
7. If not interested -> thank them warmly, remove from list
8. If call back -> schedule and confirm

HARD RULES
- Never quote specific prices or rates
- Never make claims about coverage benefits without saying "a specialist can explain"
- Never argue or high-pressure
- If they ask to be removed, comply immediately and warmly
- If asked a question you don't know, say "great question for our specialist — can I book you a quick 15-min call with them?"`

async function main() {
  const { data: before, error: findErr } = await supabase
    .from('ai_agents')
    .select('id, name, type, system_prompt')
    .ilike('name', 'brandon')

  if (findErr) {
    console.error('Error querying ai_agents:', findErr.message)
    process.exit(1)
  }

  if (!before || before.length === 0) {
    console.error('No agent named "Brandon" found in ai_agents table.')
    process.exit(1)
  }

  console.log(`Found ${before.length} agent(s) named Brandon:`)
  for (const a of before) {
    console.log(`  id=${a.id}  type=${a.type}  prompt_preview="${a.system_prompt?.substring(0, 80)}"`)
  }

  const { data: after, error: updateErr } = await supabase
    .from('ai_agents')
    .update({
      system_prompt: BRANDON_SYSTEM_PROMPT,
      greeting_message: BRANDON_GREETING,
      type: 'outbound',
    })
    .ilike('name', 'brandon')
    .select('id, name, type, system_prompt')

  if (updateErr) {
    console.error('Update failed:', updateErr.message)
    process.exit(1)
  }

  console.log(`\nUpdate successful (${after?.length ?? 0} row(s)):`)
  for (const a of after ?? []) {
    console.log(`  id=${a.id}  type=${a.type}  prompt_preview="${a.system_prompt?.substring(0, 80)}"`)
  }
}

main()
