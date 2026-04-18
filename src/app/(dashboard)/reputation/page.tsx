"use client";

import { useState } from "react";
import { Star, TrendingUp, MessageSquare, ExternalLink, RefreshCw, ThumbsUp, ThumbsDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

const REVIEWS = [
  { id: "1", platform: "Google", author: "James Patel", rating: 5, date: "2026-04-08", text: "Excellent service! The AI calling system reached out exactly when I needed it. Very professional.", replied: true },
  { id: "2", platform: "Google", author: "Sarah Kim", rating: 4, date: "2026-04-06", text: "Great experience overall. Quick response and very helpful. Would recommend.", replied: false },
  { id: "3", platform: "Yelp", author: "Michael Torres", rating: 5, date: "2026-04-05", text: "Outstanding! They handled everything smoothly. The follow-up process was seamless.", replied: true },
  { id: "4", platform: "Google", author: "Lisa Chen", rating: 3, date: "2026-04-03", text: "Good service but the wait time was a bit long. Overall satisfied with the outcome.", replied: false },
  { id: "5", platform: "Facebook", author: "David Nguyen", rating: 5, date: "2026-04-01", text: "5 stars! Exactly what I was looking for. Very professional and prompt.", replied: false },
];

const PLATFORM_COLORS: Record<string, string> = {
  Google: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  Yelp: "text-red-400 bg-red-500/10 border-red-500/20",
  Facebook: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
};

function StarRating({ rating, size = "sm" }: { rating: number; size?: "sm" | "lg" }) {
  const s = size === "lg" ? "h-5 w-5" : "h-3.5 w-3.5";
  return (
    <div className="flex items-center gap-0.5">
      {[1,2,3,4,5].map(i => (
        <Star key={i} className={cn(s, i <= rating ? "text-amber-400 fill-amber-400" : "text-zinc-700")} />
      ))}
    </div>
  );
}

export default function ReputationPage() {
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  const avg = REVIEWS.reduce((s, r) => s + r.rating, 0) / REVIEWS.length;
  const dist = [5,4,3,2,1].map(n => ({ stars: n, count: REVIEWS.filter(r => r.rating === n).length }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Reputation</h1>
          <p className="text-zinc-400">Review management and monitoring</p>
        </div>
        <button className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-400 hover:text-white">
          <RefreshCw className="h-4 w-4" />Sync Reviews
        </button>
      </div>

      {/* Overview */}
      <div className="grid grid-cols-4 gap-4">
        <div className="col-span-1 rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 flex flex-col items-center justify-center">
          <p className="text-5xl font-bold text-white mb-1">{avg.toFixed(1)}</p>
          <StarRating rating={Math.round(avg)} size="lg" />
          <p className="text-xs text-zinc-500 mt-2">{REVIEWS.length} total reviews</p>
        </div>
        <div className="col-span-2 rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 space-y-2">
          <p className="text-xs font-medium text-zinc-500 mb-3">Rating breakdown</p>
          {dist.map(d => (
            <div key={d.stars} className="flex items-center gap-3">
              <div className="flex items-center gap-1 w-12 shrink-0">
                <span className="text-xs text-zinc-400">{d.stars}</span>
                <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
              </div>
              <div className="flex-1 h-2 rounded-full bg-zinc-800">
                <div className="h-2 rounded-full bg-amber-400" style={{ width: `${REVIEWS.length > 0 ? (d.count / REVIEWS.length) * 100 : 0}%` }} />
              </div>
              <span className="text-xs text-zinc-500 w-4">{d.count}</span>
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 space-y-3">
          {[
            { label: "Responded", value: `${REVIEWS.filter(r => r.replied).length}/${REVIEWS.length}`, color: "text-emerald-400" },
            { label: "Avg Rating", value: avg.toFixed(1), color: "text-amber-400" },
            { label: "This Month", value: REVIEWS.length, color: "text-indigo-400" },
          ].map(s => (
            <div key={s.label}>
              <p className="text-xs text-zinc-500">{s.label}</p>
              <p className={cn("text-xl font-bold", s.color)}>{s.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Review list */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Recent Reviews</h3>
          <div className="flex gap-1 text-xs text-zinc-500">
            <span>Filter:</span>
            {["All", "Unresponded", "5★", "3★ & below"].map(f => (
              <button key={f} className="rounded-md px-2 py-1 hover:bg-zinc-800 hover:text-zinc-300">{f}</button>
            ))}
          </div>
        </div>

        {REVIEWS.map(r => (
          <div key={r.id} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-800 text-sm font-semibold text-zinc-300">
                  {r.author[0]}
                </div>
                <div>
                  <p className="text-sm font-medium text-white">{r.author}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <StarRating rating={r.rating} />
                    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", PLATFORM_COLORS[r.platform] || "text-zinc-400 bg-zinc-500/10 border-zinc-500/20")}>
                      {r.platform}
                    </span>
                    <span className="text-xs text-zinc-600">{new Date(r.date).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {r.replied && <span className="text-xs text-emerald-400 flex items-center gap-1"><ThumbsUp className="h-3 w-3" />Responded</span>}
                <button className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1">
                  <ExternalLink className="h-3 w-3" />View
                </button>
              </div>
            </div>

            <p className="text-sm text-zinc-300 leading-relaxed">{r.text}</p>

            {!r.replied && (
              replyingTo === r.id ? (
                <div className="space-y-2">
                  <textarea value={replyText} onChange={e => setReplyText(e.target.value)}
                    rows={3} placeholder="Write your reply…"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-300 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none resize-none" />
                  <div className="flex gap-2">
                    <button onClick={() => { setReplyingTo(null); setReplyText(""); }}
                      className="flex-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700">
                      Post Reply
                    </button>
                    <button onClick={() => { setReplyingTo(null); setReplyText(""); }}
                      className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800">Cancel</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setReplyingTo(r.id)}
                  className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300">
                  <MessageSquare className="h-3.5 w-3.5" />Reply to review
                </button>
              )
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
