# Lead Friendly — Day 2 Deep Analysis (Opus 4.7 Chrome Extension)

## A. Contact Detail Page — Wireframe & Spec

Right now clicking the eye icon opens the Edit modal, and there is nowhere to see the history of a contact. Here is the page to build.

**Route:** `/people/:contactId`

### Top bar (sticky, 64px)
Breadcrumb ("Contacts > Mike Chen"), then the name as H1 (24/32, semibold), then a status chip (New / Contacted / Qualified / Won / Lost — colored), then three primary actions in the top-right: a green Call button, a blue Message button, and an outline More menu (Edit, Add to Campaign, Add Deal, Add Task, Delete).

### Left column — 320px, sticky — "Identity card"
Avatar (initials if no photo), full name, title @ company, phone with click-to-call, email with click-to-mail, address block, tags (editable inline), Source badge, "Created Apr 9, 2026 by Mandeep" meta line, lifecycle progress bar (New > Contacted > Qualified > Won) with the current step glowing.

### Main column — flexible — tabbed

- **Timeline** (default). A single reverse-chronological feed that merges calls, SMS, email, notes, appointment created/updated, deal stage changes, automation runs, tag changes. Each row uses a left rail icon (phone/chat/mail/calendar/flag/bot), a one-line title ("Outbound call - 1m 50s - Completed"), and a small preview that expands on click. A filter bar at the top ("All / Calls / Messages / Notes / System").
- **Conversations.** SMS + email threaded by channel. Reply composer at the bottom, from-number picker, variable chips.
- **Calls.** The call list filtered to this contact, with duration, direction, outcome, sentiment chip, and a play-button for the recording + transcript.
- **Deals.** Cards for every opportunity linked to this contact with stage/value/close date.
- **Tasks & Appointments.** List + an inline quick-add.
- **Files.** Uploaded documents (contracts, quotes).
- **Custom fields.** Edit the `lender`, custom business-specific data.
- **Activity log.** Raw audit trail (who edited what, when).

### Right drawer (collapsible, 280px) — "AI copilot"
A summary block ("Mike is a Qualified $45k deal, last touched 9 days ago, no reply to the last 2 SMS"), next-best-action suggestions ("Call Mike; his open rate is highest 2-4pm ET"), and a button to launch a test call with your Sales Assistant agent pre-loaded with Mike's context.

### Empty-state behaviour
A brand-new contact timeline should say "No interactions yet — Call, Message or create a Task to get started" with three ghost-button CTAs, not just a blank feed.

### API contract (one call)
```
GET /api/contacts/:id/overview
-> { contact, timeline[], conversations[], calls[], deals[], tasks[],
     appointments[], custom_fields, activity[], ai_summary }
```
One endpoint, one cache entry, very snappy.

---

## B. Rewrite of Maya's Prompt for Outbound Agent

Maya is marked Outbound on Agent Details, but her system prompt is written for an inbound dental receptionist ("Thank you for calling..."). Here's a corrected outbound version.

### Outbound Greeting (what Maya says when the call connects)
"Hi, is this {{contact.first_name}}? This is Maya calling from {{business_name}} — I have a quick two-minute question about your dental care, is now an okay time?"

### System Prompt (Instructions tab)
```
IDENTITY
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
booked | rescheduled | not_interested | wrong_number | voicemail | do_not_contact | requested_human
```

Alongside this: add a "Voice & style" panel in Agent Details with two sliders — **Pace** (Leisurely <> Brisk) and **Warmth** (Formal <> Friendly) — which the backend translates into the ElevenLabs `stability` and `similarity_boost` parameters.

---

## C. Automations Builder — Edge-Case Walkthrough and Fixes

Issues found when building a real workflow (Contact Created > Send SMS > Wait 1 hour):

1. **No branching.** Every workflow is linear. Can't say "If tag == VIP, call; else, SMS." Add an `If/Else` action plus a `Split test (A/B)` action. These are the two highest-ROI additions.

2. **No "from number" on SMS.** 3 phone numbers but can't choose which one the automation sends from. Needed for compliance (local-presence) and white-label clients on shared numbers.

3. **No variable picker.** Sales Assistant's Instructions page has an "Insert variable" helper with chips — the Automation's SMS/email bodies should have the same component. Otherwise users type `{{firstname}}` (wrong) vs `{first_name}` (right) and it silently fails.

4. **No SMS segment counter.** A 160-char SMS is 1 segment, 161 becomes 2 segments (double billing). Show "1 / 160 — 1 segment" and update live.

5. **No error history per run.** The list row says "0 runs" with no way to drill into failures. Add a "Runs" tab inside each workflow showing run ID, triggered-by contact, status (succeeded/failed/waiting), step timeline, and failure reason.

6. **No test harness.** Can't dry-run a workflow. Add a "Test with contact..." button that picks a real contact from the list, walks the workflow in simulation mode (no actual SMS sent, no wait), and shows what each step would do.

7. **Save button is ambiguous.** Saving auto-activates the workflow. New users will accidentally send SMS they didn't mean to. Split into two buttons — **Save draft** and **Save & activate** — with a confirmation modal ("This will send real messages to contacts matching this trigger") on the activate button.

8. **No throttle limits.** If 500 contacts are imported, a "Contact Created" trigger would fire 500 SMS in a few seconds. Add a `max_per_minute` throttle per workflow (default 10).

9. **Title overflow.** The workflow title field doesn't wrap or show a character count, so long names are visually cut off. Fix with `overflow: hidden; text-overflow: ellipsis` on the display and a 80-char max.

10. **No version history.** Editing a running workflow should snapshot the previous version so you can revert.

### Proposed new action list (grouped, with icons)

- **Communication:** Send SMS, Send Email, Start AI Call, Leave Voicemail Drop
- **Flow:** Wait, If/Else, A/B Split, Stop
- **CRM:** Update Contact Status, Add Tag, Remove Tag, Assign Owner, Create Task, Create Deal, Move Deal Stage
- **Integrations:** HTTP Webhook, Google Calendar Event, Zapier Catch
- **AI:** Summarize Conversation, Score Lead, Next-Best-Action

---

## D. Design System File

See `lead-friendly-design-system.html` for the self-contained reference implementation with color tokens, typography scale, button variants, form controls, cards, status badges, navigation, KPI widgets, table rows, timeline entries, empty states, and a small reference layout.

---

## P0 — New Contact Creation Bug

Adding a new contact is broken:
> Could not find the 'lender_name' column of 'contacts' in the schema cache

The frontend posts a `lender_name` column that the database doesn't have (never migrated). Fix: Migration `010_contacts_lender_name.sql` to add the column.
