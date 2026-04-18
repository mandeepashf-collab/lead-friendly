"use client";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Building2, Phone, Users, TrendingUp } from "lucide-react";

const MOCK_ACCOUNTS: Record<string,{name:string;email:string;contacts:number;calls:number;plan:string;status:string}> = {
  "1": { name: "Apex Mortgage Group", email: "admin@apex.com", contacts: 342, calls: 89, plan: "Professional", status: "active" },
  "2": { name: "Summit Real Estate", email: "owner@summit.com", contacts: 156, calls: 41, plan: "Starter", status: "active" },
  "3": { name: "Pacific Lending Co", email: "team@pacific.com", contacts: 891, calls: 234, plan: "Agency", status: "active" },
};

export default function SubAccountDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === "string" ? params.id : "";
  const acct = MOCK_ACCOUNTS[id];

  if (!acct) return (
    <div className="flex flex-col items-center justify-center py-40 gap-4">
      <p className="text-zinc-400">Account not found</p>
      <button onClick={() => router.push("/sub-accounts")} className="text-sm text-indigo-400">← Back</button>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => router.push("/sub-accounts")} className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white">
          <ArrowLeft className="h-4 w-4" />Back
        </button>
        <div className="h-4 w-px bg-zinc-700" />
        <div>
          <h1 className="text-2xl font-bold text-white">{acct.name}</h1>
          <p className="text-zinc-500 text-sm">{acct.email} · {acct.plan}</p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Contacts", value: acct.contacts, icon: Users, color: "text-indigo-400" },
          { label: "Calls/Month", value: acct.calls, icon: Phone, color: "text-blue-400" },
          { label: "Answer Rate", value: "72%", icon: TrendingUp, color: "text-emerald-400" },
          { label: "Appointments", value: 12, icon: Building2, color: "text-purple-400" },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{s.label}</p>
                <p className="mt-2 text-3xl font-bold text-white">{s.value}</p>
              </div>
              <s.icon className={`h-5 w-5 mt-0.5 ${s.color}`} />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 space-y-3">
          <h3 className="text-sm font-semibold text-white">Account Info</h3>
          {[["Plan", acct.plan],["Status", acct.status],["Email", acct.email]].map(([l,v]) => (
            <div key={l} className="flex justify-between text-sm py-1.5 border-b border-zinc-800">
              <span className="text-zinc-500">{l}</span>
              <span className="text-white capitalize">{v}</span>
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 space-y-3">
          <h3 className="text-sm font-semibold text-white">Quick Actions</h3>
          <button className="w-full rounded-lg border border-zinc-700 px-4 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800 text-left">
            View Contacts →
          </button>
          <button className="w-full rounded-lg border border-zinc-700 px-4 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800 text-left">
            View Call History →
          </button>
          <button className="w-full rounded-lg border border-zinc-700 px-4 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800 text-left">
            Manage AI Agents →
          </button>
          <button className="w-full rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-2.5 text-sm text-amber-400 hover:bg-amber-500/10 text-left">
            Suspend Account
          </button>
        </div>
      </div>
    </div>
  );
}
