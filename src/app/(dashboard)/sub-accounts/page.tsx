"use client";
import Link from "next/link";
import { Building2, Plus, Users, Phone, TrendingUp, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

const MOCK_ACCOUNTS = [
  { id: "1", name: "Apex Mortgage Group", email: "admin@apex.com", contacts: 342, calls: 89, status: "active", plan: "Professional" },
  { id: "2", name: "Summit Real Estate", email: "owner@summit.com", contacts: 156, calls: 41, status: "active", plan: "Starter" },
  { id: "3", name: "Pacific Lending Co", email: "team@pacific.com", contacts: 891, calls: 234, status: "active", plan: "Agency" },
];

function PlanBadge({ plan }: { plan: string }) {
  const map: Record<string,string> = {
    Starter: "text-zinc-400 bg-zinc-500/10 border-zinc-500/20",
    Professional: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    Agency: "text-purple-400 bg-purple-500/10 border-purple-500/20",
  };
  return <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium", map[plan] || map.Starter)}>{plan}</span>;
}

export default function SubAccountsPage() {
  const totalContacts = MOCK_ACCOUNTS.reduce((s,a) => s + a.contacts, 0);
  const totalCalls = MOCK_ACCOUNTS.reduce((s,a) => s + a.calls, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Sub-Accounts</h1>
          <p className="text-zinc-400">Manage client accounts from one place</p>
        </div>
        <Link href="/sub-accounts/new" className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
          <Plus className="h-4 w-4" />Add Sub-Account
        </Link>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Total Accounts", value: MOCK_ACCOUNTS.length, icon: Building2, color: "text-indigo-400" },
          { label: "Active", value: MOCK_ACCOUNTS.filter(a=>a.status==="active").length, icon: TrendingUp, color: "text-emerald-400" },
          { label: "Total Contacts", value: totalContacts.toLocaleString(), icon: Users, color: "text-blue-400" },
          { label: "Calls This Month", value: totalCalls.toLocaleString(), icon: Phone, color: "text-purple-400" },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{s.label}</p>
                <p className="mt-2 text-3xl font-bold text-white">{s.value}</p>
              </div>
              <s.icon className={cn("h-5 w-5 mt-0.5", s.color)} />
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MOCK_ACCOUNTS.map(acct => (
          <div key={acct.id} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 space-y-4 hover:border-zinc-700 transition-colors">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-600/20">
                  <Building2 className="h-5 w-5 text-indigo-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-white text-sm">{acct.name}</h3>
                  <p className="text-xs text-zinc-500 mt-0.5">{acct.email}</p>
                </div>
              </div>
              <PlanBadge plan={acct.plan} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-zinc-950/50 p-2.5 text-center">
                <p className="text-lg font-bold text-white">{acct.contacts.toLocaleString()}</p>
                <p className="text-xs text-zinc-600">Contacts</p>
              </div>
              <div className="rounded-lg bg-zinc-950/50 p-2.5 text-center">
                <p className="text-lg font-bold text-white">{acct.calls}</p>
                <p className="text-xs text-zinc-600">Calls/mo</p>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-1 border-t border-zinc-800">
              <Link href={`/sub-accounts/${acct.id}`}
                className="flex items-center gap-1.5 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-700 flex-1 justify-center">
                <ExternalLink className="h-3.5 w-3.5" />Manage
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
