'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, Upload, Globe, Palette, Phone, DollarSign,
  Save, Wallet, AlertTriangle, CheckCircle, Loader2, Info
} from 'lucide-react'

interface SubAccount {
  id: string
  agency_id: string
  name: string
  email: string
  company_name: string
  logo_url: string
  primary_color: string
  accent_color: string
  custom_domain: string | null
  plan: string
  minutes_included: number
  agency_overage_rate: number
  client_overage_rate: number
  wallet_min_threshold: number
  wallet_reload_amount: number
  status: string
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
        active ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-zinc-300 hover:bg-zinc-800'
      }`}>
      {children}
    </button>
  )
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

function Input({ value, onChange, placeholder, type = 'text', prefix }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string; prefix?: string
}) {
  return (
    <div className="flex items-center bg-zinc-900 border border-zinc-700 rounded-lg overflow-hidden focus-within:border-indigo-500 transition-colors">
      {prefix && <span className="px-3 text-sm text-zinc-500 border-r border-zinc-700 bg-zinc-800/50">{prefix}</span>}
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

export default function SubAccountSettings() {
  const supabase = createClient()
  const router = useRouter()
  const params = useParams()
  const subAccountId = params.id as string
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [account, setAccount] = useState<SubAccount | null>(null)
  const [tab, setTab] = useState<'branding' | 'domain' | 'pricing' | 'wallet'>('branding')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  // Form state
  const [companyName, setCompanyName] = useState('')
  const [email, setEmail] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [primaryColor, setPrimaryColor] = useState('#6366f1')
  const [accentColor, setAccentColor] = useState('#8b5cf6')
  const [customDomain, setCustomDomain] = useState('')
  const [clientOverageRate, setClientOverageRate] = useState('0.25')
  const [walletThreshold, setWalletThreshold] = useState('10')
  const [walletReloadAmount, setWalletReloadAmount] = useState('30')
  const [topUpAmount, setTopUpAmount] = useState('')
  const [topUpLoading, setTopUpLoading] = useState(false)
  const [topUpSuccess, setTopUpSuccess] = useState(false)
  const [walletBalance, setWalletBalance] = useState(0)

  useEffect(() => { loadAccount() }, [subAccountId])

  async function loadAccount() {
    const { data, error } = await supabase
      .from('sub_accounts').select('*').eq('id', subAccountId).single()
    if (data) {
      setAccount(data)
      setCompanyName(data.company_name || '')
      setEmail(data.email || '')
      setLogoUrl(data.logo_url || '')
      setPrimaryColor(data.primary_color || '#6366f1')
      setAccentColor(data.accent_color || '#8b5cf6')
      setCustomDomain(data.custom_domain || '')
      setClientOverageRate(String(data.client_overage_rate || 0.25))
      setWalletThreshold(String(data.wallet_min_threshold || 10))
      setWalletReloadAmount(String(data.wallet_reload_amount || 30))
      setWalletBalance(data.wallet_balance || 0)
    }
    setLoading(false)
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `agency-logos/${subAccountId}.${ext}`
      const { error } = await supabase.storage.from('public').upload(path, file, { upsert: true })
      if (error) throw error
      const { data } = supabase.storage.from('public').getPublicUrl(path)
      setLogoUrl(data.publicUrl)
    } catch (err) {
      console.error('Logo upload failed:', err)
    } finally {
      setUploading(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      const updates: Partial<SubAccount> = {}

      if (tab === 'branding') {
        updates.company_name = companyName
        updates.email = email
        updates.logo_url = logoUrl
        updates.primary_color = primaryColor
        updates.accent_color = accentColor
      } else if (tab === 'domain') {
        updates.custom_domain = customDomain || null
      } else if (tab === 'pricing') {
        updates.client_overage_rate = parseFloat(clientOverageRate)
      } else if (tab === 'wallet') {
        updates.wallet_min_threshold = parseFloat(walletThreshold)
        updates.wallet_reload_amount = parseFloat(walletReloadAmount)
      }

      const { error } = await supabase
        .from('sub_accounts').update(updates).eq('id', subAccountId)

      if (error) throw error
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      console.error('Save failed:', err)
    } finally {
      setSaving(false)
    }
  }

  const agencyRate = parseFloat(account?.agency_overage_rate?.toString() || '0.14')
  const clientRate = parseFloat(clientOverageRate)
  const marginPerMin = clientRate - agencyRate
  const marginPct = agencyRate > 0 ? Math.round((marginPerMin / clientRate) * 100) : 0

  async function handleTopUp() {
    const amount = parseFloat(topUpAmount)
    if (!amount || amount <= 0) return
    setTopUpLoading(true)
    try {
      const res = await fetch('/api/billing/wallet/credit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sub_account_id: subAccountId, amount })
      })
      const data = await res.json()
      if (data.success) {
        setWalletBalance(data.balance_after)
        setTopUpSuccess(true)
        setTopUpAmount('')
        setTimeout(() => setTopUpSuccess(false), 3000)
      }
    } catch (err) {
      console.error('Top-up failed:', err)
    } finally {
      setTopUpLoading(false)
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <Loader2 size={24} className="text-zinc-400 animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <div className="border-b border-zinc-800 bg-zinc-900/50 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-4">
          <button onClick={() => router.push('/agency/dashboard')}
            className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-300 transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div className="flex items-center gap-3">
            {logoUrl ? (
              <img src={logoUrl} alt={companyName} className="w-9 h-9 rounded-lg object-cover border border-zinc-700" />
            ) : (
              <div className="w-9 h-9 rounded-lg flex items-center justify-center text-sm font-semibold"
                style={{ backgroundColor: primaryColor + '33', color: primaryColor, border: `1px solid ${primaryColor}44` }}>
                {(companyName || account?.name || 'C')[0].toUpperCase()}
              </div>
            )}
            <div>
              <h1 className="text-base font-semibold">{companyName || account?.name}</h1>
              <p className="text-xs text-zinc-500">Sub-account settings</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Tabs */}
        <div className="flex items-center gap-2 mb-8 p-1 bg-zinc-900 border border-zinc-800 rounded-xl w-fit">
          {(['branding', 'domain', 'pricing', 'wallet'] as const).map(t => (
            <TabBtn key={t} active={tab === t} onClick={() => setTab(t)}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </TabBtn>
          ))}
        </div>

        {/* Branding tab */}
        {tab === 'branding' && (
          <div className="space-y-6">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-5">
              <h2 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                <Palette size={16} className="text-indigo-400" /> Brand identity
              </h2>

              <Field label="Company name" hint="Shown to client — never shows 'Lead Friendly'">
                <Input value={companyName} onChange={setCompanyName} placeholder="Acme Corp" />
              </Field>

              <Field label="Client email">
                <Input value={email} onChange={setEmail} placeholder="client@company.com" type="email" />
              </Field>

              <Field label="Logo" hint="Square format recommended, min 64×64px">
                <div className="flex items-center gap-4">
                  {logoUrl ? (
                    <img src={logoUrl} alt="Logo" className="w-16 h-16 rounded-xl object-cover border border-zinc-700" />
                  ) : (
                    <div className="w-16 h-16 rounded-xl border border-dashed border-zinc-700 flex items-center justify-center">
                      <Upload size={20} className="text-zinc-600" />
                    </div>
                  )}
                  <div className="space-y-2">
                    <input ref={fileInputRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                    <button onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="flex items-center gap-2 px-4 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors disabled:opacity-50">
                      {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                      {uploading ? 'Uploading...' : 'Upload logo'}
                    </button>
                    {logoUrl && (
                      <button onClick={() => setLogoUrl('')} className="block text-xs text-red-400 hover:text-red-300">
                        Remove logo
                      </button>
                    )}
                  </div>
                </div>
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Primary color">
                  <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-700 rounded-lg p-2">
                    <input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)}
                      className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent" />
                    <Input value={primaryColor} onChange={setPrimaryColor} placeholder="#6366f1" />
                  </div>
                </Field>
                <Field label="Accent color">
                  <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-700 rounded-lg p-2">
                    <input type="color" value={accentColor} onChange={e => setAccentColor(e.target.value)}
                      className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent" />
                    <Input value={accentColor} onChange={setAccentColor} placeholder="#8b5cf6" />
                  </div>
                </Field>
              </div>

              {/* Live preview */}
              <div className="rounded-xl border border-zinc-700 p-4 space-y-3">
                <p className="text-xs text-zinc-500">Brand preview</p>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold"
                    style={{ backgroundColor: primaryColor + '22', color: primaryColor }}>
                    {(companyName || 'C')[0]}
                  </div>
                  <span className="text-sm font-medium" style={{ color: primaryColor }}>{companyName || 'Company Name'}</span>
                </div>
                <button className="px-4 py-2 text-sm text-white rounded-lg font-medium"
                  style={{ backgroundColor: primaryColor }}>
                  Sample button
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Domain tab */}
        {tab === 'domain' && (
          <div className="space-y-6">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-5">
              <h2 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                <Globe size={16} className="text-indigo-400" /> Custom domain
              </h2>

              <Field label="Client's domain" hint="Client will access the CRM at this domain — Lead Friendly is hidden">
                <Input value={customDomain} onChange={setCustomDomain} placeholder="crm.clientbusiness.com" />
              </Field>

              <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Info size={14} className="text-blue-400" />
                  <span className="text-sm font-medium text-blue-400">DNS setup required</span>
                </div>
                <p className="text-xs text-zinc-400">
                  Tell your client to add a CNAME record at their DNS provider:
                </p>
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 font-mono text-xs">
                  <div className="grid grid-cols-3 gap-2 text-zinc-400 mb-2 border-b border-zinc-800 pb-2">
                    <span>Type</span><span>Host</span><span>Value</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-white">
                    <span>CNAME</span>
                    <span>{customDomain ? customDomain.split('.').slice(-3).join('.') : 'crm'}</span>
                    <span>leadfriendly.com</span>
                  </div>
                </div>
                <p className="text-xs text-zinc-500">DNS propagation typically takes 24–48 hours.</p>
              </div>

              {customDomain && (
                <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                  <CheckCircle size={14} className="text-emerald-400" />
                  <span className="text-xs text-emerald-400">Domain configured — save to activate routing</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Pricing tab */}
        {tab === 'pricing' && (
          <div className="space-y-6">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-5">
              <h2 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                <DollarSign size={16} className="text-indigo-400" /> Overage markup
              </h2>

              <div className="bg-zinc-800/50 rounded-xl p-4 space-y-3">
                <p className="text-xs text-zinc-400 font-medium">How this works</p>
                <div className="space-y-2 text-xs text-zinc-500">
                  <div className="flex justify-between">
                    <span>We charge you per overage minute</span>
                    <span className="text-red-400 font-medium">${account?.agency_overage_rate}/min</span>
                  </div>
                  <div className="flex justify-between">
                    <span>You charge your client per minute</span>
                    <span className="text-emerald-400 font-medium">${clientOverageRate}/min</span>
                  </div>
                  <div className="h-px bg-zinc-700" />
                  <div className="flex justify-between font-medium">
                    <span className="text-zinc-300">Your margin per minute</span>
                    <span className="text-indigo-400">${marginPerMin.toFixed(2)} ({marginPct}%)</span>
                  </div>
                </div>
              </div>

              <Field label="Rate you charge client ($/min)" hint="No ceiling — charge whatever your market supports">
                <Input value={clientOverageRate} onChange={setClientOverageRate} placeholder="0.25" type="number" prefix="$" />
              </Field>

              {marginPerMin < 0 && (
                <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <AlertTriangle size={14} className="text-red-400" />
                  <span className="text-xs text-red-400">Rate is below your cost — you will lose money on overage</span>
                </div>
              )}

              {marginPerMin >= 0 && clientRate > 0 && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
                  <p className="text-xs text-emerald-400 font-medium mb-1">Margin breakdown</p>
                  <p className="text-xs text-zinc-400">
                    At 500 overage minutes/mo: client pays ${(clientRate * 500).toFixed(0)},
                    you pay us ${(agencyRate * 500).toFixed(0)},
                    you keep <span className="text-emerald-400 font-medium">${(marginPerMin * 500).toFixed(0)}</span>
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Wallet tab */}
        {tab === 'wallet' && (
          <div className="space-y-6">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-5">
              <h2 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                <Wallet size={16} className="text-indigo-400" /> Client wallet settings
              </h2>

              <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 text-xs text-zinc-400 space-y-1">
                <p className="text-blue-400 font-medium">How the client wallet works</p>
                <p>Client pre-loads funds into their wallet. Every AI call deducts from it at your markup rate. When balance drops below the threshold, their saved card is auto-charged. If the card fails, calls pause and you get alerted.</p>
              </div>

              {/* Current balance + Add funds */}
              <div className="bg-zinc-800/50 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-400">Current wallet balance</span>
                  <span className={`text-lg font-semibold ${walletBalance > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    ${walletBalance.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center bg-zinc-900 border border-zinc-700 rounded-lg overflow-hidden focus-within:border-indigo-500 flex-1">
                    <span className="px-3 text-sm text-zinc-500 border-r border-zinc-700">$</span>
                    <input
                      type="number"
                      value={topUpAmount}
                      onChange={e => setTopUpAmount(e.target.value)}
                      placeholder="25.00"
                      className="flex-1 px-3 py-2 text-sm text-white bg-transparent outline-none placeholder:text-zinc-600"
                    />
                  </div>
                  <div className="flex gap-1.5">
                    {[25, 50, 100].map(amt => (
                      <button key={amt} onClick={() => setTopUpAmount(String(amt))}
                        className="px-2.5 py-2 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-300 rounded-lg transition-colors border border-zinc-700">
                        ${amt}
                      </button>
                    ))}
                  </div>
                  <button onClick={handleTopUp} disabled={topUpLoading || !topUpAmount}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5">
                    {topUpLoading ? <Loader2 size={14} className="animate-spin" /> : <Wallet size={14} />}
                    Add funds
                  </button>
                </div>
                {topUpSuccess && (
                  <div className="flex items-center gap-2 text-xs text-emerald-400">
                    <CheckCircle size={12} /> Funds added successfully
                  </div>
                )}
              </div>

              <Field label="Auto-reload trigger ($)" hint="Wallet auto-charges client card when balance drops below this">
                <Input value={walletThreshold} onChange={setWalletThreshold} placeholder="10" type="number" prefix="$" />
              </Field>

              <Field label="Auto-reload amount ($)" hint="How much to charge client's card when auto-reload triggers">
                <Input value={walletReloadAmount} onChange={setWalletReloadAmount} placeholder="30" type="number" prefix="$" />
              </Field>

              <div className="bg-zinc-800/50 rounded-xl p-4 space-y-2 text-xs text-zinc-500">
                <p className="font-medium text-zinc-400">Example flow</p>
                <p>Client starts with ${walletReloadAmount} balance → uses {Math.round(parseFloat(walletReloadAmount) / clientRate)} minutes → balance hits ${walletThreshold} threshold → card auto-charges ${walletReloadAmount} → calls continue uninterrupted</p>
              </div>
            </div>
          </div>
        )}

        {/* Save */}
        <div className="flex items-center justify-end gap-3 mt-6">
          {saved && (
            <div className="flex items-center gap-2 text-sm text-emerald-400">
              <CheckCircle size={16} /> Saved
            </div>
          )}
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
