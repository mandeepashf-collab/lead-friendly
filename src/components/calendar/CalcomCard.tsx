'use client'

import { useEffect, useState } from 'react'
import { Calendar as CalendarIcon, CheckCircle2, AlertCircle, Loader2, ExternalLink, Eye, EyeOff } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// CalcomCard — Cal.com integration UI on the /calendar page
// ─────────────────────────────────────────────────────────────────────────────
//
// On mount, GETs /api/calendar/calcom to learn whether the org has Cal.com
// connected. If yes, renders a "Connected" pill with the saved Event Type ID
// and a Disconnect button. If no, renders the Connect form (API key + Event
// Type ID) and POSTs to save.
//
// Why on /calendar and not /settings:
//   Per launch plan, Settings was simplified down to org/team/auto/tags/sec.
//   Calendar integration belongs where users think about appointments — on
//   the Calendar page itself.
// ─────────────────────────────────────────────────────────────────────────────

interface CalcomStatus {
  connected: boolean
  eventTypeId: number | null
  connectedAt: string | null
}

export function CalcomCard() {
  const [status, setStatus] = useState<CalcomStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [apiKey, setApiKey] = useState('')
  const [eventTypeId, setEventTypeId] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)

  const refresh = async () => {
    try {
      const res = await fetch('/api/calendar/calcom', { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as CalcomStatus
      setStatus(data)
    } catch (e) {
      // Don't surface fetch errors as user-facing — just leave the card in a
      // "not connected" state. The form will still let them try.
      setStatus({ connected: false, eventTypeId: null, connectedAt: null })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  const handleConnect = async () => {
    setError(null)
    setSaving(true)
    try {
      const res = await fetch('/api/calendar/calcom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: apiKey.trim(), eventTypeId: eventTypeId.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error || 'Failed to connect Cal.com')
        return
      }
      setApiKey('')
      setEventTypeId('')
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 2500)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to connect Cal.com')
    } finally {
      setSaving(false)
    }
  }

  const handleDisconnect = async () => {
    if (!confirm('Disconnect Cal.com? Bookings made by AI agents will stop syncing to your Cal.com account.')) {
      return
    }
    setDisconnecting(true)
    setError(null)
    try {
      const res = await fetch('/api/calendar/calcom', { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error || 'Failed to disconnect')
        return
      }
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to disconnect')
    } finally {
      setDisconnecting(false)
    }
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10">
            <CalendarIcon className="h-4 w-4 text-indigo-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Cal.com</h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              Let AI agents push bookings to your Cal.com calendar — which then syncs to Google, Outlook, or Apple.
            </p>
          </div>
        </div>
        {status?.connected && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-400 shrink-0">
            <CheckCircle2 className="h-3 w-3" /> Connected
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
        </div>
      ) : status?.connected ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm">
            <span className="text-zinc-400">Event Type ID</span>
            <span className="font-mono text-zinc-200">{status.eventTypeId}</span>
          </div>
          {status.connectedAt && (
            <p className="text-xs text-zinc-600">
              Connected {new Date(status.connectedAt).toLocaleDateString()}
            </p>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 disabled:opacity-60"
            >
              {disconnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Disconnect
            </button>
            <a
              href="https://app.cal.com/event-types"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300"
            >
              Manage event types <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-zinc-500">
            Generate an API key in Cal.com under{' '}
            <a
              href="https://app.cal.com/settings/developer/api-keys"
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-400 hover:text-indigo-300 underline-offset-2 hover:underline"
            >
              Settings → Developer → API keys
            </a>
            , then grab your Event Type ID from{' '}
            <a
              href="https://app.cal.com/event-types"
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-400 hover:text-indigo-300 underline-offset-2 hover:underline"
            >
              Event Types
            </a>
            .
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-zinc-400">Cal.com API Key</label>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="cal_live_..."
                  autoComplete="off"
                  className="h-9 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 pr-10 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                  aria-label={showKey ? 'Hide key' : 'Show key'}
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-zinc-400">Event Type ID</label>
              <input
                type="text"
                inputMode="numeric"
                value={eventTypeId}
                onChange={(e) => setEventTypeId(e.target.value)}
                placeholder="123456"
                className="h-9 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-400">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleConnect}
              disabled={saving || !apiKey.trim() || !eventTypeId.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {saving ? 'Connecting…' : 'Connect Cal.com'}
            </button>
            {savedFlash && (
              <span className="text-xs text-emerald-400">Saved!</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
