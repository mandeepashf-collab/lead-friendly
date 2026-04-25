export const metadata = {
  title: 'Domain setup in progress',
}

export default function DomainPendingPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-6 text-zinc-100">
      <div className="max-w-md text-center">
        <div className="mb-4 inline-block rounded-full bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-400">
          DNS propagating
        </div>
        <h1 className="mb-3 text-2xl font-semibold">Almost there.</h1>
        <p className="text-sm text-zinc-400">
          This domain is registered but DNS hasn&apos;t fully propagated yet. This usually takes
          5 minutes to a few hours. Refresh periodically — once DNS is live your portal will
          load automatically.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            onClick={() => typeof window !== 'undefined' && window.location.reload()}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            Retry
          </button>
          <a
            href="https://leadfriendly.com"
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
          >
            Go to leadfriendly.com
          </a>
        </div>
      </div>
    </div>
  )
}
