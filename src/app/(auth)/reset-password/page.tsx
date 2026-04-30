"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Sparkles, Loader2, CheckCircle2 } from "lucide-react";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError("Passwords do not match"); return; }
    setLoading(true); setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setDone(true);
      // Full-page nav (not router.push) so the updated session cookies
      // reach the proxy. See login/page.tsx for full rationale.
      setTimeout(() => window.location.assign("/dashboard"), 2000);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600">
            <Sparkles className="h-6 w-6 text-white" />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-white">Set New Password</h1>
          <p className="mt-1 text-sm text-zinc-400">Enter your new password below</p>
        </div>

        {done ? (
          <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-4 text-sm text-emerald-400 text-center flex items-center justify-center gap-2">
            <CheckCircle2 className="h-4 w-4" /> Password updated! Redirecting...
          </div>
        ) : (
          <form onSubmit={handleReset} className="space-y-4">
            {error && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">{error}</div>
            )}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-300">New Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                className="h-10 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-sm text-white placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
                placeholder="Min 8 characters" required minLength={8} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-300">Confirm Password</label>
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                className="h-10 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-sm text-white placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
                placeholder="Repeat password" required minLength={8} />
            </div>
            <button type="submit" disabled={loading}
              className="flex h-10 w-full items-center justify-center rounded-lg bg-indigo-600 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update Password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
