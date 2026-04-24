export const metadata = {
  title: 'Domain not recognized',
}

export default function UnknownDomainPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-6 text-zinc-100">
      <div className="max-w-md text-center">
        <div className="mb-4 inline-block rounded-full bg-zinc-900 px-3 py-1 text-xs text-zinc-400">
          Lead Friendly
        </div>
        <h1 className="mb-3 text-2xl font-semibold">This domain isn&apos;t pointed at an active portal.</h1>
        <p className="text-sm text-zinc-400">
          If you&apos;re the owner, check your branding settings to make sure the custom domain is configured
          and verified. Otherwise, contact whoever sent you this link.
        </p>
        <a
          href="https://leadfriendly.com"
          className="mt-6 inline-block rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
        >
          Go to leadfriendly.com →
        </a>
      </div>
    </div>
  )
}
