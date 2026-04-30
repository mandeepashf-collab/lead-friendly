// Reusable JSON-LD component for structured data.
// Usage:
//   import { JsonLd } from '@/components/seo/json-ld'
//   <JsonLd data={{ "@context": "https://schema.org", "@type": "Organization", ... }} />

type JsonLdProps = {
  data: Record<string, unknown> | Record<string, unknown>[]
}

export function JsonLd({ data }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  )
}

// Site-wide Organization schema. Rendered ONLY on master-brand requests
// (the layout branches on isMasterBrandHost before rendering this).
export function OrganizationSchema() {
  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: 'Lead Friendly',
        url: 'https://www.leadfriendly.com',
        logo: 'https://www.leadfriendly.com/opengraph-image',
        description:
          'AI-powered voice sales platform with automated outreach and intelligent CRM.',
        email: 'hello@leadfriendly.com',
        // Add sameAs links once social profiles exist:
        // sameAs: [
        //   'https://www.linkedin.com/company/leadfriendly',
        //   'https://x.com/leadfriendly',
        // ],
      }}
    />
  )
}

// Homepage SoftwareApplication schema. Pricing offers are intentionally an
// AggregateOffer with low/high range until the locked pricing ships in a
// follow-up patch — wrong prices in JSON-LD can leak into Knowledge Graph.
export function SoftwareApplicationSchema() {
  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: 'Lead Friendly',
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        url: 'https://www.leadfriendly.com',
        description:
          'AI-powered voice sales platform with automated outreach and intelligent CRM. Built-in AI voice agents, telephony, and pipeline management.',
        offers: {
          '@type': 'AggregateOffer',
          lowPrice: '79',
          highPrice: '399',
          priceCurrency: 'USD',
        },
      }}
    />
  )
}
