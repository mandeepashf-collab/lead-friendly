'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Building2, User, Mail, Phone,
  Loader2, CheckCircle, AlertTriangle, ChevronRight, DollarSign
} from 'lucide-react'
import { SUB_ACCOUNT_PLANS, type SubAccountPlan } from '@/lib/schemas/stage3'

// ── Stage 3.3 — Add client account form ───────────────────────────────────
// Calls POST /api/agency/create-client which:
//   1. Calls create_sub_account RPC (org row + TCPA defaults + audit log)
//   2. Sends Supabase magic-link invite to adminEmail
//   3. Links the invited user's profile.organization_id = newOrgId
//
// No passwords are handled here — clients receive an email and set their own.
//
// Schema migration vs. pre-Stage-3.1 form:
//   - Removed: password, confirmPassword, agencies lookup, clientOverageRate
//   - Added: agencyBilledAmount (what the agency charges this client/mo)
//   - Plan price/minutes are display hints only — the RPC accepts ai_minutes_limit
//     directly so the agency can override defaults if they want.

const PLAN_DEFAULTS: Record<SubAccountPlan, {
  label: string
  ourPrice: number      // what Lead Friendly charges the agency
  minutes: number
  agents: number
  description: string
  recommended?: boolean
}> = {
  starter: {
    label: 'Starter',
    ourPrice: 39,
    minutes: 150,
    agents: 1,
    description: 'Solo / testing',
  },
  growth: {
    label: 'Growth',
    ourPrice: 99,
    minutes: 350,
    agents: 3,
    description: 'Regular users',
    recommended: true,
  },
  pro: {
    label: 'Pro',
    ourPrice: 149,
    minutes: 600,
    agents: 10,
    description: 'Power users',
  },
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-zinc-300">{label}</label>
      {children}
      {hint && <p className="text-xs text-zinc-500">{hint}</p>}
    </div>
  )
}

function Input({
  value, onChange, placeholder, type = 'text', icon: Icon, prefix,
}: {
  value: string; onChange: (v: string) => void
  placeholder?: string; type?: string; icon?: React.ElementType
  prefix?: string
}) {
  return (
    <div className="flex items-center bg-zinc-900 border border-zinc-700 rounded-lg overflow-hidden focus-within:border-indigo-500 transition-colors">
      {Icon && (
        <span className="pl-3 text-zinc-500"><Icon size={15} /></span>
      )}
      {prefix && (
        <span className="pl-3 pr-1 text-zinc-500 text-sm">{prefix}</span>
      )}
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 px-3 py-2.5 text-sm text-white bg-transparent outline-none placeholder:text-zinc-600"
      />
    </div>
  )
}

export default function NewSubAccountPage() {
  const router = useRouter()

  const [step, setStep] = useState<'details' | 'plan' | 'confirm'>('details')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState(false)
  const [createdOrgId, setCreatedOrgId] = useState<string | null>(null)
  const [inviteStatus, setInviteStatus] = useState<{ sent: boolean; error?: string } | null>(null)

  // Form fields
  const [companyName, setCompanyName] = useState('')
  const [contactName, setContactName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [selectedPlan, setSelectedPlan] = useState<SubAccountPlan>('starter')
  // What the agency bills its client per month (different from what we charge them).
  // Defaults to the plan's our-price as a starting point; agency adjusts.
  const [billedAmount, setBilledAmount] = useState('')

  const plan = PLAN_DEFAULTS[selectedPlan]

  async function handleCreate() {
    setSaving(true)
    setError(null)
    try {
      const billedNum = billedAmount ? Number(billedAmount) : null
      if (billedAmount && (Number.isNaN(billedNum) || billedNum! < 0)) {
        throw new Error('Monthly fee must be a non-negative number')
      }

      const res = await fetch('/api/agency/create-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: companyName,
          adminEmail: email || null,
          plan: selectedPlan,
          agencyBilledAmount: billedNum,
          aiMinutesLimit: plan.minutes,  // start at plan default; agency can edit later
          sendInvite: !!email,
        }),
      })
      const data = await res.json() as {
        error?: string
        subOrganizationId?: string
        invite?: { sent: boolean; error?: string } | null
      }
      if (!res.ok) throw new Error(data.error || 'Failed to create client account')

      setCreatedOrgId(data.subOrganizationId ?? null)
      setInviteStatus(data.invite ?? null)
      setCreated(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create sub-account')
    } finally {
      setSaving(false)
    }
  }

  if (created) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
      <div className="text-center space-y-5 max-w-md w-full">
        <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle size={32} className="text-emerald-400" />
        </div>
        <p className="text-xl font-semibold text-white">Client account created!</p>

        {inviteStatus?.sent ? (
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 text-left space-y-3">
            <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium">
              <Mail size={14} /> Invite sent
            </div>
            <p className="text-sm text-zinc-300">
              We sent a magic-link invite to <span className="font-mono text-white">{email}</span>.
            </p>
            <p className="text-xs text-zinc-500">
              The client clicks the link in their email to set up their password and sign in.
              The invite is valid for 24 hours; you can re-invite from the sub-account settings page if it expires.
            </p>
          </div>
        ) : email ? (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-left space-y-2">
            <div className="flex items-center gap-2 text-amber-400 text-sm font-medium">
              <AlertTriangle size={14} /> Account created, but invite failed
            </div>
            <p className="text-sm text-zinc-300">
              The sub-account is ready, but we couldn&apos;t send the invite email.
            </p>
            {inviteStatus?.error && (
              <p className="text-xs text-zinc-500 font-mono break-all">{inviteStatus.error}</p>
            )}
            <p className="text-xs text-zinc-500">
              You can resend from the sub-account settings page once the issue is resolved.
            </p>
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 text-left">
            <p className="text-sm text-zinc-300">
              Account created. No admin email was provided, so no invite was sent yet.
              You can invite a user later from the sub-account settings page.
            </p>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button onClick={() => router.push('/agency/dashboard')}
            className="flex-1 py-2.5 border border-zinc-700 text-zinc-400 hover:text-zinc-300 text-sm font-medium rounded-lg transition-colors">
            Back to dashboard
          </button>
          {createdOrgId && (
            <button onClick={() => router.push(`/agency/sub-accounts/${createdOrgId}/settings`)}
              className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors">
              Open sub-account
            </button>
          )}
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <div className="border-b border-zinc-800 bg-zinc-900/50 px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-4">
          <button onClick={() => router.push('/agency/dashboard')}
            className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-300 transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-base font-semibold">Add client account</h1>
            <p className="text-xs text-zinc-500">Create a new white-label sub-account</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-8">

        {/* Step indicator */}
        <div className="flex items-center gap-3 mb-8">
          {(['details', 'plan', 'confirm'] as const).map((s, i) => (
            <div key={s} className="flex items-center gap-3">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                step === s ? 'bg-indigo-600 text-white' :
                (['details', 'plan', 'confirm'].indexOf(step) > i) ? 'bg-emerald-600 text-white' :
                'bg-zinc-800 text-zinc-500'
              }`}>
                {(['details', 'plan', 'confirm'].indexOf(step) > i) ? <CheckCircle size={14} /> : i + 1}
              </div>
              <span className={`text-sm ${step === s ? 'text-white font-medium' : 'text-zinc-500'}`}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </span>
              {i < 2 && <ChevronRight size={14} className="text-zinc-700" />}
            </div>
          ))}
        </div>

        {/* Step 1 — Client details */}
        {step === 'details' && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-5">
            <h2 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
              <Building2 size={16} className="text-indigo-400" /> Client information
            </h2>

            <Field label="Company name" hint="Shown in the client's portal — their brand, not yours">
              <Input value={companyName} onChange={setCompanyName} placeholder="Acme Corp" icon={Building2} />
            </Field>

            <Field label="Contact name (optional)">
              <Input value={contactName} onChange={setContactName} placeholder="Jane Smith" icon={User} />
            </Field>

            <Field
              label="Admin email"
              hint="We'll email a magic-link invite. They click it, set a password, and sign in.">
              <Input value={email} onChange={setEmail} placeholder="jane@acmecorp.com" type="email" icon={Mail} />
            </Field>

            <Field label="Phone (optional)">
              <Input value={phone} onChange={setPhone} placeholder="+1 (555) 000-0000" icon={Phone} />
            </Field>

            <button
              onClick={() => setStep('plan')}
              disabled={!companyName.trim()}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2">
              Continue to plan <ChevronRight size={16} />
            </button>
          </div>
        )}

        {/* Step 2 — Plan selection */}
        {step === 'plan' && (
          <div className="space-y-4">
            <div className="space-y-3">
              {SUB_ACCOUNT_PLANS.map(planId => {
                const p = PLAN_DEFAULTS[planId]
                return (
                  <button
                    key={planId}
                    onClick={() => setSelectedPlan(planId)}
                    className={`w-full text-left p-4 rounded-xl border transition-all ${
                      selectedPlan === planId
                        ? 'border-indigo-500 bg-indigo-500/10'
                        : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700'
                    }`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white">{p.label}</span>
                        {p.recommended && (
                          <span className="text-xs bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 px-2 py-0.5 rounded-full">
                            Popular
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-semibold text-white">${p.ourPrice}</span>
                        <span className="text-xs text-zinc-500">/mo you pay us</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-zinc-500">
                      <span>{p.minutes} min/mo included</span>
                      <span>·</span>
                      <span>{p.agents} AI agent{p.agents > 1 ? 's' : ''}</span>
                      <span>·</span>
                      <span>{p.description}</span>
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Agency-billed amount */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
              <p className="text-sm font-medium text-zinc-300">Your monthly fee to client (optional)</p>
              <p className="text-xs text-zinc-500 -mt-1">
                What you charge this client per month. Used for your MRR dashboard. Leave blank if billed elsewhere.
              </p>
              <Input
                value={billedAmount}
                onChange={setBilledAmount}
                placeholder={String(plan.ourPrice * 2)}
                type="number"
                prefix="$"
                icon={DollarSign}
              />
              {billedAmount && Number(billedAmount) >= plan.ourPrice && (
                <p className="text-xs text-emerald-400">
                  Margin: ${(Number(billedAmount) - plan.ourPrice).toFixed(2)}/mo
                </p>
              )}
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep('details')}
                className="flex-1 py-2.5 border border-zinc-700 text-zinc-400 hover:text-zinc-300 text-sm font-medium rounded-lg transition-colors">
                Back
              </button>
              <button onClick={() => setStep('confirm')}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2">
                Review <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Step 3 — Confirm */}
        {step === 'confirm' && (
          <div className="space-y-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
              <h2 className="text-sm font-medium text-zinc-300">Confirm sub-account</h2>

              <div className="space-y-2">
                {[
                  ['Company', companyName],
                  ['Contact', contactName || '—'],
                  ['Admin email', email || '— (no invite will be sent)'],
                  ['Plan', `${plan.label} — $${plan.ourPrice}/mo (Lead Friendly)`],
                  ['Minutes included', `${plan.minutes}/mo`],
                  ['AI agents', plan.agents.toString()],
                  ['Your fee to client', billedAmount ? `$${Number(billedAmount).toFixed(2)}/mo` : '— (not tracked)'],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between text-sm py-2 border-b border-zinc-800 last:border-0">
                    <span className="text-zinc-500">{label}</span>
                    <span className="text-white font-medium">{value}</span>
                  </div>
                ))}
              </div>

              <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-lg p-3 text-xs text-indigo-300">
                {email
                  ? 'On submit: the sub-account is created and a magic-link invite is emailed to the admin. They set their own password.'
                  : 'On submit: the sub-account is created. You can invite a user later from the sub-account settings page.'}
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
                <AlertTriangle size={16} /> {error}
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => setStep('plan')}
                className="flex-1 py-2.5 border border-zinc-700 text-zinc-400 hover:text-zinc-300 text-sm font-medium rounded-lg transition-colors">
                Back
              </button>
              <button
                onClick={handleCreate}
                disabled={saving}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2">
                {saving ? <><Loader2 size={16} className="animate-spin" /> Creating...</> : 'Create account'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
