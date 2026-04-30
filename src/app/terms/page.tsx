// Boilerplate Terms of Service. HAVE A LAWYER REVIEW BEFORE PRODUCTION USE.
// This is a starting template — not legal advice.

import Link from 'next/link'
import type { Metadata } from 'next'
import { ensureMasterBrandOr404 } from '@/lib/seo/ensure-master'

const SITE_URL = 'https://www.leadfriendly.com'
const EFFECTIVE_DATE = 'April 30, 2026'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Terms of Service for the Lead Friendly platform.',
  alternates: { canonical: `${SITE_URL}/terms` },
  robots: { index: true, follow: true },
}

export default async function TermsPage() {
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
        <h1>Terms of Service</h1>
        <p className="text-sm text-zinc-400">Effective date: {EFFECTIVE_DATE}</p>

        <h2>1. Agreement to Terms</h2>
        <p>
          By accessing or using Lead Friendly (the &ldquo;Service&rdquo;), you agree
          to be bound by these Terms of Service (&ldquo;Terms&rdquo;). If you do not
          agree, do not use the Service.
        </p>

        <h2>2. Description of Service</h2>
        <p>
          Lead Friendly is a software-as-a-service platform that provides AI-powered
          voice calling, customer relationship management (CRM), and related sales
          tools.
        </p>

        <h2>3. Eligibility</h2>
        <p>
          You must be at least 18 years old and legally capable of entering into
          binding contracts to use the Service. By creating an account, you represent
          that you meet these requirements.
        </p>

        <h2>4. Account Registration</h2>
        <p>
          You agree to provide accurate, current, and complete information during
          registration and to keep your account information up to date. You are
          responsible for safeguarding your account credentials and for all
          activities that occur under your account.
        </p>

        <h2>5. Acceptable Use</h2>
        <p>You agree not to use the Service to:</p>
        <ul>
          <li>Make calls or send messages that violate the Telephone Consumer Protection Act (TCPA), CAN-SPAM, GDPR, or other applicable laws;</li>
          <li>Contact individuals on Do Not Call (DNC) lists without proper consent;</li>
          <li>Engage in fraudulent, deceptive, or harassing communications;</li>
          <li>Impersonate any person or entity;</li>
          <li>Attempt to gain unauthorized access to the Service or its systems;</li>
          <li>Reverse engineer, decompile, or disassemble the Service;</li>
          <li>Use the Service to transmit malware, spam, or unsolicited commercial communications.</li>
        </ul>

        <h2>6. AI-Generated Voice Calls</h2>
        <p>
          You acknowledge that the Service uses artificial intelligence to make and
          receive voice calls. You are responsible for ensuring that your use of
          AI-generated calls complies with all applicable disclosure, consent, and
          recording laws in the jurisdictions where you operate.
        </p>

        <h2>7. Subscription, Billing, and Cancellation</h2>
        <p>
          Subscription fees and any usage-based charges (including AI call minute
          overages) are billed in advance on a recurring basis. You may cancel your
          subscription at any time; cancellation takes effect at the end of the
          current billing period. Refunds are provided at our sole discretion.
        </p>

        <h2>8. Intellectual Property</h2>
        <p>
          The Service and its original content, features, and functionality are
          owned by Lead Friendly and are protected by copyright, trademark, and
          other intellectual property laws. You retain ownership of all content you
          upload (&ldquo;Customer Content&rdquo;), and you grant Lead Friendly a
          limited license to host and process Customer Content as necessary to
          provide the Service.
        </p>

        <h2>9. Privacy</h2>
        <p>
          Your use of the Service is also governed by our{' '}
          <Link href="/privacy">Privacy Policy</Link>.
        </p>

        <h2>10. Third-Party Services</h2>
        <p>
          The Service integrates with third-party providers including telephony,
          AI voice, calendar, and payment systems. Your use of those providers may
          be governed by their own terms.
        </p>

        <h2>11. Termination</h2>
        <p>
          We may suspend or terminate your access to the Service at any time, with
          or without notice, for any conduct that we believe violates these Terms or
          is harmful to other users, us, or third parties.
        </p>

        <h2>12. Disclaimers</h2>
        <p>
          THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo;
          WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT
          LIMITED TO MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND
          NON-INFRINGEMENT.
        </p>

        <h2>13. Limitation of Liability</h2>
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, LEAD FRIENDLY SHALL NOT BE LIABLE
          FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES
          ARISING OUT OF YOUR USE OF THE SERVICE.
        </p>

        <h2>14. Changes to Terms</h2>
        <p>
          We may update these Terms from time to time. Material changes will be
          communicated via email or in-product notification. Your continued use of
          the Service after the effective date constitutes acceptance of the
          updated Terms.
        </p>

        <h2>15. Contact</h2>
        <p>
          Questions about these Terms? Email{' '}
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
