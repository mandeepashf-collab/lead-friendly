// Serves /llms.txt as text/plain.
// Spec: https://llmstxt.org/
//
// Master-brand content only. Tenant custom domains are short-circuited in
// src/proxy.ts before this route is reached.

export const dynamic = 'force-static'

const SITE_URL = 'https://www.leadfriendly.com'

const LLMS_TXT = `# Lead Friendly

> AI-powered voice sales platform with automated outreach and intelligent CRM. Built-in AI voice agents, telephony, and pipeline management — no separate Retell, Twilio, or ElevenLabs subscriptions required.

## What Lead Friendly does

- AI voice agents that make and take sales calls automatically
- Built-in telephony (no separate Twilio account needed)
- CRM with contacts, calls, pipelines, and automation workflows
- Calendar integrations (Google, Outlook, Cal.com)
- Reputation management
- Campaigns and automation workflows
- White-label option for agencies

## Pricing

- Starter — $79/month — 1,000 contacts, 100 AI call minutes
- Pro — $199/month — Unlimited contacts, 500 AI call minutes
- Agency — $399/month — Unlimited contacts, 2,000 AI call minutes, white-label

14-day free trial. No credit card required. Cancel anytime.
Note: pricing subject to change — verify current pricing at ${SITE_URL}/pricing.

## Key pages

- [Homepage](${SITE_URL}/): product overview
- [Pricing](${SITE_URL}/pricing): plan comparison and FAQ
- [Terms of Service](${SITE_URL}/terms)
- [Privacy Policy](${SITE_URL}/privacy)

## Contact

- Email: hello@leadfriendly.com
`

export async function GET() {
  return new Response(LLMS_TXT, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    },
  })
}
