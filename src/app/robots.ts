import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/seo/master-brand'

// Master-brand /robots.txt. White-label tenants on custom domains get a
// "Disallow: /" robots response served by src/proxy.ts before this route
// is reached, so this file only ever runs on master.

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/dashboard',
          '/dashboard/',
          '/launchpad',
          '/launchpad/',
          '/admin',
          '/admin/',
        ],
      },
      { userAgent: 'GPTBot', allow: '/' },
      { userAgent: 'ClaudeBot', allow: '/' },
      { userAgent: 'PerplexityBot', allow: '/' },
      { userAgent: 'Google-Extended', allow: '/' },
      { userAgent: 'CCBot', allow: '/' },
      { userAgent: 'anthropic-ai', allow: '/' },
      { userAgent: 'cohere-ai', allow: '/' },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
