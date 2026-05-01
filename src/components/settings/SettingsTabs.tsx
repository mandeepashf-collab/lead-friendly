'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import {
  Building2,
  Users,
  Zap,
  Tag,
  Shield,
  ShieldCheck,
  Palette,
  CreditCard,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────────────────────
// SettingsTabs — unified tab strip used by /settings, /settings/compliance,
// and /settings/branding. Without this, navigating between tabs from
// /settings/compliance silently failed because the buttons there could only
// mutate state on /settings itself.
//
// Tabs that live as panels inside /settings (Organization, Team, Automations,
// Tags, Security) are reached via `/settings?tab=<id>`. The page reads the
// query param and renders the matching panel.
//
// Compliance and Branding are full routes; clicking those tabs goes to
// /settings/compliance or /settings/branding directly.
//
// The active-tab indicator is computed from the current pathname + ?tab=
// query param, so it always reflects where the user actually is.
// ─────────────────────────────────────────────────────────────────────────────

interface PanelTab {
  id: 'organization' | 'team' | 'automations' | 'tags' | 'security'
  label: string
  icon: LucideIcon
}

const PANEL_TABS: PanelTab[] = [
  { id: 'organization', label: 'Organization', icon: Building2 },
  { id: 'team', label: 'Team', icon: Users },
  { id: 'automations', label: 'Automations', icon: Zap },
  { id: 'tags', label: 'Tags', icon: Tag },
  { id: 'security', label: 'Security', icon: Shield },
]

const ROUTE_TABS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: '/settings/billing', label: 'Billing', icon: CreditCard },
  { href: '/settings/compliance', label: 'Compliance', icon: ShieldCheck },
  { href: '/settings/branding', label: 'Branding', icon: Palette },
]

const ACTIVE_CLASSES = 'border-indigo-500 text-white'
const IDLE_CLASSES = 'border-transparent text-zinc-500 hover:text-zinc-300'
const BASE_CLASSES =
  'flex items-center gap-2 px-4 pb-3 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap flex-shrink-0'

export function SettingsTabs() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Active panel is determined by ?tab=<id> on /settings, defaulting to
  // organization when no query is present. On compliance/branding routes,
  // there's no active panel — those routes match via pathname instead.
  const activeTabParam = searchParams.get('tab')
  const isOnSettingsRoot = pathname === '/settings'
  const activePanelId: PanelTab['id'] | null = isOnSettingsRoot
    ? ((PANEL_TABS.find((t) => t.id === activeTabParam)?.id ?? 'organization'))
    : null

  return (
    <div className="border-b border-zinc-800 -mx-2 px-2 overflow-x-auto scrollbar-none">
      <div className="flex gap-1 min-w-max">
        {PANEL_TABS.map(({ id, label, icon: Icon }) => {
          const active = activePanelId === id
          // Organization is the default — no query param needed when linking to it
          const href = id === 'organization' ? '/settings' : `/settings?tab=${id}`
          return (
            <Link
              key={id}
              href={href}
              className={cn(BASE_CLASSES, active ? ACTIVE_CLASSES : IDLE_CLASSES)}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          )
        })}
        {ROUTE_TABS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={cn(BASE_CLASSES, active ? ACTIVE_CLASSES : IDLE_CLASSES)}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
