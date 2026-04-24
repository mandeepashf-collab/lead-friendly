"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

const PAGE_SIZE = 25;

type AuditRow = {
  id: string;
  created_at: string;
  user_name: string | null;
  resource_name: string | null;
  details: {
    codes?: string[];
    note?: string | null;
    path?: string;
    contact_timezone?: string;
  } | null;
};

export default function ComplianceAuditPage() {
  const supabase = createClient();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) {
      setLoading(false);
      return;
    }

    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, count, error } = await supabase
      .from("audit_logs")
      .select("id,created_at,user_name,resource_name,details", { count: "exact" })
      .eq("organization_id", profile.organization_id)
      .eq("action", "overridden")
      .eq("resource_type", "call")
      .order("created_at", { ascending: false })
      .range(from, to);

    if (!error && data) {
      setRows(data as AuditRow[]);
      setTotal(count ?? 0);
    }
    setLoading(false);
  }, [supabase, page]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Override log</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Every time a user overrode a compliance warning to place a call.
          </p>
        </div>
        <Link
          href="/settings/compliance"
          className="text-sm text-indigo-400 hover:text-indigo-300"
        >
          ← Back to Compliance
        </Link>
      </div>

      <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/50">
        <table className="min-w-full divide-y divide-zinc-800">
          <thead className="bg-zinc-950/40">
            <tr>
              <Th>When</Th>
              <Th>User</Th>
              <Th>Contact</Th>
              <Th>Warnings overridden</Th>
              <Th>Note</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-zinc-500">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-zinc-500">
                  No overrides yet.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="hover:bg-zinc-900/60">
                  <Td>{new Date(r.created_at).toLocaleString()}</Td>
                  <Td>{r.user_name ?? "—"}</Td>
                  <Td>{r.resource_name ?? "—"}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {(r.details?.codes ?? []).map((c) => (
                        <span
                          key={c}
                          className="rounded bg-amber-500/10 px-1.5 py-0.5 text-xs text-amber-200"
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  </Td>
                  <Td className="max-w-xs truncate text-zinc-400" title={r.details?.note ?? ""}>
                    {r.details?.note ?? "—"}
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-zinc-500">
        <span>
          Page {page + 1} of {totalPages} · {total} total
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="rounded border border-zinc-700 px-3 py-1 hover:bg-zinc-800 disabled:opacity-40"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="rounded border border-zinc-700 px-3 py-1 hover:bg-zinc-800 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
      {children}
    </th>
  );
}

function Td({ children, className, title }: { children: React.ReactNode; className?: string; title?: string }) {
  return (
    <td className={`px-4 py-2 text-sm text-zinc-200 ${className ?? ""}`} title={title}>
      {children}
    </td>
  );
}
