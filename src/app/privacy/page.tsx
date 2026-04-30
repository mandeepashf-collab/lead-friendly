// Boilerplate Privacy Policy. HAVE A LAWYER REVIEW BEFORE PRODUCTION USE.
// This is a starting template — not legal advice.

import Link from 'next/link'
import type { Metadata } from 'next'
import { ensureMasterBrandOr404 } from '@/lib/seo/ensure-master'

const SITE_URL = 'https://www.leadfriendly.com'
const EFFECTIVE_DATE = 'April 30, 2026'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How Lead Friendly collects, uses, and protects your data.',
  alternates: { canonical: `${SITE_URL}/privacy` },
  robots: { index: true, follow: true },
}

export default async function PrivacyPage() {
  await ensureMasterBrandOr404()
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="mx-auto flex max-w-4xl items-center justify-between px-6 py-6">
        <Link href="/" className="font-semibold">
          Lead Friendly
        </Link>
        <nav className="flex items-center gap-6 text-sm text-zinc-300">
          <Link href="/pricing" className="hover:text-white">Pricing</Link>
          <Link href="/login" className="hover:text-white">Sign in</Link>
        </nav>
      </header>

      <article className="mx-auto max-w-3xl px-6 py-12 prose prose-invert">
        <h1>Privacy Policy</h1>
        <p className="text-sm text-zinc-400">Effective date: {EFFECTIVE_DATE}</p>

        <h2>1. Introduction</h2>
        <p>
          This Privacy Policy describes how Lead Friendly (&ldquo;we&rdquo;,
          &ldquo;us&rdquo;, or &ldquo;our&rdquo;) collects, uses, and shares
          information when you use our platform (the &ldquo;Service&rdquo;).
        </p>

        <h2>2. Information We Collect</h2>
        <h3>Information you provide</h3>
        <ul>
          <li><strong>Account information:</strong> name, email, password, organization details.</li>
          <li><strong>Customer content:</strong> contacts, call recordings, transcripts, CRM records, and other data you upload or generate.</li>
          <li><strong>Payment information:</strong> processed by our payment provider (Stripe). We do not store full card numbers.</li>
        </ul>
        <h3>Information collected automatically</h3>
        <ul>
          <li><strong>Usage data:</strong> pages visited, features used, timestamps, device and browser information.</li>
          <li><strong>Log data:</strong> IP address, error reports, performance metrics.</li>
          <li><strong>Cookies:</strong> for authentication and core functionality only. We do not use third-party advertising cookies.</li>
        </ul>

        <h2>3. How We Use Information</h2>
        <ul>
          <li>To provide, operate, and improve the Service;</li>
          <li>To process AI voice calls and generate transcripts via our processors (e.g., Telnyx, ElevenLabs, Deepgram, Anthropic);</li>
          <li>To process payments and manage subscriptions (via Stripe);</li>
          <li>To communicate with you about your account and the Service (via Resend or similar transactional email providers);</li>
          <li>To detect, prevent, and address fraud, abuse, or technical issues;</li>
          <li>To comply with legal obligations.</li>
        </ul>

        <h2>4. AI Voice Processing</h2>
        <p>
          Voice calls made through the Service are processed by AI voice and speech
          providers, including ElevenLabs (text-to-speech), Deepgram (speech-to-text),
          and Anthropic (language model). Audio and transcripts are transmitted over
          encrypted connections. We do not use customer call data to train third-party
          models without your explicit consent.
        </p>

        <h2>5. Sharing of Information</h2>
        <p>We share information with:</p>
        <ul>
          <li><strong>Service providers</strong> who help us operate the Service (cloud hosting, telephony, AI voice, payment, email);</li>
          <li><strong>Legal authorities</strong> when required by law, subpoena, or court order;</li>
          <li><strong>Successor entities</strong> in connection with a merger, acquisition, or sale of assets.</li>
        </ul>
        <p>We do not sell personal information.</p>

        <h2>6. Data Retention</h2>
        <p>
          We retain account and customer content for as long as your account is
          active. After account closure, we retain limited data as required for
          legal, accounting, or fraud-prevention purposes, then delete or anonymize
          it.
        </p>

        <h2>7. Security</h2>
        <p>
          We use industry-standard safeguards including TLS encryption in transit,
          encryption at rest for sensitive data, and strict access controls. No
          system is perfectly secure; we encourage you to use strong, unique
          passwords and to enable any available multi-factor authentication.
        </p>

        <h2>8. Your Rights</h2>
        <p>
          Depending on your jurisdiction (including under GDPR and CCPA), you may
          have rights to access, correct, delete, or export your personal
          information, and to object to or restrict certain processing. To exercise
          these rights, email{' '}
          <a href="mailto:hello@leadfriendly.com">hello@leadfriendly.com</a>.
        </p>

        <h2>9. International Transfers</h2>
        <p>
          Your information may be processed in countries other than your country of
          residence. Where required, we use Standard Contractual Clauses or other
          legally recognized transfer mechanisms.
        </p>

        <h2>10. Children</h2>
        <p>
          The Service is not intended for individuals under 18, and we do not
          knowingly collect personal information from children.
        </p>

        <h2>11. Changes to This Policy</h2>
        <p>
          We may update this Privacy Policy from time to time. Material changes
          will be communicated via email or in-product notification.
        </p>

        <h2>12. Contact</h2>
        <p>
          Questions about this Privacy Policy or our data practices? Email{' '}
          <a href="mailto:hello@leadfriendly.com">hello@leadfriendly.com</a>.
        </p>
      </article>

      <footer className="border-t border-zinc-900">
        <div className="mx-auto max-w-4xl px-6 py-8 text-sm text-zinc-500">
          &copy; {new Date().getFullYear()} Lead Friendly.
        </div>
      </footer>
    </main>
  )
}
