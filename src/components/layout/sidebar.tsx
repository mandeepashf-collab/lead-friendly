'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { AccountSwitcher } from '@/components/layout/AccountSwitcher'
import { OrgLogo } from '@/components/OrgLogo'
import { useBrand } from '@/contexts/BrandContext'
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
  BarChart3,
  Megaphone,
} from 'lucide-react'

interface NavItem {
  name: string
  href: string
  icon: any
  matchPaths?: string[]
}

const mainNav: NavItem[] = [
  { name: 'Launchpad', href: '/launchpad', icon: Rocket },
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Contacts', href: '/people', icon: Users, matchPaths: ['/people', '/communications'] },
  { name: 'Pipeline', href: '/opportunities', icon: Target, matchPaths: ['/opportunities'] },
  { name: 'AI Agents', href: '/ai-agents', icon: Bot },
  { name: 'Automations', href: '/automations', icon: Zap },
  { name: 'Campaigns', href: '/campaigns', icon: Megaphone },
  { name: 'Calendar', href: '/calendar', icon: Calendar },
  { name: 'Billing', href: '/billing', icon: CreditCard, matchPaths: ['/billing', '/payments'] },
  { name: 'Business', href: '/business', icon: Building2, matchPaths: ['/business', '/branding', '/reputation', '/reporting', '/templates'] },
  { name: 'Settings', href: '/settings', icon: Settings },
]

const agencyNav: NavItem[] = [
  { name: 'Client accounts', href: '/agency/dashboard', icon: Building },
  { name: 'Snapshots', href: '/agency/snapshots', icon: Copy },
  { name: 'Agency billing', href: '/agency/billing', icon: FileText },
]

export function Sidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const { isAgencyAdmin } = useBrand()

  const isActive = (item: NavItem) => {
    if (item.matchPaths) {
      return item.matchPaths.some((p) => pathname === p || pathname.startsWith(p + '/'))
    }
    return pathname === item.href || pathname.startsWith(item.href + '/')
  }

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-50 flex h-screen flex-col border-r border-zinc-800 bg-zinc-950 transition-all duration-200',
        collapsed ? 'w-16' : 'w-64'
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
          <ChevronLeft
            className={cn('h-4 w-4 transition-transform', collapsed && 'rotate-180')}
          />
        </button>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
        {mainNav.map((item) => {
          const active = isActive(item)

          if (collapsed) {
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'flex h-9 w-full items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-800/60 hover:text-white',
                  active && 'bg-indigo-600/10 text-indigo-400'
                )}
                title={item.name}
              >
                <item.icon className="h-[18px] w-[18px]" />
              </Link>
            )
          }

          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex h-9 items-center gap-3 rounded-lg px-3 text-sm font-medium text-zinc-400 transition-colors hover:bg-zinc-800/60 hover:text-white',
                active && 'bg-indigo-600/10 text-indigo-400'
              )}
            >
              <item.icon className="h-[18px] w-[18px] shrink-0" />
              <span>{item.name}</span>
            </Link>
          )
        })}

        {isAgencyAdmin && (
          <div className="mt-6 pt-4 border-t border-zinc-800">
            <div className="flex items-center gap-2 px-3 mb-2">
              {!collapsed && (
                <>
                  <Building className="h-3.5 w-3.5 text-indigo-400" />
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-400">
                    White-Label
                  </span>
                  <span className="ml-auto flex h-4 min-w-[16px] items-center justify-center rounded-full bg-indigo-600/20 px-1.5 text-[10px] font-medium text-indigo-400">
                    2
                  </span>
                </>
              )}
            </div>

            {agencyNav.map((item) => {
              const active = isActive(item)

              if (collapsed) {
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex h-9 w-full items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-800/60 hover:text-white',
                      active && 'bg-indigo-600/10 text-indigo-400'
                    )}
                    title={item.name}
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
                    'flex h-8 items-center gap-3 rounded-lg px-3 text-sm text-zinc-500 transition-colors hover:bg-zinc-800/60 hover:text-zinc-300',
                    active && 'bg-indigo-600/10 text-indigo-400 font-medium'
                  )}
                >
                  <item.icon className="h-[18px] w-[18px] shrink-0" />
                  <span>{item.name}</span>
                </Link>
              )
            })}

            {!collapsed && (
              <Link
                href="/agency/new"
                className="mt-1 flex h-8 items-center gap-2 rounded-lg border border-dashed border-zinc-800 px-3 text-[13px] text-indigo-400 transition-colors hover:border-indigo-600/40 hover:bg-indigo-600/5"
              >
                <Zap className="h-3.5 w-3.5" />
                <span>Add client account</span>
                <ChevronDown className="ml-auto h-3 w-3 -rotate-90" />
              </Link>
            )}
          </div>
        )}
      </nav>

      <div className="border-t border-zinc-800 p-3">
        {collapsed ? (
          <div className="flex items-center justify-center">
            <Zap className="h-4 w-4 text-indigo-400" />
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-400">AI Minutes</span>
              <span className="font-medium text-zinc-300">0 / 500</span>
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-zinc-800">
              <div className="h-full w-0 rounded-full bg-indigo-600 transition-all" />
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}

export default Sidebar
