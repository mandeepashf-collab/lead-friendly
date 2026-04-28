'use client'
'use client'

import Link from 'next/link'
import { Copy, ArrowLeft } from 'lucide-react'

/**
 * Pre-launch stub for the Blueprints / Snapshots feature.
 *
 * The original 566-line page lives in git history. It depended on an
 * `agencies` table that doesn't yet exist, which caused every load to
 * surface a "No agency account found" error while still allowing the
 * form to open.
 *
 * Decision (Apr 28, post-launch backlog F25-followup): keep the route
 * reachable so direct navigation doesn't 404, but render a coming-soon
 * placeholder until the agency-account migration ships. The sidebar
 * link is also commented out in `src/components/layout/sidebar.tsx`.
 */
export default function BlueprintsComingSoonPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <Link
        href="/dashboard"
        className="mb-8 inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to dashboard
      </Link>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-indigo-500/10">
          <Copy className="h-6 w-6 text-indigo-400" />
        </div>
        <h1 className="mt-5 text-xl font-semibold text-white">
          Blueprints — coming soon
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-zinc-400">
          Save an agent + workflow + branding bundle as a snapshot and apply
          it across new client accounts in one click. Available once agency
          accounts ship.
        </p>
        <p className="mx-auto mt-3 max-w-md text-xs text-zinc-600">
          Want early access? Let us know — we&apos;re prioritizing this for
          customers running 3+ client workspaces.
        </p>
      </div>
    </div>
  )
}
  id: string
  name: string
  description: string | null
  industry: string
  thumbnail_color: string
  usage_count: number
}

interface SubAccount {
  id: string
  name: string
  company_name: string | null
}

// ── Color Presets ────────────────────────────────────────────
const COLOR_PRESETS = [
  '#6366f1', // indigo-600
  '#14b8a6', // teal-600
  '#10b981', // emerald-600
  '#f59e0b', // amber-500
  '#ef4444', // red-500
  '#8b5cf6', // violet-600
  '#06b6d4', // cyan-500
  '#f97316', // orange-500
]

const INDUSTRIES = [
  'General',
  'Real Estate',
  'Dental',
  'Gym',
  'HVAC',
  'Insurance',
  'Custom'
]

// ── Main Page ────────────────────────────────────────────────
export default function SnapshotsPage() {
  const supabase = createClient()

  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [subAccounts, setSubAccounts] = useState<SubAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreatePanel, setShowCreatePanel] = useState(false)
  const [showApplyModal, setShowApplyModal] = useState(false)
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [applying, setApplying] = useState(false)

  // Create form state
  const [createName, setCreateName] = useState('')
  const [createDescription, setCreateDescription] = useState('')
  const [createIndustry, setCreateIndustry] = useState('General')
  const [createColor, setCreateColor] = useState('#6366f1')
  const [createSourceId, setCreateSourceId] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // Apply modal state
  const [applyTargetId, setApplyTargetId] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      setLoading(true)
      setError(null)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      // Get agency
      const { data: agency } = await supabase
        .from('agencies')
        .select('id')
        .eq('user_id', user.id)
        .single()

      if (!agency) throw new Error('No agency account found')

      // Get snapshots
      const { data: snapshotsData, error: snapshotsError } = await supabase
        .from('snapshots')
        .select('id, name, description, industry, thumbnail_color, usage_count')
        .eq('agency_id', agency.id)
        .order('created_at', { ascending: false })

      if (snapshotsError) throw snapshotsError
      setSnapshots(snapshotsData || [])

      // Get sub-accounts for dropdowns
      const { data: subAccountsData, error: subAccountsError } = await supabase
        .from('sub_accounts')
        .select('id, name, company_name')
        .eq('agency_id', agency.id)
        .eq('status', 'active')
        .order('name')

      if (subAccountsError) throw subAccountsError
      setSubAccounts(subAccountsData || [])

      if (subAccountsData?.length > 0) {
        setCreateSourceId(subAccountsData[0].id)
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleCreateSnapshot() {
    if (!createName.trim()) {
      setCreateError('Snapshot name is required')
      return
    }
    if (!createSourceId) {
      setCreateError('Please select a source account')
      return
    }

    try {
      setCreating(true)
      setCreateError(null)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { data: agency } = await supabase
        .from('agencies')
        .select('id')
        .eq('user_id', user.id)
        .single()

      if (!agency) throw new Error('No agency account found')

      const response = await fetch('/api/agency/snapshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agency_id: agency.id,
          source_account_id: createSourceId,
          name: createName,
          description: createDescription || null,
          industry: createIndustry,
          thumbnail_color: createColor,
        }),
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || 'Failed to create snapshot')
      }

      // Reset form and reload
      setCreateName('')
      setCreateDescription('')
      setCreateIndustry('General')
      setCreateColor('#6366f1')
      setShowCreatePanel(false)
      await loadData()
    } catch (err: any) {
      setCreateError(err.message)
    } finally {
      setCreating(false)
    }
  }

  async function handleDeleteSnapshot(id: string) {
    if (!confirm('Delete this snapshot? This cannot be undone.')) return

    try {
      setDeleting(id)
      const response = await fetch(`/api/agency/snapshots/${id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete snapshot')
      }

      await loadData()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setDeleting(null)
    }
  }

  async function handleApplySnapshot() {
    if (!selectedSnapshotId || !applyTargetId) {
      setError('Please select a target account')
      return
    }

    try {
      setApplying(true)
      const response = await fetch(
        `/api/agency/snapshots/${selectedSnapshotId}/apply`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ target_account_id: applyTargetId }),
        }
      )

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || 'Failed to apply snapshot')
      }

      setShowApplyModal(false)
      setSelectedSnapshotId(null)
      setApplyTargetId('')
      await loadData()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setApplying(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="animate-spin text-indigo-500" size={32} />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* ── Header ──────────────────────────────────────── */}
      <div className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white">Account Snapshots</h1>
              <p className="text-zinc-400 mt-1">
                Clone your best setup to any new client in one click
              </p>
            </div>
            <button
              onClick={() => setShowCreatePanel(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium transition-colors"
            >
              <Plus size={18} />
              Create Snapshot
            </button>
          </div>
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-6 py-12">
        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-3">
            <AlertCircle className="text-red-400 flex-shrink-0 mt-0.5" size={20} />
            <div>
              <p className="text-red-400 font-medium">Error</p>
              <p className="text-red-300 text-sm">{error}</p>
            </div>
          </div>
        )}

        {snapshots.length === 0 ? (
          // ── Empty State ──────────────────────────────
          <div className="text-center py-20">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-indigo-500/10 mb-6">
              <Copy className="text-indigo-400" size={28} />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">No snapshots yet</h2>
            <p className="text-zinc-400 mb-8 max-w-sm mx-auto">
              Create a snapshot from one of your client accounts to save and reuse their AI agent configuration
            </p>
            <button
              onClick={() => setShowCreatePanel(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium transition-colors"
            >
              <Plus size={18} />
              Create your first snapshot
            </button>
          </div>
        ) : (
          // ── Snapshot Grid ────────────────────────────
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {snapshots.map((snapshot) => (
              <div
                key={snapshot.id}
                className="group rounded-xl border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-900 overflow-hidden transition-all"
              >
                {/* Color bar */}
                <div
                  className="h-1 w-full"
                  style={{ backgroundColor: snapshot.thumbnail_color }}
                />

                {/* Content */}
                <div className="p-6">
                  <div className="mb-4">
                    <h3 className="text-lg font-semibold text-white mb-1">
                      {snapshot.name}
                    </h3>
                    <p className="text-zinc-400 text-sm line-clamp-2">
                      {snapshot.description || '(No description)'}
                    </p>
                  </div>

                  {/* Industry badge */}
                  <div className="mb-4">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-zinc-800 text-xs font-medium text-zinc-300">
                      {snapshot.industry}
                    </span>
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-4 border-t border-zinc-800">
                    <span className="text-xs text-zinc-500">
                      {snapshot.usage_count === 1
                        ? '1 time applied'
                        : `${snapshot.usage_count} times applied`}
                    </span>
                    <button
                      onClick={() => {
                        setSelectedSnapshotId(snapshot.id)
                        setShowApplyModal(true)
                      }}
                      className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
                    >
                      Apply
                      <ArrowRight size={14} />
                    </button>
                  </div>
                </div>

                {/* Hover actions */}
                <div className="px-6 pb-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleDeleteSnapshot(snapshot.id)}
                    disabled={deleting === snapshot.id}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 font-medium transition-colors disabled:opacity-50"
                  >
                    {deleting === snapshot.id ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Trash2 size={16} />
                    )}
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Create Snapshot Panel ──────────────────────── */}
      {showCreatePanel && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setShowCreatePanel(false)}
          />

          {/* Panel */}
          <div className="fixed right-0 top-0 h-full w-[480px] bg-zinc-900 border-l border-zinc-800 shadow-2xl z-50 flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
              <h2 className="text-xl font-bold text-white">Create Snapshot</h2>
              <button
                onClick={() => setShowCreatePanel(false)}
                className="p-1 hover:bg-zinc-800 rounded-lg transition-colors"
              >
                <X size={20} className="text-zinc-400" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
              {createError && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                  <p className="text-red-400 text-sm">{createError}</p>
                </div>
              )}

              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Snapshot Name *
                </label>
                <input
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="e.g., Real Estate Outbound Setup"
                  className="w-full px-4 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-white placeholder:text-zinc-500 focus:border-indigo-500 focus:outline-none transition-colors"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Description
                </label>
                <textarea
                  value={createDescription}
                  onChange={(e) => setCreateDescription(e.target.value)}
                  placeholder="Describe what's special about this setup..."
                  rows={3}
                  className="w-full px-4 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-white placeholder:text-zinc-500 focus:border-indigo-500 focus:outline-none resize-none transition-colors"
                />
              </div>

              {/* Industry */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Industry
                </label>
                <select
                  value={createIndustry}
                  onChange={(e) => setCreateIndustry(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-white focus:border-indigo-500 focus:outline-none transition-colors"
                >
                  {INDUSTRIES.map((ind) => (
                    <option key={ind} value={ind}>
                      {ind}
                    </option>
                  ))}
                </select>
              </div>

              {/* Color Picker */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-3">
                  Color
                </label>
                <div className="flex gap-2">
                  {COLOR_PRESETS.map((color) => (
                    <button
                      key={color}
                      onClick={() => setCreateColor(color)}
                      className={`w-10 h-10 rounded-lg border-2 transition-all ${
                        createColor === color
                          ? 'border-white scale-110'
                          : 'border-zinc-700 hover:border-zinc-600'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>

              {/* Source Account */}
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Source Account *
                </label>
                <select
                  value={createSourceId}
                  onChange={(e) => setCreateSourceId(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-white focus:border-indigo-500 focus:outline-none transition-colors"
                >
                  <option value="">Select account...</option>
                  {subAccounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.company_name || acc.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Footer */}
            <div className="border-t border-zinc-800 px-6 py-4 flex gap-3">
              <button
                onClick={() => setShowCreatePanel(false)}
                className="flex-1 px-4 py-2.5 rounded-lg border border-zinc-700 hover:bg-zinc-800 text-white font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateSnapshot}
                disabled={creating}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creating && <Loader2 size={16} className="animate-spin" />}
                Create Snapshot
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Apply Modal ────────────────────────────────── */}
      {showApplyModal && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setShowApplyModal(false)}
          />

          {/* Modal */}
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl max-w-sm w-full">
              {/* Header */}
              <div className="px-6 py-4 border-b border-zinc-800">
                <h2 className="text-xl font-bold text-white">Apply to which client?</h2>
              </div>

              {/* Content */}
              <div className="px-6 py-6">
                <select
                  value={applyTargetId}
                  onChange={(e) => setApplyTargetId(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-white focus:border-indigo-500 focus:outline-none transition-colors"
                >
                  <option value="">Select account...</option>
                  {subAccounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.company_name || acc.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-zinc-800 flex gap-3">
                <button
                  onClick={() => setShowApplyModal(false)}
                  className="flex-1 px-4 py-2.5 rounded-lg border border-zinc-700 hover:bg-zinc-800 text-white font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApplySnapshot}
                  disabled={applying || !applyTargetId}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {applying && <Loader2 size={16} className="animate-spin" />}
                  Apply
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
