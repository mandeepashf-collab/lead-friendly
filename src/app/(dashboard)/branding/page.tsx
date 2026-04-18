"use client";

import { useState } from "react";
import { Palette, Save, Upload, CheckCircle2, Globe, RefreshCw, ExternalLink, ShieldCheck, AlertCircle } from "lucide-react";

const PRESET_COLORS = [
  { name: "Indigo", primary: "#6366f1", accent: "#4f46e5" },
  { name: "Emerald", primary: "#10b981", accent: "#059669" },
  { name: "Sky", primary: "#0ea5e9", accent: "#0284c7" },
  { name: "Violet", primary: "#8b5cf6", accent: "#7c3aed" },
  { name: "Rose", primary: "#f43f5e", accent: "#e11d48" },
  { name: "Amber", primary: "#f59e0b", accent: "#d97706" },
];

type Tab = "branding" | "domain";

export default function BrandingPage() {
  const [tab, setTab] = useState<Tab>("branding");
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
    footerText: "© 2026 Lead Friendly. All rights reserved.",
  });
  const [domain, setDomain] = useState({
    customDomain: "",
    subdomain: "app",
  });

  const set = (k: keyof typeof form) => (v: string) => setForm(f => ({ ...f, [k]: v }));
  const setD = (k: keyof typeof domain) => (v: string) => setDomain(d => ({ ...d, [k]: v }));

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const applyPreset = (i: number) => {
    setSelectedPreset(i);
    setForm(f => ({ ...f, primaryColor: PRESET_COLORS[i].primary, accentColor: PRESET_COLORS[i].accent }));
  };

  const checkDns = () => {
    setDomainStatus("checking");
    setTimeout(() => {
      setDomainStatus(domain.customDomain ? "verified" : "error");
    }, 2000);
  };

  const fullDomain = domain.customDomain
    ? `${domain.subdomain ? domain.subdomain + "." : ""}${domain.customDomain}`
    : "";

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Branding</h1>
          <p className="text-zinc-400">Customize your CRM's look, feel, and domain</p>
        </div>
        {tab === "branding" && (
          <button onClick={handleSave}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            {saved ? <><CheckCircle2 className="h-4 w-4" />Saved!</> : <><Save className="h-4 w-4" />Save Changes</>}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-zinc-800 bg-zinc-900/50 p-1 w-fit">
        {([["branding", "Branding"], ["domain", "Custom Domain"]] as [Tab, string][]).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              tab === key ? "bg-indigo-600 text-white" : "text-zinc-400 hover:text-white"
            }`}>
            {key === "domain" && <Globe className="h-3.5 w-3.5" />}
            {label}
          </button>
        ))}
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
          {/* Current domain */}
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
            <p className="text-xs text-zinc-500">This is your primary domain registered through IONOS. It's verified and pointing to Vercel.</p>
          </div>

          {/* Add custom domain */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-white">Add Custom Domain</h3>
            <p className="text-xs text-zinc-400">Point your own domain or subdomain to this CRM. You'll need to add a CNAME record at your DNS provider.</p>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Subdomain</label>
                <input
                  value={domain.subdomain}
                  onChange={e => setD("subdomain")(e.target.value)}
                  placeholder="app"
                  className="h-9 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-300 font-mono focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Root Domain</label>
                <input
                  value={domain.customDomain}
                  onChange={e => { setD("customDomain")(e.target.value); setDomainStatus("idle"); }}
                  placeholder="yourdomain.com"
                  className="h-9 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-300 font-mono focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>

            {fullDomain && (
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-2.5 flex items-center gap-2">
                <Globe className="h-3.5 w-3.5 text-zinc-500" />
                <span className="text-sm font-mono text-zinc-300">{fullDomain}</span>
              </div>
            )}

            {/* DNS instructions */}
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
              <button
                onClick={checkDns}
                disabled={!domain.customDomain || domainStatus === "checking"}
                className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed">
                {domainStatus === "checking"
                  ? <><RefreshCw className="h-4 w-4 animate-spin" />Checking...</>
                  : <><Globe className="h-4 w-4" />Verify DNS</>}
              </button>

              {domainStatus === "verified" && (
                <span className="flex items-center gap-1.5 text-sm text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />Domain verified!
                </span>
              )}
              {domainStatus === "error" && (
                <span className="flex items-center gap-1.5 text-sm text-rose-400">
                  <AlertCircle className="h-4 w-4" />DNS not found — check your records
                </span>
              )}
            </div>
          </div>

          {/* SSL note */}
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
