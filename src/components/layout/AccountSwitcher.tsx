'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { ChevronDown, Sparkles, Plus, ArrowLeft } from 'lucide-react'
import { useBrand } from '@/contexts/BrandContext'
import Link from 'next/link'

interface SubAccount {
  id: string
  company_name: string
  name: string
  primary_color: string | null
  logo_url: string | null
  status: string
}

export function AccountSwitcher() {
  const supabase = createClient()
  const router = useRouter()
  const brand = useBrand()
  const [open, setOpen] = useState(false)
  const [isAgency, setIsAgency] = useState(false)
  const [agencyId, setAgencyId] = useState<string | null>(null)
  const [subAccounts, setSubAccounts] = useState<SubAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [switching, setSwitching] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadAgencyData()
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

      const { data: agency } = await supabase
        .from('agencies')
        .select('id, name, status')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single()

      if (agency) {
        setIsAgency(true)
        setAgencyId(agency.id)

        const { data: accounts } = await supabase
          .from('sub_accounts')
          .select('id, company_name, name, primary_color, logo_url, status')
          .eq('agency_id', agency.id)
          .order('company_name')

        setSubAccounts(accounts || [])
      }
    } catch {
      // Not an agency
    } finally {
      setLoading(false)
    }
  }

  async function switchToAccount(subAccountId: string) {
    setSwitching(subAccountId)
    try {
      const res = await fetch('/api/agency/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sub_account_id: subAccountId }),
      })
      const data = await res.json()
      if (data.token) {
        // Set cookies client-side
        const maxAge = 7200 // 2 hours
        document.cookie = `impersonation_token=${data.token};path=/;max-age=${maxAge};samesite=lax`
        document.cookie = `impersonation_sub_account=${subAccountId};path=/;max-age=${maxAge};samesite=lax`
        setOpen(false)
        // Full page reload to pick up new brand context
        window.location.href = '/dashboard'
      }
    } catch (err) {
      console.error('Switch failed:', err)
    } finally {
      setSwitching(null)
    }
  }

  async function switchBack() {
    setSwitching('back')
    try {
      await fetch('/api/agency/impersonate', { method: 'DELETE' })
      // Clear cookies client-side too
      document.cookie = 'impersonation_token=;path=/;max-age=0'
      document.cookie = 'impersonation_sub_account=;path=/;max-age=0'
      setOpen(false)
      window.location.href = '/dashboard'
    } catch (err) {
      console.error('Switch back failed:', err)
    } finally {
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
          {/* Back to Lead Friendly (when impersonating) */}
          {brand.isImpersonating && (
            <>
              <button
                onClick={switchBack}
                disabled={switching === 'back'}
                className="flex w-full items-center gap-2.5 px-4 py-3 text-sm text-indigo-400 hover:bg-zinc-800/60 transition-colors disabled:opacity-50"
              >
                <ArrowLeft className="h-4 w-4" />
                {switching === 'back' ? 'Switching...' : 'Back to Lead Friendly'}
              </button>
              <div className="border-t border-zinc-800" />
            </>
          )}

          {/* Lead Friendly (Admin) */}
          <div className="px-4 py-3 flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600">
              <Sparkles className="h-3.5 w-3.5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">Lead Friendly</p>
              <p className="text-[10px] text-zinc-500">Admin</p>
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
              const displayName = account.company_name || account.name
              const isActive = brand.isImpersonating && brand.impersonatingSubAccountId === account.id
              const statusColor = account.status === 'active' ? 'bg-emerald-500' : 'bg-red-500'

              return (
                <button
                  key={account.id}
                  onClick={() => !isActive && switchToAccount(account.id)}
                  disabled={switching === account.id || isActive}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-sm hover:bg-zinc-800/60 transition-colors disabled:opacity-70"
                >
                  {/* Initials or logo */}
                  {account.logo_url ? (
                    <img src={account.logo_url} alt="" className="h-7 w-7 rounded-lg object-cover border border-zinc-700" />
                  ) : (
                    <div
                      className="h-7 w-7 rounded-lg flex items-center justify-center text-[11px] font-semibold"
                      style={{
                        backgroundColor: (account.primary_color || '#6366f1') + '22',
                        color: account.primary_color || '#6366f1',
                      }}
                    >
                      {displayName[0]?.toUpperCase() || 'C'}
                    </div>
                  )}
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-sm text-zinc-300 truncate">{displayName}</p>
                    <div className="flex items-center gap-1.5">
                      <span className={`h-1.5 w-1.5 rounded-full ${statusColor}`} />
                      <span className="text-[10px] text-zinc-500">{account.status}</span>
                    </div>
                  </div>
                  {isActive && (
                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                  )}
                  {switching === account.id && (
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
