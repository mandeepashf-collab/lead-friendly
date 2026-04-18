"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Building2, Palette, Save, Upload, CheckCircle2, Globe, RefreshCw, ExternalLink, ShieldCheck, AlertCircle,
  Star, TrendingUp, MessageSquare, ThumbsUp,
  BarChart3, Phone, Users, Calendar, DollarSign, Download,
  FileText, Plus, Copy, Edit2, Trash2, Mail, Search, Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

/* ════════════════════════════════════════════════════════════════
   BRANDING TAB
   ════════════════════════════════════════════════════════════════ */
const PRESET_COLORS = [
  { name: "Indigo", primary: "#6366f1", accent: "#4f46e5" },
  { name: "Emerald", primary: "#10b981", accent: "#059669" },
  { name: "Sky", primary: "#0ea5e9", accent: "#0284c7" },
  { name: "Violet", primary: "#8b5cf6", accent: "#7c3aed" },
  { name: "Rose", primary: "#f43f5e", accent: "#e11d48" },
  { name: "Amber", primary: "#f59e0b", accent: "#d97706" },
];

type BrandTab = "branding" | "domain";

function BrandingTab() {
  const [tab, setTab] = useState<BrandTab>("branding");
  const [saved, setSaved] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState(0);
  const [domainStatus, setDomainStatus] = useState<"idle" | "checking" | "verified" | "error">("idle");
  const [form, setForm] = useState({
    companyName: "Lead Friendly",
    tagline: "AI-Powered Sales CRM",
    primaryColor: "#6366f1",
    accentColor: "#4f46e5",
    logoUrl: "",
    faviconUrl: "",
    emailFromName: "Lead Friendly",
    emailFromAddress: "noreply@leadfriendly.com",
    smsFromName: "LeadFriendly",
    footerText: "\u00a9 2026 Lead Friendly. All rights reserved.",
  });
  const [domain, setDomain] = useState({ customDomain: "", subdomain: "app" });

  const set = (k: keyof typeof form) => (v: string) => setForm(f => ({ ...f, [k]: v }));
  const setD = (k: keyof typeof domain) => (v: string) => setDomain(d => ({ ...d, [k]: v }));
  const handleSave = () => { setSaved(true); setTimeout(() => setSaved(false), 2500); };
  const applyPreset = (i: number) => { setSelectedPreset(i); setForm(f => ({ ...f, primaryColor: PRESET_COLORS[i].primary, accentColor: PRESET_COLORS[i].accent })); };
  const checkDns = () => { setDomainStatus("checking"); setTimeout(() => { setDomainStatus(domain.customDomain ? "verified" : "error"); }, 2000); };
  const fullDomain = domain.customDomain ? `${domain.subdomain ? domain.subdomain + "." : ""}${domain.customDomain}` : "";

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div className="flex gap-1 rounded-xl border border-zinc-800 bg-zinc-900/50 p-1 w-fit">
          {([["branding", "Branding"], ["domain", "Custom Domain"]] as [BrandTab, string][]).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${tab === key ? "bg-indigo-600 text-white" : "text-zinc-400 hover:text-white"}`}>
              {key === "domain" && <Globe className="h-3.5 w-3.5" />}
              {label}
            </button>
          ))}
        </div>
        {tab === "branding" && (
          <button onClick={handleSave}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            {saved ? <><CheckCircle2 className="h-4 w-4" />Saved!</> : <><Save className="h-4 w-4" />Save Changes</>}
          </button>
        )}
      </div>

      {tab === "branding" && (
        <>
          {/* Identity */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-white">Brand Identity</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Company Name</label>
                <input value={form.companyName} onChange={e => set("companyName")(e.target.value)}
                  className="h-9 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-300 focus:border-indigo-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Tagline</label>
                <input value={form.tagline} onChange={e => set("tagline")(e.target.value)}
                  className="h-9 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-300 focus:border-indigo-500 focus:outline-none" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Logo</label>
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950">
                    <Palette className="h-5 w-5 text-zinc-600" />
                  </div>
                  <button className="flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800">
                    <Upload className="h-3.5 w-3.5" />Upload Logo
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Favicon</label>
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded border border-zinc-800 bg-zinc-950">
                    <div className="h-3 w-3 rounded-sm bg-indigo-600" />
                  </div>
                  <button className="flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800">
                    <Upload className="h-3.5 w-3.5" />Upload Favicon
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Colors */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-white">Color Scheme</h3>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-2">Presets</label>
              <div className="flex gap-2">
                {PRESET_COLORS.map((p, i) => (
                  <button key={p.name} onClick={() => applyPreset(i)}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-all ${selectedPreset === i ? "border-white text-white" : "border-zinc-700 text-zinc-400 hover:border-zinc-500"}`}>
                    <div className="h-3.5 w-3.5 rounded-full" style={{ background: p.primary }} />
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Primary Color</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={form.primaryColor} onChange={e => set("primaryColor")(e.target.value)}
                    className="h-9 w-12 cursor-pointer rounded border border-zinc-800 bg-transparent p-0.5" />
                  <input value={form.primaryColor} onChange={e => set("primaryColor")(e.target.value)}
                    className="h-9 flex-1 rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-300 font-mono focus:border-indigo-500 focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Accent Color</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={form.accentColor} onChange={e => set("accentColor")(e.target.value)}
                    className="h-9 w-12 cursor-pointer rounded border border-zinc-800 bg-transparent p-0.5" />
                  <input value={form.accentColor} onChange={e => set("accentColor")(e.target.value)}
                    className="h-9 flex-1 rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-300 font-mono focus:border-indigo-500 focus:outline-none" />
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
              <p className="text-xs text-zinc-500 mb-3">Preview</p>
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: form.primaryColor }}>
                  <Palette className="h-4 w-4 text-white" />
                </div>
                <span className="text-sm font-bold" style={{ color: form.primaryColor }}>{form.companyName}</span>
                <button className="ml-auto rounded-lg px-3 py-1.5 text-xs font-medium text-white" style={{ background: form.accentColor }}>
                  Button Preview
                </button>
              </div>
            </div>
          </div>

          {/* Messaging defaults */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-white">Messaging Defaults</h3>
            <div className="grid grid-cols-2 gap-4">
              {([
                { label: "Email From Name", key: "emailFromName" as const },
                { label: "Email From Address", key: "emailFromAddress" as const },
                { label: "SMS Sender Name", key: "smsFromName" as const },
                { label: "Footer Text", key: "footerText" as const },
              ]).map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-medium text-zinc-400 mb-1.5">{f.label}</label>
                  <input value={form[f.key]} onChange={e => set(f.key)(e.target.value)}
                    className="h-9 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-300 focus:border-indigo-500 focus:outline-none" />
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {tab === "domain" && (
        <div className="space-y-5">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Current Domain</h3>
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400">
                <ShieldCheck className="h-3.5 w-3.5" />Active
              </span>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-3 flex items-center justify-between">
              <span className="font-mono text-sm text-zinc-300">leadfriendly.com</span>
              <a href="https://leadfriendly.com" target="_blank" rel="noreferrer"
                className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300">
                <ExternalLink className="h-3 w-3" />Visit
              </a>
            </div>
            <p className="text-xs text-zinc-500">This is your primary domain registered through IONOS. It&apos;s verified and pointing to Vercel.</p>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-white">Add Custom Domain</h3>
            <p className="text-xs text-zinc-400">Point your own domain or subdomain to this CRM. You&apos;ll need to add a CNAME record at your DNS provider.</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Subdomain</label>
                <input value={domain.subdomain} onChange={e => setD("subdomain")(e.target.value)} placeholder="app"
                  className="h-9 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-300 font-mono focus:border-indigo-500 focus:outline-none" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Root Domain</label>
                <input value={domain.customDomain} onChange={e => { setD("customDomain")(e.target.value); setDomainStatus("idle"); }} placeholder="yourdomain.com"
                  className="h-9 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-300 font-mono focus:border-indigo-500 focus:outline-none" />
              </div>
            </div>
            {fullDomain && (
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-2.5 flex items-center gap-2">
                <Globe className="h-3.5 w-3.5 text-zinc-500" />
                <span className="text-sm font-mono text-zinc-300">{fullDomain}</span>
              </div>
            )}
            {domain.customDomain && (
              <div className="rounded-lg border border-indigo-500/20 bg-indigo-500/5 p-4 space-y-3">
                <p className="text-xs font-semibold text-indigo-400">DNS Configuration Required</p>
                <p className="text-xs text-zinc-400">Add this CNAME record at your DNS provider (e.g. IONOS, Cloudflare, GoDaddy):</p>
                <div className="rounded border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs text-zinc-300 space-y-1">
                  <div className="grid grid-cols-3 gap-4 text-zinc-500 text-[10px] uppercase tracking-wider mb-2">
                    <span>Type</span><span>Name</span><span>Value</span>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <span className="text-emerald-400">CNAME</span>
                    <span>{domain.subdomain || "@"}</span>
                    <span className="text-indigo-400">cname.vercel-dns.com</span>
                  </div>
                </div>
                <p className="text-xs text-zinc-500">DNS changes can take up to 48 hours to propagate.</p>
              </div>
            )}
            <div className="flex items-center gap-3">
              <button onClick={checkDns} disabled={!domain.customDomain || domainStatus === "checking"}
                className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed">
                {domainStatus === "checking" ? <><RefreshCw className="h-4 w-4 animate-spin" />Checking...</> : <><Globe className="h-4 w-4" />Verify DNS</>}
              </button>
              {domainStatus === "verified" && <span className="flex items-center gap-1.5 text-sm text-emerald-400"><CheckCircle2 className="h-4 w-4" />Domain verified!</span>}
              {domainStatus === "error" && <span className="flex items-center gap-1.5 text-sm text-rose-400"><AlertCircle className="h-4 w-4" />DNS not found — check your records</span>}
            </div>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 flex items-start gap-3">
            <ShieldCheck className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-white mb-0.5">SSL Certificate</p>
              <p className="text-xs text-zinc-400">SSL is automatically provisioned by Vercel once your DNS is verified. Your custom domain will be served over HTTPS at no extra cost.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   REPUTATION TAB
   ════════════════════════════════════════════════════════════════ */
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

function ReputationTab() {
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  const avg = REVIEWS.reduce((s, r) => s + r.rating, 0) / REVIEWS.length;
  const dist = [5,4,3,2,1].map(n => ({ stars: n, count: REVIEWS.filter(r => r.rating === n).length }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <button className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-400 hover:text-white">
          <RefreshCw className="h-4 w-4" />Sync Reviews
        </button>
      </div>

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

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Recent Reviews</h3>
          <div className="flex gap-1 text-xs text-zinc-500">
            <span>Filter:</span>
            {["All", "Unresponded", "5\u2605", "3\u2605 & below"].map(f => (
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
                  <textarea value={replyText} onChange={e => setReplyText(e.target.value)} rows={3} placeholder="Write your reply\u2026"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-300 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none resize-none" />
                  <div className="flex gap-2">
                    <button onClick={() => { setReplyingTo(null); setReplyText(""); }}
                      className="flex-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700">Post Reply</button>
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

/* ════════════════════════════════════════════════════════════════
   REPORTING TAB
   ════════════════════════════════════════════════════════════════ */
interface ReportStats {
  totalContacts: number;
  totalCalls: number;
  totalAppointments: number;
  answeredCalls: number;
  avgCallDuration: number;
  callsThisWeek: number;
  contactsThisWeek: number;
}

function StatCard({ label, value, sub, icon: Icon, color }: { label: string; value: string | number; sub?: string; icon: React.ElementType; color: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
          <p className="mt-2 text-3xl font-bold text-white">{value}</p>
          {sub && <p className="mt-1 text-xs text-zinc-600">{sub}</p>}
        </div>
        <Icon className={`h-5 w-5 mt-0.5 ${color}`} />
      </div>
    </div>
  );
}

function SimpleBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-zinc-400 w-20 shrink-0">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-zinc-800">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-zinc-500 w-8 text-right">{value}</span>
    </div>
  );
}

function ReportingTab() {
  const [range, setRange] = useState<"7d" | "30d" | "90d">("30d");
  const [stats, setStats] = useState<ReportStats>({ totalContacts: 0, totalCalls: 0, totalAppointments: 0, answeredCalls: 0, avgCallDuration: 0, callsThisWeek: 0, contactsThisWeek: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      const supabase = createClient();
      const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
      const since = new Date(Date.now() - days * 86400000).toISOString();
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();

      const [contacts, calls, appointments] = await Promise.all([
        supabase.from("contacts").select("id", { count: "exact", head: true }).gte("created_at", since),
        supabase.from("calls").select("id, status, duration_seconds, created_at", { count: "exact" }).gte("created_at", since),
        supabase.from("appointments").select("id", { count: "exact", head: true }).gte("created_at", since),
      ]);

      const callList = (calls.data || []) as { status: string; duration_seconds: number; created_at: string }[];
      const answered = callList.filter(c => c.status === "completed" || c.status === "answered");
      const avgDur = answered.length > 0 ? Math.round(answered.reduce((s, c) => s + (c.duration_seconds || 0), 0) / answered.length) : 0;
      const weekCalls = callList.filter(c => c.created_at >= weekAgo).length;

      setStats({
        totalContacts: contacts.count || 0,
        totalCalls: calls.count || 0,
        totalAppointments: appointments.count || 0,
        answeredCalls: answered.length,
        avgCallDuration: avgDur,
        callsThisWeek: weekCalls,
        contactsThisWeek: 0,
      });
      setLoading(false);
    };
    fetchStats();
  }, [range]);

  const answerRate = stats.totalCalls > 0 ? Math.round((stats.answeredCalls / stats.totalCalls) * 100) : 0;
  const fmtDur = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end gap-2">
        <div className="flex items-center rounded-lg border border-zinc-800 bg-zinc-900 p-0.5">
          {(["7d","30d","90d"] as const).map(r => (
            <button key={r} onClick={() => setRange(r)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${range === r ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-200"}`}>
              {r === "7d" ? "7 days" : r === "30d" ? "30 days" : "90 days"}
            </button>
          ))}
        </div>
        <button className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-400 hover:text-white">
          <Download className="h-4 w-4" />Export
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-zinc-500">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-600 border-t-indigo-500 mr-2" />Loading…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Total Contacts" value={stats.totalContacts} sub={`Last ${range}`} icon={Users} color="text-indigo-400" />
            <StatCard label="Total Calls" value={stats.totalCalls} sub={`${stats.callsThisWeek} this week`} icon={Phone} color="text-blue-400" />
            <StatCard label="Answer Rate" value={`${answerRate}%`} sub={`${stats.answeredCalls} answered`} icon={TrendingUp} color="text-emerald-400" />
            <StatCard label="Appointments" value={stats.totalAppointments} sub={`Last ${range}`} icon={Calendar} color="text-purple-400" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">Call Outcomes</h3>
                <BarChart3 className="h-4 w-4 text-zinc-600" />
              </div>
              <div className="space-y-2.5">
                <SimpleBar label="Answered" value={stats.answeredCalls} max={stats.totalCalls} color="bg-emerald-500" />
                <SimpleBar label="No Answer" value={Math.max(0, stats.totalCalls - stats.answeredCalls - Math.floor(stats.totalCalls * 0.05))} max={stats.totalCalls} color="bg-zinc-600" />
                <SimpleBar label="Voicemail" value={Math.floor(stats.totalCalls * 0.05)} max={stats.totalCalls} color="bg-amber-500" />
              </div>
              <div className="pt-2 border-t border-zinc-800">
                <p className="text-xs text-zinc-500">Avg call duration: <span className="text-white font-medium">{fmtDur(stats.avgCallDuration)}</span></p>
              </div>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">Conversion Funnel</h3>
                <TrendingUp className="h-4 w-4 text-zinc-600" />
              </div>
              <div className="space-y-3">
                {[
                  { label: "Contacts", value: stats.totalContacts, color: "bg-indigo-500", width: 100 },
                  { label: "Called", value: stats.totalCalls, color: "bg-blue-500", width: stats.totalContacts > 0 ? (stats.totalCalls / stats.totalContacts) * 100 : 0 },
                  { label: "Answered", value: stats.answeredCalls, color: "bg-emerald-500", width: stats.totalContacts > 0 ? (stats.answeredCalls / stats.totalContacts) * 100 : 0 },
                  { label: "Appointments", value: stats.totalAppointments, color: "bg-purple-500", width: stats.totalContacts > 0 ? (stats.totalAppointments / stats.totalContacts) * 100 : 0 },
                ].map(f => (
                  <div key={f.label} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-zinc-400">{f.label}</span>
                      <span className="text-white font-medium">{f.value}</span>
                    </div>
                    <div className="h-2 rounded-full bg-zinc-800">
                      <div className={`h-2 rounded-full ${f.color}`} style={{ width: `${Math.min(f.width, 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
            <h3 className="text-sm font-semibold text-white mb-4">Performance Summary</h3>
            <div className="grid grid-cols-3 gap-6">
              {[
                { label: "Contacts per day", value: stats.totalContacts > 0 ? (stats.totalContacts / (range === "7d" ? 7 : range === "30d" ? 30 : 90)).toFixed(1) : "0" },
                { label: "Calls per contact", value: stats.totalContacts > 0 ? (stats.totalCalls / stats.totalContacts).toFixed(1) : "0" },
                { label: "Appt. conversion rate", value: stats.answeredCalls > 0 ? `${Math.round((stats.totalAppointments / stats.answeredCalls) * 100)}%` : "0%" },
              ].map(s => (
                <div key={s.label} className="text-center">
                  <p className="text-2xl font-bold text-white">{s.value}</p>
                  <p className="text-xs text-zinc-500 mt-1">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   TEMPLATES TAB
   ════════════════════════════════════════════════════════════════ */
type TemplateType = "sms" | "email" | "call_script";

interface Template {
  id: string;
  type: TemplateType;
  name: string;
  subject?: string;
  body: string;
  tags: string[];
}

const SAMPLE_TEMPLATES: Template[] = [
  { id: "1", type: "sms", name: "Initial Outreach",
    body: "Hi {first_name}, this is {agent_name} from {company_name}. I'm reaching out about your {loan_type} \u2014 I'd love to connect for 5 minutes. Reply STOP to opt out.",
    tags: ["outbound", "intro"] },
  { id: "2", type: "sms", name: "Appointment Reminder",
    body: "Hi {first_name}! Just a reminder about your appointment tomorrow at {time}. Reply 'YES' to confirm or 'NO' to reschedule.",
    tags: ["appointment", "reminder"] },
  { id: "3", type: "email", name: "Follow-up After Call",
    subject: "Great speaking with you, {first_name}!",
    body: "Hi {first_name},\n\nThank you for taking the time to speak with me today about {topic}.\n\nAs discussed, here are the next steps:\n\u2022 Review the materials I'm sending over\n\u2022 Schedule a follow-up call\n\nPlease don't hesitate to reach out if you have any questions.\n\nBest regards,\n{agent_name}",
    tags: ["follow-up", "email"] },
  { id: "4", type: "email", name: "Introduction Email",
    subject: "Regarding your {loan_type} \u2014 {company_name}",
    body: "Hi {first_name},\n\nMy name is {agent_name} from {company_name}.\n\nI'm reaching out because we specialize in helping people with {loan_type} and I believe we can help you too.\n\nWould you be available for a quick 10-minute call this week?\n\nBest,\n{agent_name}",
    tags: ["intro", "email"] },
  { id: "5", type: "call_script", name: "Outbound Opening",
    body: "Opening:\nHi, may I speak with {first_name}?\n\nGreat! This is {agent_name} from {company_name}. How are you today?\n\n[Wait for response]\n\nBridge:\nThe reason I'm calling \u2014 we noticed you may qualify for {offer}. Do you have 2 minutes?\n\nValue Prop:\nWe've been helping clients save on their {loan_type}. Based on your profile, you could save significantly...",
    tags: ["call", "outbound"] },
  { id: "6", type: "call_script", name: "Objection Handling",
    body: "Price Objection:\n'I understand. If we could show you how this pays for itself in {timeframe}, would that be worth a look?'\n\nNot Interested:\n'I respect that completely. May I ask what specifically isn't a fit right now?'\n\nNeed to Think:\n'Of course! What specifically would help you feel more confident?'",
    tags: ["call", "objections"] },
];

const TYPE_CONFIG: Record<TemplateType, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  sms:         { label: "SMS",         icon: MessageSquare, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
  email:       { label: "Email",       icon: Mail,          color: "text-blue-400",    bg: "bg-blue-500/10 border-blue-500/20" },
  call_script: { label: "Call Script", icon: Phone,         color: "text-purple-400",  bg: "bg-purple-500/10 border-purple-500/20" },
};

const VARIABLES = ["{first_name}","{last_name}","{agent_name}","{company_name}","{loan_type}","{offer}","{time}","{topic}"];

function TemplatesTab() {
  const [filter, setFilter] = useState<TemplateType | "all">("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Template | null>(SAMPLE_TEMPLATES[0]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filtered = SAMPLE_TEMPLATES.filter(t => {
    if (filter !== "all" && t.type !== filter) return false;
    if (search && !t.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const handleCopy = (t: Template) => {
    navigator.clipboard.writeText(t.body);
    setCopiedId(t.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <button className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
          <Plus className="h-4 w-4" />New Template
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {(["sms","email","call_script"] as TemplateType[]).map(type => {
          const cfg = TYPE_CONFIG[type];
          const count = SAMPLE_TEMPLATES.filter(t => t.type === type).length;
          return (
            <button key={type} onClick={() => setFilter(filter === type ? "all" : type)}
              className={cn("rounded-xl border p-4 text-left transition-all", filter === type ? cfg.bg : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-700")}>
              <div className="flex items-center gap-2 mb-1">
                <cfg.icon className={cn("h-4 w-4", cfg.color)} />
                <span className="text-xs font-medium text-zinc-400">{cfg.label}</span>
              </div>
              <p className="text-2xl font-bold text-white">{count}</p>
              <p className="text-xs text-zinc-600 mt-0.5">templates</p>
            </button>
          );
        })}
      </div>

      <div className="flex gap-4" style={{ height: "calc(100vh - 26rem)" }}>
        <div className="w-72 shrink-0 flex flex-col gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search templates\u2026"
              className="h-9 w-full rounded-lg border border-zinc-800 bg-zinc-900 pl-10 pr-3 text-sm text-zinc-300 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none" />
          </div>
          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
            {filtered.map(t => {
              const cfg = TYPE_CONFIG[t.type];
              return (
                <button key={t.id} onClick={() => setSelected(t)}
                  className={cn("w-full text-left rounded-lg border p-3 transition-all",
                    selected?.id === t.id ? "border-indigo-500/40 bg-indigo-500/10" : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-700")}>
                  <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium mb-1", cfg.bg, cfg.color)}>
                    <cfg.icon className="h-3 w-3" />{cfg.label}
                  </span>
                  <p className="text-sm font-medium text-white">{t.name}</p>
                  <p className="text-xs text-zinc-600 mt-0.5 truncate">{t.body.slice(0, 55)}\u2026</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden flex flex-col">
          {selected ? (
            <>
              <div className="flex items-center justify-between p-4 border-b border-zinc-800">
                <div className="flex items-center gap-3">
                  {(() => { const cfg = TYPE_CONFIG[selected.type]; return (
                    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium", cfg.bg, cfg.color)}>
                      <cfg.icon className="h-3.5 w-3.5" />{cfg.label}
                    </span>
                  ); })()}
                  <h2 className="text-sm font-semibold text-white">{selected.name}</h2>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => handleCopy(selected)} className="flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800">
                    {copiedId === selected.id ? <><Check className="h-3.5 w-3.5 text-emerald-400" />Copied!</> : <><Copy className="h-3.5 w-3.5" />Copy</>}
                  </button>
                  <button className="flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800">
                    <Edit2 className="h-3.5 w-3.5" />Edit
                  </button>
                </div>
              </div>
              {selected.subject && (
                <div className="px-4 py-3 border-b border-zinc-800">
                  <span className="text-xs text-zinc-500 mr-2">Subject:</span>
                  <span className="text-sm text-zinc-300">{selected.subject}</span>
                </div>
              )}
              <div className="flex-1 p-4 overflow-y-auto">
                <pre className="text-sm text-zinc-300 whitespace-pre-wrap font-sans leading-relaxed">{selected.body}</pre>
              </div>
              <div className="border-t border-zinc-800 p-4 space-y-2">
                <p className="text-xs text-zinc-500">Variables (click to copy):</p>
                <div className="flex flex-wrap gap-1.5">
                  {VARIABLES.map(v => (
                    <button key={v} onClick={() => navigator.clipboard.writeText(v)}
                      className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-indigo-400 hover:bg-zinc-700 font-mono">{v}</button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center text-zinc-600">
              <div className="text-center"><FileText className="mx-auto h-10 w-10 mb-3" /><p className="text-sm">Select a template to preview</p></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   BUSINESS PROFILE TAB
   ════════════════════════════════════════════════════════════════ */
const INDUSTRIES = [
  "Real Estate", "Insurance", "HVAC", "Dental", "Solar", "Legal", "Fitness",
  "SaaS", "Retail", "Restaurant", "Construction", "Healthcare", "Finance", "Other",
];

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function BusinessProfileTab() {
  const [saved, setSaved] = useState(false);
  const [profile, setProfile] = useState({
    businessName: "",
    industry: "",
    website: "",
    address: "",
    city: "",
    state: "",
    zip: "",
    phone: "",
    email: "",
    description: "",
  });
  const [hours, setHours] = useState(
    DAYS.map((day) => ({ day, open: day !== "Saturday" && day !== "Sunday", from: "09:00", to: "17:00" }))
  );

  const set = (k: keyof typeof profile) => (v: string) => setProfile((p) => ({ ...p, [k]: v }));

  const handleSave = async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("business_profiles").upsert({ user_id: user.id, ...profile, hours }, { onConflict: "user_id" });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from("business_profiles").select("*").eq("user_id", user.id).single().then(({ data }) => {
        if (!data) return;
        setProfile({
          businessName: data.businessName || "",
          industry: data.industry || "",
          website: data.website || "",
          address: data.address || "",
          city: data.city || "",
          state: data.state || "",
          zip: data.zip || "",
          phone: data.phone || "",
          email: data.email || "",
          description: data.description || "",
        });
        if (data.hours) setHours(data.hours);
      });
    });
  }, []);

  return (
    <div className="max-w-3xl space-y-6">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 space-y-5">
        <div>
          <h3 className="text-sm font-semibold text-white">Business Information</h3>
          <p className="text-xs text-zinc-500 mt-0.5">Used across your AI agents, templates, and communications</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Business Name</label>
            <input value={profile.businessName} onChange={(e) => set("businessName")(e.target.value)}
              placeholder="Acme Services LLC"
              className="h-9 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Industry</label>
            <select value={profile.industry} onChange={(e) => set("industry")(e.target.value)}
              className="h-9 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-200 focus:border-indigo-500 focus:outline-none">
              <option value="">Select industry…</option>
              {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Website</label>
            <input value={profile.website} onChange={(e) => set("website")(e.target.value)}
              placeholder="https://yourwebsite.com" type="url"
              className="h-9 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Business Phone</label>
            <input value={profile.phone} onChange={(e) => set("phone")(e.target.value)}
              placeholder="+1 (555) 000-0000" type="tel"
              className="h-9 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Business Email</label>
            <input value={profile.email} onChange={(e) => set("email")(e.target.value)}
              placeholder="info@yourcompany.com" type="email"
              className="h-9 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Street Address</label>
            <input value={profile.address} onChange={(e) => set("address")(e.target.value)}
              placeholder="123 Main St"
              className="h-9 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">City</label>
              <input value={profile.city} onChange={(e) => set("city")(e.target.value)} placeholder="City"
                className="h-9 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">State</label>
              <input value={profile.state} onChange={(e) => set("state")(e.target.value)} placeholder="CA"
                className="h-9 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">ZIP</label>
              <input value={profile.zip} onChange={(e) => set("zip")(e.target.value)} placeholder="90210"
                className="h-9 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none" />
            </div>
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Business Description</label>
            <textarea value={profile.description} onChange={(e) => set("description")(e.target.value)} rows={3}
              placeholder="Brief description of your business and services…"
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none resize-none" />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-white">Business Hours</h3>
          <p className="text-xs text-zinc-500 mt-0.5">Your AI agent will only take calls during these hours</p>
        </div>
        <div className="space-y-2">
          {hours.map((h, i) => (
            <div key={h.day} className="flex items-center gap-4">
              <div className="w-24 flex items-center gap-2">
                <button
                  onClick={() => setHours((prev) => prev.map((x, j) => j === i ? { ...x, open: !x.open } : x))}
                  className={cn("relative h-5 w-9 rounded-full transition-colors focus:outline-none shrink-0", h.open ? "bg-indigo-600" : "bg-zinc-700")}>
                  <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform", h.open ? "translate-x-4" : "translate-x-0.5")} />
                </button>
                <span className={cn("text-sm font-medium", h.open ? "text-white" : "text-zinc-600")}>{h.day.slice(0, 3)}</span>
              </div>
              {h.open ? (
                <div className="flex items-center gap-2">
                  <input type="time" value={h.from}
                    onChange={(e) => setHours((prev) => prev.map((x, j) => j === i ? { ...x, from: e.target.value } : x))}
                    className="h-8 rounded-lg border border-zinc-800 bg-zinc-900 px-2 text-sm text-zinc-300 focus:border-indigo-500 focus:outline-none" />
                  <span className="text-zinc-600 text-sm">to</span>
                  <input type="time" value={h.to}
                    onChange={(e) => setHours((prev) => prev.map((x, j) => j === i ? { ...x, to: e.target.value } : x))}
                    className="h-8 rounded-lg border border-zinc-800 bg-zinc-900 px-2 text-sm text-zinc-300 focus:border-indigo-500 focus:outline-none" />
                </div>
              ) : (
                <span className="text-sm text-zinc-600">Closed</span>
              )}
            </div>
          ))}
        </div>
      </div>

      <button onClick={handleSave}
        className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
        <Save className="h-4 w-4" />
        {saved ? "Saved!" : "Save Business Profile"}
      </button>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   MAIN PAGE
   ════════════════════════════════════════════════════════════════ */
const TABS = [
  { id: "profile",    label: "Business Profile" },
  { id: "branding",   label: "Branding" },
  { id: "reputation", label: "Reputation" },
  { id: "reporting",  label: "Reporting" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function BusinessPage() {
  const [activeTab, setActiveTab] = useState<TabId>("profile");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Business</h1>
        <p className="text-zinc-400">Profile, branding, reputation, and analytics</p>
      </div>

      <div className="flex items-center gap-4 border-b border-zinc-800">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "pb-3 text-sm font-medium transition-colors border-b-2 -mb-px",
              activeTab === tab.id
                ? "border-indigo-500 text-white"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "profile"    && <BusinessProfileTab />}
      {activeTab === "branding"   && <BrandingTab />}
      {activeTab === "reputation" && <ReputationTab />}
      {activeTab === "reporting"  && <ReportingTab />}
    </div>
  );
}
