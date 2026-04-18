'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Building2, User, Mail, Phone,
  Loader2, CheckCircle, AlertTriangle, ChevronRight
} from 'lucide-react'

const PLANS = [
  {
    id: 'starter',
    label: 'Starter',
    price: 39,
    minutes: 150,
    agents: 1,
    description: 'Solo / testing',
  },
  {
    id: 'growth',
    label: 'Growth',
    price: 99,
    minutes: 350,
    agents: 3,
    description: 'Regular users',
    recommended: true,
  },
  {
    id: 'agency',
    label: 'Agency',
    price: 149,
    minutes: 600,
    agents: 10,
    description: 'Power users',
  },
]

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
  value, onChange, placeholder, type = 'text', icon: Icon
}: {
  value: string; onChange: (v: string) => void
  placeholder?: string; type?: string; icon?: React.ElementType
}) {
  return (
    <div className="flex items-center bg-zinc-900 border border-zinc-700 rounded-lg overflow-hidden focus-within:border-indigo-500 transition-colors">
      {Icon && (
        <span className="pl-3 text-zinc-500"><Icon size={15} /></span>
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
  const supabase = createClient()
  const router = useRouter()

  const [step, setStep] = useState<'details' | 'plan' | 'confirm'>('details')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState(false)

  // Form fields
  const [companyName, setCompanyName] = useState('')
  const [contactName, setContactName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [phone, setPhone] = useState('')
  const [selectedPlan, setSelectedPlan] = useState('starter')
  const [clientOverageRate, setClientOverageRate] = useState('0.25')
  const [createdCredentials, setCreatedCredentials] = useState<{ email: string; password: string } | null>(null)

  const plan = PLANS.find(p => p.id === selectedPlan)!

  async function handleCreate() {
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { data: agency } = await supabase
        .from('agencies').select('id').eq('user_id', user.id).single()

      const res = await fetch('/api/agency/create-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          contactName,
          companyName,
          phone,
          plan: selectedPlan,
          agencyId: agency?.id || user.id,
          monthlyFee: plan.price,
          minutesIncluded: plan.minutes,
          clientOverageRate: parseFloat(clientOverageRate),
        }),
      })
      const data = await res.json() as { error?: string; credentials?: { email: string; password: string } }
      if (!res.ok) throw new Error(data.error || 'Failed to create client')

      setCreatedCredentials(data.credentials || null)
      setCreated(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create sub-account')
    } finally {
      setSaving(false)
    }
  }

  if (created) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
      <div className="text-center space-y-5 max-w-sm w-full">
        <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle size={32} className="text-emerald-400" />
        </div>
        <p className="text-xl font-semibold text-white">Client account created!</p>
        {createdCredentials && (
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 text-left space-y-2">
            <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-3">Share with your client</p>
            <div>
              <p className="text-xs text-zinc-500">Login URL</p>
              <p className="text-sm text-indigo-400 font-mono">https://leadfriendly.com/login</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">Email</p>
              <p className="text-sm text-white font-mono">{createdCredentials.email}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">Password</p>
              <p className="text-sm text-white font-mono">{createdCredentials.password}</p>
            </div>
            <p className="text-xs text-amber-400/80 pt-2">⚠ Save these credentials now — they won&apos;t be shown again.</p>
          </div>
        )}
        <button onClick={() => router.push('/agency/dashboard')}
          className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors">
          Go to dashboard
        </button>
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

            <Field label="Company name" hint="This is what the client sees — your brand, not Lead Friendly">
              <Input value={companyName} onChange={setCompanyName} placeholder="Acme Corp" icon={Building2} />
            </Field>

            <Field label="Contact name">
              <Input value={contactName} onChange={setContactName} placeholder="Jane Smith" icon={User} />
            </Field>

            <Field label="Email">
              <Input value={email} onChange={setEmail} placeholder="jane@acmecorp.com" type="email" icon={Mail} />
            </Field>

            <Field label="Password" hint="Client will use this to log in. Min 8 characters.">
              <Input value={password} onChange={setPassword} placeholder="Min 8 characters" type="password" icon={User} />
            </Field>

            <Field label="Confirm password">
              <Input value={confirmPassword} onChange={setConfirmPassword} placeholder="Re-enter password" type="password" icon={User} />
            </Field>

            <Field label="Phone (optional)">
              <Input value={phone} onChange={setPhone} placeholder="+1 (555) 000-0000" icon={Phone} />
            </Field>

            <button
              onClick={() => setStep('plan')}
              disabled={!companyName || !email || !password || password !== confirmPassword}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2">
              Continue to plan <ChevronRight size={16} />
            </button>
          </div>
        )}

        {/* Step 2 — Plan selection */}
        {step === 'plan' && (
          <div className="space-y-4">
            <div className="space-y-3">
              {PLANS.map(p => (
                <button
                  key={p.id}
                  onClick={() => setSelectedPlan(p.id)}
                  className={`w-full text-left p-4 rounded-xl border transition-all ${
                    selectedPlan === p.id
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
                      <span className="text-lg font-semibold text-white">${p.price}</span>
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
                  <div className="mt-2 text-xs text-zinc-600">
                    You bill client → ${p.price}–${p.price + 110}/mo · margin: ${Math.round(p.price * 0.6)}–${p.price + 70}/mo
                  </div>
                </button>
              ))}
            </div>

            {/* Client overage rate */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
              <p className="text-sm font-medium text-zinc-300">Your overage rate to client</p>
              <div className="flex items-center gap-3">
                <div className="flex items-center bg-zinc-800 border border-zinc-700 rounded-lg overflow-hidden flex-1 focus-within:border-indigo-500">
                  <span className="px-3 text-zinc-500 border-r border-zinc-700">$</span>
                  <input
                    type="number"
                    value={clientOverageRate}
                    onChange={e => setClientOverageRate(e.target.value)}
                    step="0.01"
                    className="flex-1 px-3 py-2 text-sm text-white bg-transparent outline-none"
                  />
                  <span className="px-3 text-zinc-500">/min</span>
                </div>
                <div className="text-xs text-zinc-500 text-right">
                  <div className="text-zinc-400">We charge you: <span className="text-red-400">$0.14/min</span></div>
                  <div className="text-zinc-400">Your margin: <span className="text-emerald-400">${(parseFloat(clientOverageRate) - 0.14).toFixed(2)}/min</span></div>
                </div>
              </div>
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
                  ['Email', email],
                  ['Plan', `${plan.label} — $${plan.price}/mo`],
                  ['Minutes included', `${plan.minutes}/mo`],
                  ['AI agents', plan.agents.toString()],
                  ['Client overage rate', `$${clientOverageRate}/min`],
                  ['Your overage margin', `$${(parseFloat(clientOverageRate) - 0.14).toFixed(2)}/min`],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between text-sm py-2 border-b border-zinc-800 last:border-0">
                    <span className="text-zinc-500">{label}</span>
                    <span className="text-white font-medium">{value}</span>
                  </div>
                ))}
              </div>

              <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-lg p-3 text-xs text-indigo-300">
                This creates an active sub-account. The client can be onboarded immediately.
                You will be billed ${plan.price}/mo for this account starting next invoice cycle.
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
