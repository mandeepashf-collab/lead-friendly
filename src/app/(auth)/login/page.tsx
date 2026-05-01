"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Sparkles, Loader2 } from "lucide-react";

/**
 * Resolve where to send the user after a successful sign-in. If the URL
 * contains ?priceId=...&tierId=...&interval=..., kick off Stripe Checkout
 * before going to /dashboard. Otherwise plain /dashboard.
 *
 * Falls back to /dashboard on any failure (network, missing params, etc).
 */
async function postLoginRedirect() {
  const params = new URLSearchParams(window.location.search);
  const priceId = params.get("priceId");
  const tierId = params.get("plan");
  const interval = params.get("interval");

  if (priceId && tierId && interval) {
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId, tierId, interval }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
        return;
      }
    } catch {
      /* fallthrough */
    }
  }

  // Default — full-page nav so cookies reach the proxy.
  window.location.assign("/dashboard");
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      // Full-page nav (not router.push) so freshly-set Supabase auth
      // cookies reach the proxy on the next request. Without this, the
      // proxy sees no session on the first RSC fetch → emits
      // x-lf-user-is-agency-admin=0 → BrandProvider hydrates with
      // isAgencyAdmin=false → white-label sidebar section, Workspaces,
      // Partner billing all hidden until the user manually reloads.
      //
      // Phase 4: if user came from /pricing with checkout intent, jump
      // straight to Stripe Checkout instead of dashboard.
      await postLoginRedirect();
    }
  };

  const handleGoogle = async () => {
    setGoogleLoading(true);
    const supabase = createClient();
    // Phase 4: if checkout intent in URL, preserve it through OAuth round-trip
    // by passing /pricing?... back to ourselves so the user re-clicks the
    // (now-signed-in) subscribe button. Simpler than threading through OAuth
    // state.
    const params = new URLSearchParams(window.location.search);
    const hasCheckoutIntent = params.has("priceId");
    const next = hasCheckoutIntent
      ? `/pricing?${params.toString()}`
      : "/dashboard";
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        skipBrowserRedirect: false,
      },
    });
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: `https://leadfriendly.com/auth/callback?next=/reset-password`,
    });
    setResetSent(true);
    setLoading(false);
  };

  if (showReset) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
        <div className="w-full max-w-sm space-y-8">
          <div className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600">
              <Sparkles className="h-6 w-6 text-white" />
            </div>
            <h1 className="mt-4 text-2xl font-bold text-white">Reset Password</h1>
            <p className="mt-1 text-sm text-zinc-400">Enter your email to receive a reset link</p>
          </div>
          {resetSent ? (
            <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-4 text-sm text-emerald-400 text-center">
              ✓ Check your email for a password reset link
            </div>
          ) : (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <input
                type="email"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                className="h-10 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-sm text-white placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
                placeholder="Your email address"
                required
              />
              <button type="submit" disabled={loading}
                className="flex h-10 w-full items-center justify-center rounded-lg bg-indigo-600 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send Reset Link"}
              </button>
            </form>
          )}
          <button onClick={() => setShowReset(false)} className="w-full text-center text-sm text-zinc-500 hover:text-zinc-300">
            ← Back to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-sm space-y-8">
        {/* Logo */}
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600">
            <Sparkles className="h-6 w-6 text-white" />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-white">Welcome back</h1>
          <p className="mt-1 text-sm text-zinc-400">Sign in to your Lead Friendly account</p>
        </div>

        {/* Google */}
        <button onClick={handleGoogle} disabled={googleLoading}
          className="flex h-10 w-full items-center justify-center gap-3 rounded-lg border border-zinc-700 bg-zinc-900 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50">
          {googleLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
            <svg className="h-4 w-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
          )}
          Continue with Google
        </button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-zinc-800" /></div>
          <div className="relative flex justify-center text-xs text-zinc-500"><span className="bg-zinc-950 px-2">or continue with email</span></div>
        </div>

        {/* Email form */}
        <form onSubmit={handleLogin} className="space-y-4">
          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">{error}</div>
          )}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-300">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              className="h-10 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-sm text-white placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
              placeholder="you@example.com" required />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-medium text-zinc-300">Password</label>
              <button type="button" onClick={() => { setShowReset(true); setResetEmail(email); }}
                className="text-xs text-indigo-400 hover:text-indigo-300">
                Forgot password?
              </button>
            </div>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              className="h-10 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-sm text-white placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
              placeholder="Enter your password" required />
          </div>
          <button type="submit" disabled={loading}
            className="flex h-10 w-full items-center justify-center rounded-lg bg-indigo-600 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign In"}
          </button>
        </form>

        <p className="text-center text-sm text-zinc-500">
          Don&apos;t have an account?{" "}
          <Link href="/register" className="text-indigo-400 hover:text-indigo-300">Sign up</Link>
        </p>
        <p className="text-center text-xs text-zinc-600 mt-2">
          <Link href="/pricing" className="hover:text-zinc-400">View pricing →</Link>
        </p>
      </div>
    </div>
  );
}
