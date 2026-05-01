"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Sparkles, Loader2 } from "lucide-react";

/**
 * Resolve where to send the user after signup. If URL has checkout intent
 * params, kick off Stripe Checkout. Otherwise /dashboard.
 *
 * Note: signup creates the user but the org row may not exist yet (depends
 * on your trigger setup). If checkout fails because there's no org, fall
 * back to /pricing where they can re-click after the org is provisioned.
 */
async function postSignupRedirect() {
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
      /* fall through */
    }
    // If checkout failed, send them back to /pricing so they can retry
    window.location.assign(`/pricing?retry=1`);
    return;
  }

  // Default
  window.location.assign("/dashboard");
}

export default function RegisterPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, company_name: companyName } },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setSuccess(true);
      // Phase 4: if user came from /pricing with checkout intent, jump
      // straight to Stripe Checkout instead of dashboard.
      setTimeout(() => { postSignupRedirect(); }, 1500);
    }
  };

  const handleGoogle = async () => {
    setGoogleLoading(true);
    const supabase = createClient();
    // Phase 4: preserve checkout intent through OAuth round-trip.
    const params = new URLSearchParams(window.location.search);
    const hasCheckoutIntent = params.has("priceId");
    const next = hasCheckoutIntent
      ? `/pricing?${params.toString()}`
      : "/dashboard";
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600">
            <Sparkles className="h-6 w-6 text-white" />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-white">Create your account</h1>
          <p className="mt-1 text-sm text-zinc-400">Start your 14-day free trial — no credit card required</p>
        </div>

        {success && (
          <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-4 text-sm text-emerald-400 text-center">
            ✓ Account created! Redirecting to dashboard...
          </div>
        )}

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
          Sign up with Google
        </button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-zinc-800" /></div>
          <div className="relative flex justify-center text-xs text-zinc-500"><span className="bg-zinc-950 px-2">or sign up with email</span></div>
        </div>

        <form onSubmit={handleRegister} className="space-y-4">
          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">{error}</div>
          )}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-300">Full Name</label>
            <input type="text" value={fullName} onChange={e => setFullName(e.target.value)}
              className="h-10 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-sm text-white placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
              placeholder="Mandeep Singh" required />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-300">Company Name</label>
            <input type="text" value={companyName} onChange={e => setCompanyName(e.target.value)}
              className="h-10 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-sm text-white placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
              placeholder="Your Agency" required />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-300">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              className="h-10 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-sm text-white placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
              placeholder="you@example.com" required />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-300">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              className="h-10 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-sm text-white placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
              placeholder="Min 8 characters" required minLength={8} />
          </div>
          <button type="submit" disabled={loading || success}
            className="flex h-10 w-full items-center justify-center rounded-lg bg-indigo-600 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Account"}
          </button>
        </form>

        <p className="text-center text-sm text-zinc-500">
          Already have an account?{" "}
          <Link href="/login" className="text-indigo-400 hover:text-indigo-300">Sign in</Link>
        </p>
        <p className="text-center text-xs text-zinc-600 mt-2">
          <Link href="/pricing" className="hover:text-zinc-400">View pricing →</Link>
        </p>
      </div>
    </div>
  );
}
