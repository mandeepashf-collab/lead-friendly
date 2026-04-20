# Lead Friendly CRM — Day 2 Deep Audit & Redesign Plan

## 1. Scope of what I clicked/tested
Sidebar: Launchpad, Dashboard, Contacts (People / Conversations / Call Logs / Phone Numbers / Templates), Pipeline (Opportunities + Campaigns tabs + Kanban), AI Agents (list + Configure: Agent Details / Agent Goals / Phone & Test / Instructions / Call History / Annotate / Evals), Automations (builder, trigger + action picker), Campaigns (list, View Results, Create Campaign wizard), Calendar (month view + New Appointment modal), Billing (Overview + Payments, Stripe), Business (Profile / Branding / Reputation / Reporting), Settings (Organization / Team / Integrations / Notifications / Automations / Security), White-label (Agency Dashboard + Snapshots + Add Client wizard). Header: Quick Add dropdown, Dialer, Notifications, global Cmd-K search, User menu.

I also created a test appointment and inspected the error responses, the network/console behaviour, and the DOM overflow/scrolling state.

## 2. Bugs & errors found (ranked by severity)

**P0 — Critical**

1. New Appointment submit crashes with a raw Postgres error. The modal surfaces `invalid input syntax for type uuid: "Mandeep"` and, with the field blank, `invalid input syntax for type uuid: ""`. The "Assigned To" field is a free-text input but the backend expects a UUID. Either the frontend must send `null` when empty and never send plain text, or the field must be replaced with a bound team-member picker. Right now the happy-path for creating an appointment is effectively broken unless the user leaves the field empty AND the frontend still sends empty string, which it does.

2. Data inconsistency between counters. Dashboard says 28 Calls Today and 43 AI Minutes Used, Call Logs says 103 All-time, AI Agents page says Total Calls Made 0, Billing says AI Call Minutes 0 / 500, and Campaigns "Demo SaaS" says Total Called 9 but the Call Log underneath it says "No calls yet." These are five views of the same underlying data that don't agree — either the rollups are wired to different tables, or there's a stale materialized view.

3. Answer Rate mismatch. Call Logs shows 59%, the campaign detail shows 0% — same data, two sources of truth.

4. Launchpad vs. Billing conflict. Launchpad step 5 says "Choose your plan — Select a plan to unlock AI calling and campaigns", but Billing already shows "Growth Plan — Active, $297/month, Renews May 11, 2026." A paying customer should not see "Choose your plan" as an outstanding setup step.

**P1 — High**

5. AI agent voice field shows raw ElevenLabs voice IDs (`iP95p4xoKVk53GoZ742B`, `hpp4J3VqNfWAUOO...`) instead of voice names (Rachel, Adam, Bella, etc.). Needs a lookup / friendly-name mapping.

6. Agent direction mismatch. Maya is flagged Outbound on Agent Details, but her Outbound Greeting and system prompt are written as an inbound dental receptionist ("Thank you for calling...", "NEW PATIENT FLOW"). Either auto-detect from the prompt or split inbound/outbound prompts.

7. Call Logs list shows every contact as "Unknown" with 0:00 duration on ~9 of 10 rows. Reverse-lookup from phone number to contact isn't running, and the duration field looks like it's reading `started_at` minus `started_at` rather than `ended_at - started_at`.

8. Agency alerts banner says "2 clients need attention — low wallet balance or near minute limit" but Agency Minutes Used = 0 across all clients. Rule logic is firing incorrectly.

9. Horizontal overflow on AI Agents, Settings and Agent Configure pages. A horizontal scrollbar appears because tab strips and agent cards are wider than the available column. The Settings tab bar visibly clips "Security" and "Evals".

**P2 — Medium UX**

10. "View" (eye) icon on contacts opens Edit Contact modal. There is no contact-detail page. This is the biggest structural gap — in every CRM the contact page is where users spend 70% of their time (timeline of calls, SMS, email, deals, tasks, notes). Right now there's nowhere to see "all interactions with Mike Chen".

11. Modal is a fixed 720px-tall card that scrolls internally. When the validation error appears at the top, users never see it because they're looking at the bottom of the form. Error should either toast or auto-scroll into view.

12. Quick Add > New Contact modal is cut off at the top (Name fields aren't visible on a 794px viewport; only Phone + Tags show above the fold).

13. Notifications are hard-coded demo data ("Payment Received $1,200 from Acme Corp") — fine for screenshots but confusing for a real trial user.

14. Empty Business Profile is not called out on the Launchpad or Dashboard. The Launchpad stops at 7 items but onboarding the business profile (logo, brand color, support email, timezone, biz hours) is more important than "make a test call."

## 3. Information-architecture problems & a recommended restructure

Today the sidebar has 11 top-level items and 2 White-label items — that's too wide for a tool whose core loop is "add contact > launch campaign > read results." I'd collapse it to three functional groups and surface the white-label portal only for agency accounts.

**Proposed sidebar:**

- **Work** (the daily loop): Inbox (conversations + voicemails + notifications), Contacts, Pipeline, Calendar.
- **Grow** (the build-once loop): AI Agents, Campaigns, Automations, Templates.
- **Manage** (the set-and-forget loop): Reporting, Billing, Settings (with sub-tabs: Business, Team, Integrations, Branding, Security, Phone Numbers).
- **Agency** (only visible if org.type = 'agency'): Clients, Snapshots, White-label billing.

Dashboard becomes the Launchpad for new users and a KPI homepage for existing users (auto-switches based on whether setup is complete). Launchpad-as-a-separate-page should disappear once the user is set up — don't leave "57% complete" living in the sidebar forever.

The "Contacts" page today bundles 5 tabs (People, Conversations, Call Logs, Phone Numbers, Templates). Phone Numbers is a settings concern (move to Settings > Phone Numbers), Templates is a growth concern (move to Grow > Templates), and Conversations is a daily-loop concern (promote to its own Inbox). That leaves Contacts = People + Call Logs, which is clean.

## 4. Concrete button/layout recommendations

On the **AI Agents index** the current layout shows 4 big stat cards and then a grid of agent cards with a "Configure" button and a trashcan per card. Two improvements: (a) add a search/filter bar ("Filter by name, voice, direction, active/paused") because once a user has 20+ agents this grid becomes unusable, (b) the primary action on an agent card should be "Test call" (the user's #1 job), with "Configure" and "Logs" as secondary icons. Right now "Configure" dominates.

On the **Contact row actions**, replace the single eye-icon with three icons: call (green phone), message (chat bubble), open detail page (arrow-right). Edit should live inside the detail page, not on the list.

On the **Campaign detail**, put Start/Pause/Duplicate as sticky actions in the top-right next to Export. Right now Pause is the only button and it's visually orange-alarming when the campaign is healthy.

On **New Appointment**, the footer buttons (Cancel / Create Appointment) should be sticky to the bottom of the modal, not scroll out of view. Assigned To must become a searchable select bound to the Team table. If there's only one team member, pre-select them and hide the field.

On the **dialer**, when an outbound call is placed without a selected contact it should prompt "Log this call to an existing contact or create a new one?" at hang-up, so every call ends up attached to a contact record (this will also fix the "Unknown" issue on Call Logs).

## 5. Design templates you can drop into the cowork session

**Color system (dark SaaS, WCAG-AA friendly):**
Background #0B0B14, surface #14141F, raised #1C1C2B, border #24243A, accent #6D5CFF (primary), accent-2 #8B7FFF, success #10B981, warn #F59E0B, danger #EF4444, text-hi #F4F4F5, text-mid #A1A1AA, text-lo #6B6B7B.

**Typography:** Inter for UI (14 base, 13 table, 12 caption), Inter Display for headings (28/24/20). Tabular-nums for all numeric cells.

**Spacing & radius:** 4-based spacing scale (4, 8, 12, 16, 24, 32, 48), 12px card radius, 8px button radius.

**Card anatomy:** 24px padding, 1px border in border-color, subtle 8% inner-glow for accent cards. Headers are 12px uppercase `text-lo`, values are 28px semibold, trend chip is 12px with colored background at 14% opacity.

**Empty states:** always include Icon + 1-line headline + 1-line helper + 1 primary CTA (you already do this well on Automations and Snapshots — extend the same pattern everywhere, including the Contacts list when empty).

**Form standards:** labels 13px text-mid, inputs 40px tall, helper text 12px, error text in danger with a left-border accent. Never surface raw backend errors — map them to human copy and log the raw one to console for debugging.

## 6. Recommended configuration/feature flags

Enable per-org: `inbound_voice_allowed`, `outbound_voice_allowed`, `sms_allowed`, `email_allowed`, `whitelabel_enabled`, `ai_minutes_cap`, `per_day_call_cap`, `auto_log_unknown_calls`. Surface these in Settings > Security (as read-only) and in Agency > Client detail (editable by the agency owner).

For new-user seeding: on signup create one default inbound agent, one outbound agent, three SMS templates, one "Contact Created > wait 2 min > send intro SMS" automation. That turns the first-minute experience from an empty canvas into a working demo that the user can immediately edit.

## 7. Day-2 deploy checklist (prioritized)

1. Patch the Appointment create endpoint to coerce empty `assigned_to` to null and validate UUIDs with a friendly error.
2. Replace Assigned To free-text with a team-member select.
3. Unify call stats into one backend view and point Dashboard, Call Logs, AI Agents, Campaigns and Billing at it.
4. Map voice IDs to display names.
5. Reverse-lookup Unknown callers from the contacts table; recompute duration as `ended_at - started_at`.
6. Hide the Launchpad "Choose your plan" step if `subscription.status = active`.
7. Fix horizontal overflow on AI Agents, Settings and Agent Configure (use `overflow-x-auto` on the tab-strip only, not the page).
8. Ship a proper Contact Detail page with timeline (calls, SMS, email, deals, notes).
9. Remove mocked notifications or clearly label them as Demo.
10. Move Phone Numbers to Settings, Templates to Grow, promote Conversations to Inbox.
