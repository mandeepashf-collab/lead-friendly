'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { AccountSwitcher } from '@/components/layout/AccountSwitcher'
import { OrgLogo } from '@/components/OrgLogo'
import { useBrand } from '@/contexts/BrandContext'
import { VoiceMinutesMeter } from '@/components/layout/voice-minutes-meter'
import {
  LayoutDashboard,
  Rocket,
  Users,
  Target,
  Bot,
  Calendar,
  CreditCard,
  Building2,
  Settings,
  ChevronLeft,
  Building,
  Copy,
  FileText,
  ChevronDown,
  Zap,
  Megaphone,
  type LucideIcon,
} from 'lucide-react'

interface SidebarItem {
  label: string
  href: string
  icon: LucideIcon
  matchPaths?: string[]
}

interface SidebarSection {
  /** null = no section header (renders as a top item before any section). */
  label: string | null
  items: SidebarItem[]
  /** Section only renders for agency-tier users (isAgencyAdmin === true). */
  agencyOnly?: boolean
}

const sections: SidebarSection[] = [
  {
    label: null,
    items: [{ label: 'Get started', href: '/launchpad', icon: Rocket }],
  },
  {
    label: 'Sales',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
      { label: 'Contacts', href: '/contacts', icon: Users, matchPaths: ['/contacts', '/people'] },
      { label: 'Pipeline', href: '/opportunities', icon: Target, matchPaths: ['/opportunities'] },
      { label: 'Calendar', href: '/calendar', icon: Calendar },
    ],
  },
  {
    label: 'Build',
    items: [
      { label: 'AI agents', href: '/ai-agents', icon: Bot },
      { label: 'Automations', href: '/automations', icon: Zap },
      { label: 'Campaigns', href: '/campaigns', icon: Megaphone },
    ],
  },
  {
    label: 'Account',
    items: [
      { label: 'Billing', href: '/billing', icon: CreditCard, matchPaths: ['/billing', '/payments'] },
      {
        label: 'Business',
        href: '/business',
        icon: Building2,
        matchPaths: ['/business', '/branding', '/reputation', '/reporting', '/templates'],
      },
      { label: 'Settings', href: '/settings', icon: Settings },
    ],
  },
  {
    label: 'White-label',
    agencyOnly: true,
    items: [
      // Pre-launch: Blueprints hidden — `agencies` table doesn't yet exist,
      // so /agency/snapshots loads with a "No agency account found" error.
      // Re-enable once agencies migration ships.
      // { label: 'Blueprints', href: '/agency/snapshots', icon: Copy },
      { label: 'Workspaces', href: '/agency/dashboard', icon: Building },
      { label: 'Partner billing', href: '/agency/billing', icon: FileText },
    ],
  },
]

export function Sidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const { isAgencyAdmin, isBrandPreview, isSubAccount } = useBrand()

  // Hide agency-admin features when:
  //  - Logged-in user is a sub-account user on a white-labeled instance
  //    (they should never see the words "Workspaces", "Partner billing",
  //    or "Business" — that gives away the white-label and leaks our
  //    agency UX into their portal experience).
  //  - An agency admin has opted into brand preview mode to see what
  //    their sub-account customers see.
  const hideAgencyFeatures = isBrandPreview || isSubAccount

  const isActive = (item: SidebarItem) => {
    if (item.matchPaths) {
      return item.matchPaths.some((p) => pathname === p || pathname.startsWith(p + '/'))
    }
    return pathname === item.href || pathname.startsWith(item.href + '/')
  }

  const renderItem = (item: SidebarItem) => {
    const active = isActive(item)
    if (collapsed) {
      return (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            'flex h-9 w-full items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-800/60 hover:text-white',
            active && 'bg-indigo-600/10 text-indigo-400',
          )}
          title={item.label}
        >
          <item.icon className="h-[18px] w-[18px]" />
        </Link>
      )
    }
    return (
      <Link
        key={item.href}
        href={item.href}
        className={cn(
          'flex h-9 items-center gap-3 rounded-lg px-3 text-sm font-medium text-zinc-400 transition-colors hover:bg-zinc-800/60 hover:text-white',
          active && 'bg-indigo-600/10 text-indigo-400',
        )}
      >
        <item.icon className="h-[18px] w-[18px] shrink-0" />
        <span>{item.label}</span>
      </Link>
    )
  }

  const renderSectionLabel = (label: string, isWhiteLabel: boolean) => {
    if (collapsed) return null
    return (
      <div className="flex items-center gap-2 px-3 mb-1.5 mt-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          {label}
        </span>
        {isWhiteLabel && (
          <span className="ml-auto flex h-4 min-w-[16px] items-center justify-center rounded-full bg-indigo-600/20 px-1.5 text-[10px] font-medium text-indigo-400">
            2
          </span>
        )}
      </div>
    )
  }

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-50 flex h-screen flex-col border-r border-zinc-800 bg-zinc-950 transition-all duration-200',
        collapsed ? 'w-16' : 'w-64',
      )}
    >
      <div className="flex h-14 items-center justify-between border-b border-zinc-800 px-3">
        {collapsed ? (
          <Link href="/dashboard" className="flex items-center justify-center">
            <OrgLogo size={32} className="h-8 w-8" />
          </Link>
        ) : (
          <AccountSwitcher />
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="rounded-md p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white"
        >
          <ChevronLeft className={cn('h-4 w-4 transition-transform', collapsed && 'rotate-180')} />
        </button>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
        {sections.map((section, idx) => {
          if (section.agencyOnly && (!isAgencyAdmin || hideAgencyFeatures)) return null
          const isWhiteLabel = section.label === 'White-label'

          return (
            <div key={section.label ?? `top-${idx}`}>
              {section.label && renderSectionLabel(section.label, isWhiteLabel)}
              {section.items
                .filter((item) => !(hideAgencyFeatures && item.href === '/business'))
                .map(renderItem)}

              {isWhiteLabel && !collapsed && (
                <Link
                  href="/agency/sub-accounts/new"
                  className="mt-1 flex h-8 items-center gap-2 rounded-lg border border-dashed border-zinc-800 px-3 text-[13px] text-indigo-400 transition-colors hover:border-indigo-600/40 hover:bg-indigo-600/5"
                >
                  <Zap className="h-3.5 w-3.5" />
                  <span>Add client account</span>
                  <ChevronDown className="ml-auto h-3 w-3 -rotate-90" />
                </Link>
              )}
            </div>
          )
        })}
      </nav>

      <div className="border-t border-zinc-800 p-3">
        {collapsed ? (
          <div className="flex items-center justify-center">
            <Zap className="h-4 w-4 text-indigo-400" />
          </div>
        ) : (
          <VoiceMinutesMeter />
        )}
      </div>
    </aside>
  )
}

export default Sidebar
