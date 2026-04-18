"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  CreditCard, Zap, Phone, Users, TrendingUp, FileText, ExternalLink,
  DollarSign, Plus, ArrowUpRight, Trash2, Edit2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useInvoices, deleteInvoice } from "@/hooks/use-payments";
import { InvoiceDialog } from "../payments/invoice-dialog";
import type { Invoice } from "@/types/database";

/* ─── Payment helpers ─── */
function PaymentStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
    sent: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    paid: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    overdue: "bg-red-500/10 text-red-400 border-red-500/20",
    void: "bg-zinc-500/10 text-zinc-600 border-zinc-700",
  };
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize", map[status] || map.draft)}>
      {status}
    </span>
  );
}

function fmtCents(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

const PAYMENT_STATUS_TABS = ["all", "draft", "sent", "paid", "overdue"] as const;

/* ─── Overview Tab ─── */
function OverviewTab() {
  const supabase = createClient();
  const [usage, setUsage] = useState({
    aiMinutesUsed: 0,
    aiMinutesLimit: 500,
    callsThisMonth: 0,
    totalContacts: 0,
  });
  const [planInfo, setPlanInfo] = useState({ name: "Growth", price: 297 });
  const [invoices, setInvoices] = useState<{ id: string; date: string; description: string; amount: string; status: string }[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const aiRes = await fetch("/api/ai-minutes");
        const aiData = await aiRes.json();
        setUsage(prev => ({
          ...prev,
          aiMinutesUsed: aiData.used || 0,
          aiMinutesLimit: aiData.limit || 500,
        }));

        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: agency } = await supabase
            .from("agencies")
            .select("id, plan, name")
            .eq("user_id", user.id)
            .single();

          const startOfMonth = new Date();
          startOfMonth.setDate(1);
          startOfMonth.setHours(0, 0, 0, 0);
          const { count: callCount } = await supabase
            .from("calls")
            .select("*", { count: "exact", head: true })
            .gte("created_at", startOfMonth.toISOString());

          const { count: contactCount } = await supabase
            .from("contacts")
            .select("*", { count: "exact", head: true });

          setUsage(prev => ({
            ...prev,
            callsThisMonth: callCount || 0,
            totalContacts: contactCount || 0,
          }));

          if (agency) {
            const planName = agency.plan === "wl_growth" ? "Growth" : agency.plan === "wl_agency" ? "Agency" : "Starter";
            const planPrice = agency.plan === "wl_growth" ? 297 : agency.plan === "wl_agency" ? 497 : 97;
            setPlanInfo({ name: planName, price: planPrice });
          }

          const { data: invoiceData } = await supabase
            .from("agency_invoices")
            .select("*")
            .eq("agency_id", agency?.id || "")
            .order("created_at", { ascending: false });

          if (invoiceData && invoiceData.length > 0) {
            setInvoices(invoiceData.map((inv: any) => ({
              id: inv.id,
              date: new Date(inv.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }),
              description: `${inv.plan_name || planInfo.name} Plan — ${new Date(inv.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long" })}`,
              amount: `$${(inv.amount / 100).toFixed(2)}`,
              status: inv.status || "Paid",
            })));
          }
        }
      } catch (error) {
        console.error("Error fetching billing data:", error);
      }
    };
    fetchData();
  }, [supabase]);

  const minutesPct = usage.aiMinutesLimit > 0 ? Math.min((usage.aiMinutesUsed / usage.aiMinutesLimit) * 100, 100) : 0;
  const minutesColor = minutesPct >= 90 ? "bg-red-500" : minutesPct >= 70 ? "bg-amber-500" : "bg-indigo-600";

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Current plan */}
      <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <span className="text-lg font-bold text-white">{planInfo.name} Plan</span>
              <span className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-0.5 text-xs font-semibold text-indigo-400">Active</span>
            </div>
            <p className="text-sm text-zinc-400">${planInfo.price}/month · Renews on {new Date(new Date().getFullYear(), new Date().getMonth() + 1, 11).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}</p>
          </div>
          <Link href="/pricing" className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            <TrendingUp className="h-4 w-4" />Upgrade Plan
          </Link>
        </div>
      </div>

      {/* Usage stats */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 space-y-5">
        <h2 className="text-sm font-semibold text-white">This Month&apos;s Usage</h2>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-zinc-300">
              <Zap className="h-4 w-4 text-indigo-400" />AI Call Minutes
            </div>
            <span className="text-sm font-medium text-white">{usage.aiMinutesUsed} / {usage.aiMinutesLimit} min</span>
          </div>
          <div className="h-2 rounded-full bg-zinc-800">
            <div className={`h-2 rounded-full transition-all ${minutesColor}`} style={{ width: `${minutesPct}%` }} />
          </div>
          <p className="text-xs text-zinc-500">{usage.aiMinutesLimit - usage.aiMinutesUsed} minutes remaining · Overage billed at $0.15/min</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {[
            { label: "Calls This Month", value: usage.callsThisMonth, icon: Phone, color: "text-blue-400" },
            { label: "Total Contacts", value: usage.totalContacts, icon: Users, color: "text-emerald-400" },
          ].map(s => (
            <div key={s.label} className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
              <div className="flex items-center gap-2 text-xs text-zinc-500 mb-1">
                <s.icon className={`h-3.5 w-3.5 ${s.color}`} />{s.label}
              </div>
              <p className="text-2xl font-bold text-white">{s.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Payment method */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-white">Payment Method</h2>
          <a href="https://dashboard.stripe.com/settings/billing/overview" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-indigo-400 hover:text-indigo-300">
            <ExternalLink className="h-3.5 w-3.5" />Manage in Stripe
          </a>
        </div>
        <p className="text-sm text-zinc-400">Manage your payment method securely in Stripe.</p>
      </div>

      {/* Invoice history */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-white">Invoice History</h2>
        </div>
        {invoices.length === 0 ? (
          <p className="text-sm text-zinc-400">No invoices yet</p>
        ) : (
          <div className="rounded-lg border border-zinc-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500">Description</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500"></th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="border-t border-zinc-800/50 hover:bg-zinc-800/20">
                    <td className="px-4 py-3 text-zinc-400">{inv.date}</td>
                    <td className="px-4 py-3 text-white">{inv.description}</td>
                    <td className="px-4 py-3 text-white font-medium">{inv.amount}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400">{inv.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      <button className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300">
                        <FileText className="h-3.5 w-3.5" />PDF
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Payments Tab ─── */
function PaymentsTab() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [editInvoice, setEditInvoice] = useState<Invoice | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<"invoices" | "transactions">("invoices");

  const { invoices, loading, refetch } = useInvoices({ status: statusFilter === "all" ? undefined : statusFilter });

  const totalRevenue = invoices.filter(i => i.status === "paid").reduce((s, i) => s + (i.total || 0), 0);
  const outstanding = invoices.filter(i => i.status === "sent").reduce((s, i) => s + (i.total || 0), 0);
  const overdue = invoices.filter(i => i.status === "overdue").reduce((s, i) => s + (i.total || 0), 0);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this invoice?")) return;
    await deleteInvoice(id);
    refetch();
  };

  return (
    <div className="space-y-6">
      {/* Actions */}
      <div className="flex items-center justify-end">
        <button onClick={() => { setEditInvoice(null); setShowCreate(true); }}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
          <Plus className="h-4 w-4" />Create Invoice
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Total Revenue", value: fmtCents(totalRevenue), icon: DollarSign, color: "text-emerald-400" },
          { label: "Outstanding", value: fmtCents(outstanding), icon: FileText, color: "text-blue-400" },
          { label: "Paid Invoices", value: invoices.filter(i => i.status === "paid").length, icon: CreditCard, color: "text-indigo-400" },
          { label: "Overdue", value: fmtCents(overdue), icon: ArrowUpRight, color: "text-red-400" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{s.label}</p>
                <p className="mt-2 text-2xl font-bold text-white">{s.value}</p>
              </div>
              <s.icon className={cn("h-5 w-5 mt-0.5", s.color)} />
            </div>
          </div>
        ))}
      </div>

      {/* Sub-tab nav */}
      <div className="flex items-center gap-4 border-b border-zinc-800">
        {(["invoices", "transactions"] as const).map((tab) => (
          <button key={tab} onClick={() => setActiveSubTab(tab)}
            className={cn("pb-3 text-sm font-medium capitalize transition-colors border-b-2 -mb-px",
              activeSubTab === tab ? "border-indigo-500 text-white" : "border-transparent text-zinc-500 hover:text-zinc-300")}>
            {tab}
          </button>
        ))}
      </div>

      {activeSubTab === "invoices" && (
        <>
          {/* Status filter */}
          <div className="flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900 p-0.5 w-fit">
            {PAYMENT_STATUS_TABS.map((tab) => (
              <button key={tab} onClick={() => setStatusFilter(tab)}
                className={cn("rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                  statusFilter === tab ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-200")}>
                {tab === "all" ? "All" : tab}
              </button>
            ))}
          </div>

          {/* Table */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-800">
                  {["Invoice", "Contact", "Amount", "Status", "Issue Date", "Due Date", "Actions"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {loading ? (
                  <tr><td colSpan={7} className="px-4 py-16 text-center">
                    <div className="flex items-center justify-center gap-2 text-zinc-500">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-600 border-t-indigo-500" />Loading...
                    </div>
                  </td></tr>
                ) : invoices.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-20 text-center">
                    <div className="flex flex-col items-center gap-3 text-zinc-600">
                      <DollarSign className="h-10 w-10" />
                      <p className="text-sm font-medium">No invoices yet</p>
                      <button onClick={() => setShowCreate(true)}
                        className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700">
                        <Plus className="h-3.5 w-3.5" />Create Invoice
                      </button>
                    </div>
                  </td></tr>
                ) : invoices.map((inv) => (
                  <tr key={inv.id} className="group hover:bg-zinc-800/30">
                    <td className="px-4 py-3 text-sm font-mono font-medium text-indigo-400">{inv.invoice_number}</td>
                    <td className="px-4 py-3 text-sm text-zinc-400">{inv.contact_id ? "Contact" : "—"}</td>
                    <td className="px-4 py-3 text-sm font-medium text-white">{fmtCents(inv.total || 0)}</td>
                    <td className="px-4 py-3"><PaymentStatusBadge status={inv.status} /></td>
                    <td className="px-4 py-3 text-sm text-zinc-500">{new Date(inv.issue_date).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-sm text-zinc-500">{inv.due_date ? new Date(inv.due_date).toLocaleDateString() : "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => { setEditInvoice(inv); setShowCreate(true); }}
                          className="rounded p-1 text-zinc-500 hover:bg-zinc-700 hover:text-white"><Edit2 className="h-4 w-4" /></button>
                        <button onClick={() => handleDelete(inv.id)}
                          className="rounded p-1 text-zinc-500 hover:bg-red-500/10 hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {activeSubTab === "transactions" && (
        <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/50">
          <div className="text-center text-zinc-600">
            <CreditCard className="mx-auto h-10 w-10" />
            <p className="mt-3 text-sm font-medium text-zinc-400">Transaction history</p>
            <p className="mt-1 text-xs">Connect a payment processor to see transactions</p>
          </div>
        </div>
      )}

      {showCreate && (
        <InvoiceDialog
          invoice={editInvoice}
          onClose={() => { setShowCreate(false); setEditInvoice(null); }}
          onSaved={() => { setShowCreate(false); setEditInvoice(null); refetch(); }}
        />
      )}
    </div>
  );
}

/* ─── Main Page ─── */
const TABS = [
  { id: "overview", label: "Overview" },
  { id: "payments", label: "Payments" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function BillingPage() {
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Billing</h1>
        <p className="text-zinc-400">Manage your plan, usage, invoices, and payments</p>
      </div>

      {/* Tabs */}
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

      {/* Tab content */}
      {activeTab === "overview" && <OverviewTab />}
      {activeTab === "payments" && <PaymentsTab />}
    </div>
  );
}
