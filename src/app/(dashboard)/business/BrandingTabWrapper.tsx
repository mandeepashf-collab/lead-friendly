'use client'

import { useEffect, useState } from 'react'
import { Loader2, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { OrgBrand } from '@/lib/schemas/stage3'
import { BrandingClient } from '../settings/branding/BrandingClient'

// ────────────────────────────────────────────────────────────────────────────
// /business → Branding tab wrapper.
// /business is a "use client" page, so we can't use the server-side hydration
// pattern that /settings/branding/page.tsx uses. This wrapper fetches the
// user's org id + current brand client-side, then mounts the same
// BrandingClient component that powers /settings/branding. Same form, same
// save logic, same CustomDomainManager — exposed at a more discoverable URL.
// ────────────────────────────────────────────────────────────────────────────

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; orgId: string; brand: OrgBrand }
  | { kind: 'error'; message: string }

export function BrandingTabWrapper() {
  const [state, setState] = useState<State>({ kind: 'loading' })

  async function load() {
    setState({ kind: 'loading' })
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setState({ kind: 'error', message: 'Not signed in' })
        return
      }
      const { data: profile, error: pErr } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', user.id)
        .maybeSingle()
      if (pErr || !profile?.organization_id) {
        setState({ kind: 'error', message: 'Could not load your organization' })
        return
      }
      const res = await fetch(`/api/org/${profile.organization_id}/brand`, {
        credentials: 'include',
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setState({
          kind: 'error',
          message: json.error || `Failed to load branding (${res.status})`,
        })
        return
      }
      const brand = (await res.json()) as OrgBrand
      setState({ kind: 'ready', orgId: profile.organization_id, brand })
    } catch (e) {
      setState({
        kind: 'error',
        message: e instanceof Error ? e.message : 'Failed to load branding',
      })
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [])

  if (state.kind === 'loading') {
    return (
      <div className="flex items-center justify-center py-20 text-zinc-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading branding settings…
      </div>
    )
  }

  if (state.kind === 'error') {
    return (
      <div className="mx-auto max-w-3xl rounded-xl border border-rose-500/30 bg-rose-950/20 p-5 flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-rose-400 mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-rose-200">
            Could not load branding
          </p>
          <p className="text-xs text-rose-300/80 mt-1">{state.message}</p>
          <button
            onClick={load}
            className="mt-3 rounded-md bg-rose-500/20 px-3 py-1.5 text-xs font-medium text-rose-200 hover:bg-rose-500/30"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return <BrandingClient orgId={state.orgId} initialBrand={state.brand} />
}
