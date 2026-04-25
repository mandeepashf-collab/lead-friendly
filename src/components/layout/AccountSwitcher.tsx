'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ChevronDown, Sparkles, Plus, ArrowLeft } from 'lucide-react'
import { useBrand } from '@/contexts/BrandContext'
import Link from 'next/link'
import type { AgencyClientRow } from '@/lib/schemas/stage3'

// ── AccountSwitcher ───────────────────────────────────────────────────────
// Stage 3.3 rewrite: dropdown in the sidebar showing the agency's sub-accounts
// and an "impersonate" entry per row. Source of truth is the agency_clients_v
// view (which inherits RLS from organizations and only returns rows the agency
// admin is authorized to see).
//
// Schema migration notes vs. pre-Stage-3.1 version:
//   - Old: queried `agencies` (dropped) and `sub_accounts` (dropped)
//   - New: queries `agency_clients_v` view + checks own org has is_agency=true
//   - Cookie set/clear: now done server-side via /api/agency/impersonate
//     POST/DELETE responses (httpOnly). This component just initiates the
//     request and reloads; it never touches document.cookie.

interface SubAccount {
  organization_id: string
  name: string
  is_active: boolean
  // legacy fields used by the dropdown UI; populated from the row directly
  primary_color: string | null
  logo_url: string | null
}

export function AccountSwitcher() {
  const supabase = createClient()
  const brand = useBrand()
  const [open, setOpen] = useState(false)
  const [isAgency, setIsAgency] = useState(false)
  const [subAccounts, setSubAccounts] = useState<SubAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [switching, setSwitching] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadAgencyData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function loadAgencyData() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Step 1: am I a member of an is_agency=true org?
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', user.id)
        .maybeSingle()

      if (!profile?.organization_id) return

      const { data: org } = await supabase
        .from('organizations')
        .select('id, is_agency')
        .eq('id', profile.organization_id)
        .maybeSingle()

      if (!org?.is_agency) return

      setIsAgency(true)

      // Step 2: load my children from the agency_clients_v view
      const { data: rows } = await supabase
        .from('agency_clients_v')
        .select<string, AgencyClientRow>(
          'organization_id, name, is_active, custom_domain, plan',
        )
        .eq('parent_organization_id', org.id)
        .order('name', { ascending: true })

      // The view doesn't carry primary_color/logo_url since organizations
      // already has those — we'd need a join to surface them. For v1 the
      // dropdown shows initials/text only; we'll add per-row branding later.
      setSubAccounts(
        (rows ?? []).map((r) => ({
          organization_id: r.organization_id,
          name: r.name,
          is_active: r.is_active,
          primary_color: null,
          logo_url: null,
        })),
      )
    } catch (e) {
      // Fail closed: not an agency, hide the switcher.
      console.warn('[AccountSwitcher] load failed:', e)
    } finally {
      setLoading(false)
    }
  }

  async function switchToAccount(subOrgId: string) {
    setSwitching(subOrgId)
    try {
      const res = await fetch('/api/agency/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sub_organization_id: subOrgId }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `start_impersonation ${res.status}`)
      }
      setOpen(false)
      // Full page reload so root layout re-resolves the brand from the new
      // middleware-injected impersonation headers. The cookie was set by
      // the route handler (httpOnly).
      window.location.href = '/dashboard'
    } catch (err) {
      console.error('Switch failed:', err)
      setSwitching(null)
    }
    // Note: we don't clear `switching` on success — the page is reloading.
  }

  async function switchBack() {
    setSwitching('back')
    try {
      await fetch('/api/agency/impersonate', { method: 'DELETE' })
      setOpen(false)
      window.location.href = '/agency/dashboard'
    } catch (err) {
      console.error('Switch back failed:', err)
      setSwitching(null)
    }
  }

  // Non-agency user: plain logo, no switcher
  if (loading || !isAgency) {
    return (
      <Link href="/dashboard" className="flex items-center gap-2">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ backgroundColor: brand.brandColor }}
        >
          {brand.brandLogo ? (
            <img src={brand.brandLogo} alt="" className="h-5 w-5 rounded object-cover" />
          ) : (
            <Sparkles className="h-4 w-4 text-white" />
          )}
        </div>
        <span className="text-lg font-bold text-white">{brand.brandName}</span>
      </Link>
    )
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Switcher trigger */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-lg hover:bg-zinc-800/50 transition-colors px-1 py-0.5 -mx-1"
      >
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ backgroundColor: brand.brandColor }}
        >
          {brand.brandLogo ? (
            <img src={brand.brandLogo} alt="" className="h-5 w-5 rounded object-cover" />
          ) : (
            <Sparkles className="h-4 w-4 text-white" />
          )}
        </div>
        <span className="text-lg font-bold text-white">{brand.brandName}</span>
        {/* Amber pulsing dot when impersonating */}
        {brand.isImpersonating && (
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
          </span>
        )}
        <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 top-full mt-2 w-64 rounded-xl border border-zinc-800 bg-zinc-900 shadow-xl z-50 overflow-hidden">
          {/* Back to your agency (when impersonating) */}
          {brand.isImpersonating && (
            <>
              <button
                onClick={switchBack}
                disabled={switching === 'back'}
                className="flex w-full items-center gap-2.5 px-4 py-3 text-sm text-indigo-400 hover:bg-zinc-800/60 transition-colors disabled:opacity-50"
              >
                <ArrowLeft className="h-4 w-4" />
                {switching === 'back' ? 'Switching...' : 'Back to your agency'}
              </button>
              <div className="border-t border-zinc-800" />
            </>
          )}

          {/* Agency self-row */}
          <div className="px-4 py-3 flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600">
              <Sparkles className="h-3.5 w-3.5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">Your agency</p>
              <p className="text-[10px] text-zinc-500">Admin view</p>
            </div>
            {!brand.isImpersonating && (
              <span className="h-2 w-2 rounded-full bg-indigo-500" />
            )}
          </div>

          <div className="border-t border-zinc-800" />

          {/* Client accounts section */}
          <div className="px-4 pt-2.5 pb-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Client Accounts
            </p>
          </div>

          <div className="max-h-48 overflow-y-auto">
            {subAccounts.map((account) => {
              const displayName = account.name
              const isActive =
                brand.isImpersonating &&
                brand.impersonatingSubAccountId === account.organization_id
              const statusColor = account.is_active ? 'bg-emerald-500' : 'bg-red-500'
              const statusLabel = account.is_active ? 'active' : 'suspended'

              return (
                <button
                  key={account.organization_id}
                  onClick={() => !isActive && switchToAccount(account.organization_id)}
                  disabled={switching === account.organization_id || isActive || !account.is_active}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-sm hover:bg-zinc-800/60 transition-colors disabled:opacity-70"
                  title={!account.is_active ? 'Suspended sub-accounts cannot be impersonated' : undefined}
                >
                  {/* Initials */}
                  <div
                    className="h-7 w-7 rounded-lg flex items-center justify-center text-[11px] font-semibold bg-indigo-500/20 text-indigo-300"
                  >
                    {displayName[0]?.toUpperCase() || 'C'}
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-sm text-zinc-300 truncate">{displayName}</p>
                    <div className="flex items-center gap-1.5">
                      <span className={`h-1.5 w-1.5 rounded-full ${statusColor}`} />
                      <span className="text-[10px] text-zinc-500">{statusLabel}</span>
                    </div>
                  </div>
                  {isActive && (
                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                  )}
                  {switching === account.organization_id && (
                    <span className="text-[10px] text-zinc-500">Switching...</span>
                  )}
                </button>
              )
            })}

            {subAccounts.length === 0 && (
              <p className="px-4 py-3 text-xs text-zinc-600">No client accounts yet</p>
            )}
          </div>

          <div className="border-t border-zinc-800" />

          {/* Add client account */}
          <Link
            href="/agency/sub-accounts/new"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-3 text-sm text-zinc-400 hover:text-zinc-300 hover:bg-zinc-800/60 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add client account
          </Link>
        </div>
      )}
    </div>
  )
}
