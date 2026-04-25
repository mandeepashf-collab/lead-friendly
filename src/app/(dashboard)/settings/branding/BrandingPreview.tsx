'use client'

import { Phone, LayoutDashboard, Users, Bot, BarChart3 } from 'lucide-react'
import type { OrgBrand } from '@/lib/schemas/stage3'

// ────────────────────────────────────────────────────────────────────────────
// Branding preview — mini portal chrome showing how the brand looks live.
// Pure CSS-var driven so it updates in real time as the form changes.
// ────────────────────────────────────────────────────────────────────────────

export function BrandingPreview({ brand }: { brand: OrgBrand }) {
  const fontStack = `'${brand.bodyFont}', system-ui, sans-serif`
  const headingStack = `'${brand.headingFont}', system-ui, sans-serif`

  return (
    <div
      className="overflow-hidden rounded-xl border border-zinc-800 shadow-xl"
      style={{ background: brand.backgroundColor, color: brand.textColor, fontFamily: fontStack }}
    >
      {/* Browser chrome */}
      <div className="flex items-center gap-2 border-b border-zinc-800/50 bg-zinc-950 px-3 py-2">
        <div className="flex gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full bg-rose-500/70" />
          <div className="h-2.5 w-2.5 rounded-full bg-amber-500/70" />
          <div className="h-2.5 w-2.5 rounded-full bg-emerald-500/70" />
        </div>
        <div className="ml-2 flex-1 truncate rounded-md bg-zinc-900 px-2 py-0.5 text-[10px] text-zinc-500">
          {brand.customDomain ? `https://${brand.customDomain}` : 'https://app.leadfriendly.com'}
        </div>
      </div>

      <div className="flex" style={{ minHeight: '320px' }}>
        {/* Sidebar */}
        <div
          className="flex w-40 flex-col gap-1 border-r border-zinc-800/50 p-3"
          style={{ background: brand.sidebarColor }}
        >
          <div className="flex items-center gap-2 pb-3">
            {brand.primaryLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brand.primaryLogoUrl} alt="" className="h-6 w-6 rounded object-contain" />
            ) : (
              <div
                className="flex h-6 w-6 items-center justify-center rounded text-xs font-bold"
                style={{ background: brand.primaryColor, color: '#fff' }}
              >
                {brand.portalName.charAt(0).toUpperCase()}
              </div>
            )}
            <span
              className="truncate text-xs font-semibold"
              style={{ fontFamily: headingStack, color: brand.textColor }}
            >
              {brand.portalName}
            </span>
          </div>
          {[
            { icon: LayoutDashboard, label: 'Dashboard', active: true },
            { icon: Users, label: 'Contacts' },
            { icon: Phone, label: 'Calls' },
            { icon: Bot, label: 'Agents' },
            { icon: BarChart3, label: 'Reports' },
          ].map(({ icon: Icon, label, active }) => (
            <div
              key={label}
              className="flex items-center gap-2 rounded-md px-2 py-1 text-xs"
              style={{
                background: active ? `${brand.primaryColor}1a` : 'transparent',
                color: active ? brand.primaryColor : `${brand.textColor}99`,
              }}
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </div>
          ))}
        </div>

        {/* Main pane */}
        <div className="flex-1 p-4" style={{ fontFamily: fontStack }}>
          <h3
            className="text-base font-semibold"
            style={{ fontFamily: headingStack, color: brand.textColor }}
          >
            Welcome back
          </h3>
          <p className="mt-1 text-xs" style={{ color: `${brand.textColor}80` }}>
            Here&apos;s what&apos;s happening today.
          </p>

          <div className="mt-3 flex gap-2">
            <button
              className="rounded-md px-2.5 py-1 text-xs font-medium"
              style={{ background: brand.primaryColor, color: '#fff' }}
            >
              New call
            </button>
            <button
              className="rounded-md border px-2.5 py-1 text-xs font-medium"
              style={{ borderColor: `${brand.textColor}33`, color: brand.textColor }}
            >
              Import contacts
            </button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            {[
              { label: 'Calls today', value: '24', color: brand.primaryColor },
              { label: 'Answer rate', value: '62%', color: brand.accentColor },
              { label: 'Active agents', value: '3', color: brand.secondaryColor },
              { label: 'Bookings', value: '5', color: brand.primaryColor },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-lg border p-2"
                style={{ borderColor: `${brand.textColor}1a`, background: `${brand.textColor}05` }}
              >
                <div className="text-[10px]" style={{ color: `${brand.textColor}80` }}>{stat.label}</div>
                <div
                  className="mt-0.5 text-lg font-semibold"
                  style={{ color: stat.color, fontFamily: headingStack }}
                >
                  {stat.value}
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="mt-4 border-t pt-2" style={{ borderColor: `${brand.textColor}1a` }}>
            <div className="flex items-center justify-between text-[10px]" style={{ color: `${brand.textColor}60` }}>
              <span>{brand.footerText || `© ${new Date().getFullYear()} ${brand.portalName}`}</span>
              {!brand.hidePlatformBranding && (
                <span>Powered by Lead Friendly</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
