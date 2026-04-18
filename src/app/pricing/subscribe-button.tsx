"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface Props {
  planName: string;
  priceId: string | null;
  isPopular: boolean;
  buttonLabel?: string;
}

/**
 * Subscribe button — handles two flows:
 *   1. If user is NOT signed in, redirect to /register?plan=X so we can
 *      preserve intent through the signup flow.
 *   2. If user IS signed in, POST to /api/stripe/checkout and redirect to
 *      the hosted Stripe Checkout page.
 *
 * If priceId is null (env vars not configured), fall back to /register.
 */
export function SubscribeButton({ planName, priceId, isPopular, buttonLabel }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    if (!priceId) {
      router.push(`/register?plan=${planName.toLowerCase()}`);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push(`/register?plan=${planName.toLowerCase()}&priceId=${priceId}`);
        return;
      }

      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to start checkout");
        setLoading(false);
        return;
      }
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError("No checkout URL returned");
        setLoading(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={handleClick}
        disabled={loading}
        className={`w-full rounded-xl py-3 text-sm font-semibold transition-colors mb-8 flex items-center justify-center gap-2 ${
          isPopular
            ? "bg-indigo-600 text-white hover:bg-indigo-700"
            : "border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
        } disabled:opacity-60`}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {loading ? "Redirecting…" : (buttonLabel || "Start free trial")}
      </button>
      {error && <p className="text-xs text-red-400 text-center -mt-6 mb-4">{error}</p>}
    </>
  );
}
