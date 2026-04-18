'use client'

// ── AgencyNavSection ──────────────────────────────────────────
// Add this component inside the existing Sidebar component
// It appears only when the logged-in user has an 'agency' role
// in the agencies table
//
// HOW TO INTEGRATE into existing sidebar:
//
// 1. Import this at the top of your sidebar file:
//    import { AgencyNavSection } from '@/components/agency/AgencyNavSection'
//
// 2. Add it inside the sidebar nav, after the main nav items:
//    <AgencyNavSection />
//
// The component self-checks if the user is an agency — no prop needed

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Building2, Users, LayoutDashboard, Receipt,
  ChevronRight, Sparkles, Copy
} from 'lucide-react'

const AGENCY_NAV = [
  { href: '/agency/dashboard', label: 'Client accounts', icon: Users },
  { href: '/agency/snapshots', label: 'Snapshots', icon: Copy },
  { href: '/agency/billing', label: 'Agency billing', icon: Receipt },
]

export function AgencyNavSection() {
  const supabase = createClient()
  const pathname = usePathname()
  const [isAgency, setIsAgency] = useState(false)
  const [agencyName, setAgencyName] = useState('')
  const [clientCount, setClientCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    checkAgencyStatus()
  }, [])

  async function checkAgencyStatus() {
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
        setAgencyName(agency.name)

        const { data: subs } = await supabase
          .from('sub_accounts')
          .select('id')
          .eq('agency_id', agency.id)
          .eq('status', 'active')
          .limit(50)

        setClientCount(subs?.length || 0)
      }
    } catch (err) {
      // Not an agency — that's fine
    } finally {
      setLoading(false)
    }
  }

  if (loading || !isAgency) return null

  return (
    <div className="mt-4 pt-4 border-t border-zinc-800">
      {/* Section header */}
      <div className="flex items-center gap-2 px-3 mb-2">
        <div className="flex items-center gap-1.5">
          <Building2 size={12} className="text-indigo-400" />
          <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">
            White-label
          </span>
        </div>
        {clientCount > 0 && (
          <span className="ml-auto text-xs bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 px-1.5 py-0.5 rounded-full font-medium">
            {clientCount}
          </span>
        )}
      </div>

      {/* Agency nav items */}
      <nav className="space-y-0.5">
        {AGENCY_NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                active
                  ? 'bg-indigo-600/20 text-indigo-300 font-medium'
                  : 'text-zinc-400 hover:text-zinc-300 hover:bg-zinc-800/60'
              }`}
            >
              <Icon size={16} className={active ? 'text-indigo-400' : 'text-zinc-500'} />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Quick link to add client */}
      <Link
        href="/agency/sub-accounts/new"
        className="flex items-center gap-2 mx-3 mt-2 px-3 py-1.5 text-xs text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 rounded-lg transition-colors border border-dashed border-indigo-500/30 hover:border-indigo-500/50"
      >
        <Sparkles size={12} />
        Add client account
        <ChevronRight size={10} className="ml-auto" />
      </Link>
    </div>
  )
}
