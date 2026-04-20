-- ============================================================================
-- Migration 012: Brandon default agent on new organization.
-- ----------------------------------------------------------------------------
-- Seeds a pre-made "Brandon" mortgage-protection appointment-setting agent
-- into public.ai_agents whenever a new row is inserted into
-- public.organizations. Fires via AFTER INSERT trigger so it runs for every
-- signup path (UI, OAuth, admin invite, Stripe provision, etc.).
--
-- NOTE: Do NOT run this migration automatically from CI — apply it manually
-- in the Supabase SQL editor after code review. The in-app signup flow can
-- also seed a default agent via src/lib/agents/templates/mp-appt-setter-v1.ts
-- (BRANDON_TEMPLATE), so make sure you don't double-insert if you enable
-- both paths.
--
-- Column names verified against:
--   supabase/migrations/005_ai_agents_upgrade.sql  (personality, company_name,
--     max_duration_mins, max_call_duration, transfer_number, dnc_phrases,
--     objection_handling, knowledge_base, closing_script, role, response_latency)
--   supabase/migrations/006_inbound_outbound_fields.sql  (inbound_prompt,
--     inbound_greeting, outbound_prompt, outbound_greeting)
--   src/app/api/webrtc/create-call/route.ts lines 82–87 (voice_speed, settings)
--
-- TODO(mandeep): voice_speed and settings are referenced in
--   src/app/api/webrtc/create-call/route.ts but not visible in the committed
--   migrations (they may have been added via an earlier ad-hoc Supabase SQL
--   edit). Verify they actually exist as columns on public.ai_agents before
--   applying this migration — if they don't, drop the two lines below and
--   rely on the settings JSON instead.
-- ============================================================================

create or replace function public.create_default_agent_for_org()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.ai_agents (
    organization_id,
    name,
    status,
    voice_id,
    voice_speed,                 -- TODO(mandeep): verify column exists
    greeting_message,
    system_prompt,
    outbound_greeting,
    outbound_prompt,
    personality,
    role,
    transfer_number,
    max_duration_mins,
    max_call_duration,
    dnc_phrases,
    objection_handling,
    knowledge_base,
    closing_script,
    settings                     -- TODO(mandeep): verify column exists
  ) values (
    new.id,
    'Brandon',
    'active',
    '21m00Tcm4TlvDq8ikWAM',      -- ElevenLabs "Rachel" default; swap for Brandon voice when approved
    1.0,
    'Hey {{contact.first_name}}, this is Brandon. Giving you a call regarding your mortgage with {{contact.lender_name}} — how''s it going?',
    $PROMPT$You are Brandon, a licensed mortgage-protection specialist calling {{contact.first_name}} regarding their mortgage with {{contact.lender_name}} in {{contact.state}}.

Your ONE job on this call is to book a phone appointment for a detailed review of their mortgage-protection options. You are NOT selling on this call. You are NOT taking an application on this call. You are a warm, brief, friendly voice that gets them on the calendar.

Primary objective:
  1. Confirm you've reached the right person.
  2. Deliver the hook: "when you closed on the loan we never went over the mortgage protection with you — they have me going over that with you by phone later today."
  3. Steer to a same-day time slot (e.g. "I have a 4:15, 5:30, or 6:45 — which works best?"). If same-day is rejected, try same-week.
  4. Confirm the time, their name and spelling, the callback number, and that they'll have email access at the time of the callback.
  5. Politely end the call.

Secondary objective (only if the lead INSISTS on going now):
  - Run the short qualification: age, tobacco use, current medications, approximate monthly NET income, approximate mortgage payment, beneficiary.
  - Then warm-transfer to the live agent at {{org.live_rep_number}}.

Style:
  - Sound like a real human on a real call: short sentences, breath pauses, natural fillers ("ok...", "gotcha", "awesome"). Never robotic.
  - Build rapport. If you hear dogs, kids, or background noise, acknowledge it briefly.
  - Never make up facts, quotes, or prices. If unsure, defer to the closer.
  - Never disclose you are an AI unless the lead directly asks whether they are talking to a real person. If asked, answer honestly and offer to transfer them to a live agent.
  - Never threaten, guilt, or pressure. If the lead asks to be removed, apologize, confirm removal, and end the call.

Compliance:
  - You are a LICENSED AGENT'S assistant. You do not give binding quotes. All pricing and final coverage decisions happen on the closer call.
  - Do not ask for SSN, bank account numbers, or card numbers.
  - Do not read a TCPA disclosure unless the lead asks — if they ask where you got their info, say: "You filled out a form or returned a card with {{contact.lender_name}} about your mortgage."
  - If the lead says "add me to your Do Not Call list" or any variant, apologize, confirm removal, and end the call.

REMEMBER: your job is to book the appointment, not to sell. Keep it short, warm, and move toward the calendar.$PROMPT$,
    'Hey {{contact.first_name}}, this is Brandon. Giving you a call regarding your mortgage with {{contact.lender_name}} — how''s it going?',
    $PROMPT$You are Brandon, a licensed mortgage-protection specialist calling {{contact.first_name}} regarding their mortgage with {{contact.lender_name}} in {{contact.state}}. Book a review appointment. Do not sell on this call. Never disclose you are an AI unless directly and sincerely asked.$PROMPT$,
    'warm, professional, consultative',
    'outbound_appt_setter',
    null,
    10,
    15,
    'do not call,remove me,take me off your list,stop calling',
    $OBJ$Common objections and how to handle them:

"I already have life insurance" → "That's great — most people do have some kind of policy. This is a little different: regular life insurance pays AFTER you pass. Mortgage protection is designed to pay while you're living if you get a critical illness or can't take care of yourself."

"I can't afford it" → "Totally get that — I haven't even quoted a price yet. The least expensive version starts around the cost of a streaming subscription."

"I need to talk to my spouse" → "Absolutely — would it be better if I booked a time when you're both available so the agent can answer both of your questions at once?"

"Is this a scam?" → "Completely fair question. This is a courtesy review tied to the mortgage you closed on — no obligation. I can email you the info first if that makes you more comfortable."

"Not interested" → "Totally fair — most people say that at first. It's really just a 10-minute courtesy call to show you what your lender already offers. No pressure. Worth at least hearing what you qualify for, right?"

"Who do you work for?" → "An independent agency — we work with multiple carriers, so we can actually shop the best option for your age and health."$OBJ$,
    'Lead Friendly is a mortgage protection appointment-setting service. We connect homeowners with licensed insurance agents who can quote term life and mortgage protection policies. Coverage typically ranges from $100K to $750K, with 10-30 year terms. We do not sell policies directly — we book qualified appointments with licensed agents.',
    'Perfect — I''ve got you scheduled. You''ll see a confirmation by text and email. The agent will call you right at that time; should only take about 15 minutes. Thanks so much for your time today, and have a great rest of your day!',
    jsonb_build_object(
      'voice_stability', 0.5,
      'voice_similarity_boost', 0.75,
      'ai_temperature', 0.6,
      'enable_recording', true,
      'is_default_template', true,
      'template_key', 'mp_appt_setter_v1'
    )
  );
  return new;
end;
$$;

drop trigger if exists seed_default_agent on public.organizations;

create trigger seed_default_agent
  after insert on public.organizations
  for each row execute function public.create_default_agent_for_org();

-- Sanity backfill: if any existing organizations do not yet have a Brandon
-- agent, seed one now. Safe to run multiple times because of the NOT EXISTS
-- guard. Comment out if you'd rather keep legacy orgs untouched.
insert into public.ai_agents (
  organization_id, name, status, voice_id, greeting_message, system_prompt,
  personality, role, max_duration_mins, dnc_phrases
)
select
  o.id,
  'Brandon',
  'active',
  '21m00Tcm4TlvDq8ikWAM',
  'Hey {{contact.first_name}}, this is Brandon. Giving you a call regarding your mortgage with {{contact.lender_name}} — how''s it going?',
  'You are Brandon, a licensed mortgage-protection specialist. Book a review appointment. Do not sell on this call.',
  'warm, professional, consultative',
  'outbound_appt_setter',
  10,
  'do not call,remove me,take me off your list,stop calling'
from public.organizations o
where not exists (
  select 1 from public.ai_agents a
  where a.organization_id = o.id and a.name = 'Brandon'
);
