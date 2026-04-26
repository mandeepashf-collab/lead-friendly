import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-zinc-100 px-6">
      <div className="max-w-md w-full rounded-2xl border border-zinc-800 bg-zinc-900 p-8 text-center">
        <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">404</p>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-50">Page not found</h1>
        <p className="mt-3 text-sm text-zinc-400">
          The page you&rsquo;re looking for doesn&rsquo;t exist or you don&rsquo;t have access to it.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Link
            href="/dashboard"
            className="inline-flex items-center rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            Go to dashboard
          </Link>
          <Link
            href="/launchpad"
            className="inline-flex items-center rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-800"
          >
            Launchpad
          </Link>
        </div>
      </div>
    </div>
  );
}
