'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Palette, Upload, Save, Loader2, RotateCcw, CheckCircle2, AlertCircle,
  Globe, Eye, Type, ShieldCheck,
} from 'lucide-react'
import { useBrand } from '@/contexts/BrandContext'
import {
  DEFAULT_BRAND,
  APPROVED_FONTS,
  type OrgBrand,
  type UpdateOrgBrandInput,
} from '@/lib/schemas/stage3'
import { BrandingPreview } from './BrandingPreview'
import CustomDomainManager from '@/components/agency/CustomDomainManager'
import { BrandPreviewToggle } from '@/components/branding/BrandPreviewToggle'
import {
  BRANDING_UPLOAD_ACCEPT_ATTR,
  BRANDING_UPLOAD_MAX_LABEL,
  validateBrandingUpload,
} from '@/lib/branding/upload-constraints'

interface Props {
  orgId: string
  initialBrand: OrgBrand
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function diffBrand(current: OrgBrand, original: OrgBrand): UpdateOrgBrandInput {
  const patch: UpdateOrgBrandInput = {}
  const keys: Array<keyof OrgBrand> = [
    'portalName', 'primaryLogoUrl', 'faviconUrl',
    'primaryColor', 'secondaryColor', 'accentColor',
    'backgroundColor', 'textColor', 'sidebarColor',
    'headingFont', 'bodyFont',
    'supportEmail', 'supportPhone', 'footerText',
    'customCss', 'hidePlatformBranding', 'customDomain',
  ]
  for (const k of keys) {
    if (current[k] !== original[k]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(patch as any)[k] = current[k]
    }
  }
  return patch
}

// ────────────────────────────────────────────────────────────────────────────
// Tiny presentational helpers (match /settings style — zinc dark theme)
// ────────────────────────────────────────────────────────────────────────────

function Section({
  title, description, icon: Icon, children,
}: {
  title: string
  description?: string
  icon?: React.ElementType
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6">
      <div className="mb-4 flex items-start gap-3">
        {Icon && (
          <div className="mt-0.5 rounded-lg bg-zinc-800/60 p-2">
            <Icon className="h-4 w-4 text-zinc-400" />
          </div>
        )}
        <div>
          <h2 className="text-sm font-semibold text-zinc-200">{title}</h2>
          {description && (
            <p className="mt-1 text-xs text-zinc-500">{description}</p>
          )}
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  )
}

function TextField({
  label, value, onChange, placeholder, hint,
}: {
  label: string
  value: string | null
  onChange: (v: string) => void
  placeholder?: string
  hint?: string
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-zinc-300">{label}</label>
      <input
        type="text"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
      />
      {hint && <p className="text-xs text-zinc-600">{hint}</p>}
    </div>
  )
}

function ColorField({
  label, value, onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-zinc-300">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-12 cursor-pointer rounded-lg border border-zinc-800 bg-zinc-900"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#6366f1"
          className="h-10 flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 font-mono text-sm text-zinc-200 focus:border-indigo-500 focus:outline-none"
        />
      </div>
    </div>
  )
}

function FontField({
  label, value, onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-zinc-300">{label}</label>
      <select
        value={APPROVED_FONTS.includes(value as never) ? value : 'Inter'}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full cursor-pointer appearance-none rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-200 focus:border-indigo-500 focus:outline-none"
        style={{
          backgroundImage:
            'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'16\' height=\'16\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%2371717a\' stroke-width=\'2\'><path d=\'m6 9 6 6 6-6\'/></svg>")',
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 10px center',
          paddingRight: '32px',
        }}
      >
        {APPROVED_FONTS.map((f) => (
          <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
        ))}
      </select>
    </div>
  )
}

function Toggle({
  label, description, value, onChange,
}: {
  label: string
  description?: string
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1">
        <div className="text-sm font-medium text-zinc-200">{label}</div>
        {description && <p className="mt-0.5 text-xs text-zinc-500">{description}</p>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer items-center rounded-full border transition-colors ${
          value
            ? 'border-indigo-500 bg-indigo-600'
            : 'border-zinc-700 bg-zinc-800'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            value ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Logo uploader
// ────────────────────────────────────────────────────────────────────────────

function LogoUploader({
  orgId, label, kind, currentUrl, onUploaded,
}: {
  orgId: string
  label: string
  kind: 'logo' | 'favicon'
  currentUrl: string | null
  onUploaded: (url: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function handleUpload(file: File) {
    setErr(null)
    const validationErr = validateBrandingUpload(file)
    if (validationErr) {
      setErr(validationErr)
      return
    }
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('kind', kind)
      const res = await fetch(`/api/org/${orgId}/brand/upload`, {
        method: 'POST',
        body: form,
        credentials: 'include',
      })
      if (!res.ok) {
        // Try JSON first, fall back to text. Vercel/edge can return plain-text
        // errors (e.g. "Request Entity Too Large" for 413) that aren't valid JSON.
        let message: string
        try {
          const json = await res.clone().json()
          message = json.error || json.message || `Upload failed (HTTP ${res.status})`
        } catch {
          if (res.status === 413) {
            message = `Logo too large. Max upload size is ${BRANDING_UPLOAD_MAX_LABEL}.`
          } else {
            const text = await res.text()
            const preview = text.trim().slice(0, 120)
            message = preview || `Upload failed (HTTP ${res.status})`
          }
        }
        throw new Error(message)
      }
      const json = await res.json()
      onUploaded(json.url)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'upload_failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-zinc-300">{label}</label>
      <div className="flex items-center gap-3">
        <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900">
          {currentUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={currentUrl} alt="" className="h-full w-full object-contain" />
          ) : (
            <Upload className="h-5 w-5 text-zinc-600" />
          )}
        </div>
        <div className="flex-1">
          <input
            ref={inputRef}
            type="file"
            accept={BRANDING_UPLOAD_ACCEPT_ATTR}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleUpload(f)
            }}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {currentUrl ? 'Replace' : 'Upload'}
          </button>
          {currentUrl && (
            <button
              type="button"
              onClick={() => onUploaded('')}
              className="ml-2 text-xs text-zinc-500 hover:text-zinc-300"
            >
              Clear
            </button>
          )}
          <p className="mt-1 text-xs text-zinc-600">
            {kind === 'logo'
              ? `PNG, JPG, GIF, WebP, or SVG — max ${BRANDING_UPLOAD_MAX_LABEL}`
              : `PNG, ICO, GIF, or SVG — max ${BRANDING_UPLOAD_MAX_LABEL}`}
          </p>
          {err && <p className="mt-1 text-xs text-rose-400">{err}</p>}
        </div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────────

export function BrandingClient({ orgId, initialBrand }: Props) {
  const [brand, setBrand] = useState<OrgBrand>(initialBrand)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [saveErr, setSaveErr] = useState<string | null>(null)
  const { refresh: refreshGlobalBrand } = useBrand()

  const update = useCallback(<K extends keyof OrgBrand>(k: K, v: OrgBrand[K]) => {
    setBrand((b) => ({ ...b, [k]: v }))
    setSaveState('idle')
  }, [])

  const dirty = JSON.stringify(brand) !== JSON.stringify(initialBrand)

  async function handleSave() {
    setSaveState('saving')
    setSaveErr(null)
    try {
      const patch = diffBrand(brand, initialBrand)
      if (Object.keys(patch).length === 0) {
        setSaveState('saved')
        return
      }
      const res = await fetch(`/api/org/${orgId}/brand`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
        credentials: 'include',
      })
      if (!res.ok) {
        // Try JSON first, fall back to text. Same pattern as the upload path
        // (Stage 3.3.5) — Vercel/edge can return plain-text bodies for 413,
        // 504, or HTML for some 5xx, none of which parse as JSON.
        let message: string
        try {
          const json = await res.clone().json()
          message = json.error || json.message || `Save failed (HTTP ${res.status})`
        } catch {
          if (res.status === 413) {
            message = 'Save payload too large. Try removing recent changes and saving in smaller chunks.'
          } else if (res.status >= 500) {
            message = `Server error (HTTP ${res.status}). Try again in a moment.`
          } else {
            const text = await res.text()
            const preview = text.trim().slice(0, 120)
            message = preview || `Save failed (HTTP ${res.status})`
          }
        }
        throw new Error(message)
      }
      const json = await res.json()
      setBrand(json as OrgBrand)
      refreshGlobalBrand()
      setSaveState('saved')
    } catch (e) {
      setSaveState('error')
      setSaveErr(e instanceof Error ? e.message : 'save_failed')
    }
  }

  function handleReset() {
    setBrand({ ...DEFAULT_BRAND, customDomain: brand.customDomain, domainStatus: brand.domainStatus })
    setSaveState('idle')
  }

  // Auto-clear "Saved" after 3s
  useEffect(() => {
    if (saveState !== 'saved') return
    const t = setTimeout(() => setSaveState('idle'), 3000)
    return () => clearTimeout(t)
  }, [saveState])

  return (
    <div className="mx-auto max-w-7xl p-6">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100">Branding</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Customize your portal&apos;s look, domain, and support info. Changes apply to everyone in your organization.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {saveState === 'saved' && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" /> Saved
            </span>
          )}
          {saveState === 'error' && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-xs font-medium text-rose-400" title={saveErr ?? undefined}>
              <AlertCircle className="h-3.5 w-3.5" /> {saveErr ?? 'Save failed'}
            </span>
          )}
          <BrandPreviewToggle />
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
          >
            <RotateCcw className="h-4 w-4" /> Reset
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || saveState === 'saving'}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saveState === 'saving' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save changes
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_480px]">
        {/* Form column */}
        <div className="space-y-6">
          <Section title="Identity" description="How your portal introduces itself." icon={Palette}>
            <TextField
              label="Portal name"
              value={brand.portalName}
              onChange={(v) => update('portalName', v)}
              placeholder="Lead Friendly"
              hint="Shown in browser tab, sidebar, emails, and the agent's voice intro."
            />
            <div className="grid grid-cols-2 gap-4">
              <LogoUploader
                orgId={orgId}
                label="Logo"
                kind="logo"
                currentUrl={brand.primaryLogoUrl}
                onUploaded={(url) => update('primaryLogoUrl', url || null)}
              />
              <LogoUploader
                orgId={orgId}
                label="Favicon"
                kind="favicon"
                currentUrl={brand.faviconUrl}
                onUploaded={(url) => update('faviconUrl', url || null)}
              />
            </div>
          </Section>

          <Section title="Colors" description="Used across buttons, links, accents." icon={Palette}>
            <div className="grid grid-cols-2 gap-4">
              <ColorField label="Primary" value={brand.primaryColor} onChange={(v) => update('primaryColor', v)} />
              <ColorField label="Secondary" value={brand.secondaryColor} onChange={(v) => update('secondaryColor', v)} />
              <ColorField label="Accent" value={brand.accentColor} onChange={(v) => update('accentColor', v)} />
              <ColorField label="Background" value={brand.backgroundColor} onChange={(v) => update('backgroundColor', v)} />
              <ColorField label="Text" value={brand.textColor} onChange={(v) => update('textColor', v)} />
              <ColorField label="Sidebar" value={brand.sidebarColor} onChange={(v) => update('sidebarColor', v)} />
            </div>
          </Section>

          <Section title="Typography" icon={Type}>
            <div className="grid grid-cols-2 gap-4">
              <FontField label="Heading font" value={brand.headingFont} onChange={(v) => update('headingFont', v)} />
              <FontField label="Body font" value={brand.bodyFont} onChange={(v) => update('bodyFont', v)} />
            </div>
          </Section>

          <Section title="Support" description="Shown in footer and help menus." icon={ShieldCheck}>
            <TextField
              label="Support email"
              value={brand.supportEmail}
              onChange={(v) => update('supportEmail', v || null)}
              placeholder="support@yourbrand.com"
            />
            <TextField
              label="Support phone"
              value={brand.supportPhone}
              onChange={(v) => update('supportPhone', v || null)}
              placeholder="+1 555 0123"
            />
            <TextField
              label="Footer text"
              value={brand.footerText}
              onChange={(v) => update('footerText', v || null)}
              placeholder="© Your Brand — All rights reserved"
            />
          </Section>

          <Section title="Custom domain" description="Buy a new domain or connect one you already own. DNS verification + SSL handled automatically." icon={Globe}>
            <CustomDomainManager />
          </Section>

          <Section title="Advanced" icon={Palette}>
            <Toggle
              label="Hide platform branding"
              description='Removes the "Powered by Lead Friendly" footer everywhere.'
              value={brand.hidePlatformBranding}
              onChange={(v) => update('hidePlatformBranding', v)}
            />
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-zinc-400">Custom CSS <span className="ml-1 rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-500">coming soon</span></label>
              <textarea
                disabled
                value={brand.customCss ?? ''}
                placeholder="Custom CSS is not yet rendered. Saved values are preserved; UI rendering unlocks in a follow-up."
                className="h-20 w-full cursor-not-allowed rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 font-mono text-xs text-zinc-500"
              />
            </div>
          </Section>
        </div>

        {/* Preview column */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
            <Eye className="h-3.5 w-3.5" /> Live preview
          </div>
          <BrandingPreview brand={brand} />
        </div>
      </div>
    </div>
  )
}
