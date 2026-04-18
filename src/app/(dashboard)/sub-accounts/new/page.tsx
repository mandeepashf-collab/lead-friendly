"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Save, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function NewSubAccountPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({ company: "", ownerName: "", email: "", phone: "", plan: "starter", callLimit: 500, whiteLabel: false });
  const set = (k: keyof typeof form) => (v: string | number | boolean) => setForm(f => ({...f,[k]:v}));

  const handleSave = async () => {
    if (!form.company || !form.email) { alert("Company name and email are required"); return; }
    setSaving(true);
    await new Promise(r => setTimeout(r, 800)); // simulate save
    setSaved(true);
    setTimeout(() => router.push("/sub-accounts"), 1200);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/sub-accounts")} className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white">
            <ArrowLeft className="h-4 w-4" />Back
          </button>
          <div className="h-4 w-px bg-zinc-700" />
          <h1 className="text-2xl font-bold text-white">New Sub-Account</h1>
        </div>
        <button onClick={handleSave} disabled={saving}
          className={cn("flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium",
            saved ? "bg-emerald-600 text-white" : "bg-indigo-600 text-white hover:bg-indigo-700")}>
          {saved ? <><CheckCircle2 className="h-4 w-4" />Created!</> : <><Save className="h-4 w-4" />Create Account</>}
        </button>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 space-y-5">
        <h3 className="text-sm font-semibold text-white">Account Details</h3>
        {[
          { label: "Company Name *", key: "company" as const, placeholder: "Apex Mortgage Group" },
          { label: "Owner Name", key: "ownerName" as const, placeholder: "John Smith" },
          { label: "Owner Email *", key: "email" as const, placeholder: "john@company.com", type: "email" },
          { label: "Phone", key: "phone" as const, placeholder: "+15551234567" },
        ].map(f => (
          <div key={f.key}>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">{f.label}</label>
            <input type={f.type || "text"} value={form[f.key] as string} onChange={e => set(f.key)(e.target.value)}
              placeholder={f.placeholder}
              className="h-10 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-300 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none" />
          </div>
        ))}

        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">Plan</label>
          <div className="grid grid-cols-3 gap-3">
            {[
              { id: "starter", label: "Starter", price: "$97/mo", features: "500 AI mins · 1 agent" },
              { id: "professional", label: "Professional", price: "$197/mo", features: "2,000 AI mins · 5 agents" },
              { id: "agency", label: "Agency", price: "$397/mo", features: "Unlimited · 20 agents" },
            ].map(p => (
              <button key={p.id} onClick={() => set("plan")(p.id)}
                className={cn("text-left rounded-xl border p-3 transition-all",
                  form.plan === p.id ? "border-indigo-500 bg-indigo-500/10" : "border-zinc-800 hover:border-zinc-700")}>
                <p className="text-sm font-semibold text-white">{p.label}</p>
                <p className="text-xs text-indigo-400 mt-0.5">{p.price}</p>
                <p className="text-xs text-zinc-600 mt-1">{p.features}</p>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-2">
            Monthly Call Limit: <span className="text-indigo-400">{form.callLimit.toLocaleString()} mins</span>
          </label>
          <input type="range" min={100} max={10000} step={100} value={form.callLimit}
            onChange={e => set("callLimit")(Number(e.target.value))} className="w-full accent-indigo-500" />
        </div>

        <div className="flex items-center justify-between rounded-lg border border-zinc-800 p-3">
          <div>
            <p className="text-sm font-medium text-zinc-300">Allow White Labeling</p>
            <p className="text-xs text-zinc-600">Client can customize branding</p>
          </div>
          <button type="button" onClick={() => set("whiteLabel")(!form.whiteLabel)}
            className={cn("relative h-6 w-11 rounded-full transition-colors", form.whiteLabel ? "bg-indigo-600" : "bg-zinc-700")}>
            <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform", form.whiteLabel ? "translate-x-5" : "translate-x-0.5")} />
          </button>
        </div>
      </div>
    </div>
  );
}
