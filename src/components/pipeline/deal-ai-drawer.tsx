"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, Copy, RefreshCw } from "lucide-react";
import { StagePill } from "@/components/ui/stage-pill";
import { getStageTone } from "@/lib/pipeline/tones";

interface DealContext {
  deal: { name: string; value: number; stage: string; ageDays: number; createdAt: string };
  contact: { name: string | null; email: string | null; phone: string | null } | null;
  recentCalls: Array<{
    direction: "inbound" | "outbound";
    durationSeconds: number;
    occurredAt: string;
    transcriptExcerpt: string | null;
  }>;
}

type CoachResponse = { mode: "coach"; suggestion: string; context: DealContext };
type DraftResponse = {
  mode: "draft";
  message: string;
  suggestedChannel: "email" | "sms";
  context: DealContext;
};
type ContextResponse = { mode: "context"; context: DealContext };

type Tab = "coach" | "draft" | "context";

interface CacheEntry {
  coach?: CoachResponse;
  draft?: DraftResponse;
  context?: ContextResponse;
}

interface Props {
  dealId: string | null;
  dealName: string | null;
  onClose: () => void;
}

export function DealAIDrawer({ dealId, dealName, onClose }: Props) {
  const open = dealId !== null;
  const [mounted, setMounted] = useState(false);
  const [tab, setTab] = useState<Tab>("coach");
  const [cache, setCache] = useState<Record<string, CacheEntry>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [draftEdit, setDraftEdit] = useState<string>("");
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<Element | null>(null);

  const entry = dealId ? cache[dealId] : undefined;
  const cacheKey = dealId ? `${dealId}:${tab}` : "";

  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement;
      setMounted(true);
      requestAnimationFrame(() => closeBtnRef.current?.focus());
    } else if (mounted) {
      const t = setTimeout(() => {
        setMounted(false);
        if (previousFocusRef.current instanceof HTMLElement) {
          previousFocusRef.current.focus();
        }
      }, 200);
      return () => clearTimeout(t);
    }
  }, [open, mounted]);

  useEffect(() => {
    if (dealId) {
      setTab("coach");
      setDraftEdit("");
    }
  }, [dealId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "Tab" && drawerRef.current) {
        const focusables = drawerRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const fetchTab = useCallback(
    async (mode: Tab) => {
      if (!dealId) return;
      const key = `${dealId}:${mode}`;
      setLoading((l) => ({ ...l, [key]: true }));
      setErrors((e) => ({ ...e, [key]: "" }));
      try {
        const res = await fetch("/api/pipeline/deal-ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dealId, mode }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `HTTP ${res.status}`);
        }
        const data = await res.json();
        setCache((c) => ({
          ...c,
          [dealId]: { ...(c[dealId] ?? {}), [mode]: data },
        }));
        if (mode === "draft" && data.message) setDraftEdit(data.message);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        setErrors((e) => ({ ...e, [key]: msg }));
      } finally {
        setLoading((l) => ({ ...l, [key]: false }));
      }
    },
    [dealId],
  );

  useEffect(() => {
    if (!dealId || !open) return;
    if (entry && entry[tab]) return;
    if (loading[cacheKey]) return;
    fetchTab(tab);
  }, [dealId, open, tab, entry, loading, cacheKey, fetchTab]);

  if (!mounted) return null;

  const ctxFromAny = entry?.coach?.context ?? entry?.draft?.context ?? entry?.context?.context;
  const headerStage = ctxFromAny?.deal.stage;
  const headerValue = ctxFromAny?.deal.value;

  return (
    <div className="fixed inset-0 z-50" aria-modal="true" role="dialog">
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-black/40 transition-opacity duration-150 ${open ? "opacity-100" : "opacity-0"}`}
        aria-hidden="true"
      />
      <div
        ref={drawerRef}
        className={`absolute right-0 top-0 h-full w-full sm:w-[480px] bg-zinc-950 border-l border-zinc-800 shadow-2xl transform transition-transform duration-200 flex flex-col ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800">
          <div className="flex items-baseline gap-2 min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-zinc-100 truncate">
              {dealName ?? "Deal"}
            </h2>
            {headerValue !== undefined && (
              <span className="text-xs tabular-nums text-zinc-400">
                ${headerValue.toLocaleString()}
              </span>
            )}
          </div>
          {headerStage && <StagePill tone={getStageTone(headerStage)}>{headerStage}</StagePill>}
          <button
            ref={closeBtnRef}
            onClick={onClose}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-0.5 px-4 py-2 border-b border-zinc-800">
          {(["coach", "draft", "context"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              role="tab"
              aria-selected={tab === t}
              className={`rounded px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                tab === t
                  ? "bg-[var(--violet-bg)] text-[var(--violet-primary)]"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {tab === "coach" && (
            <CoachPanel
              loading={!!loading[`${dealId}:coach`]}
              error={errors[`${dealId}:coach`]}
              data={entry?.coach}
              onRetry={() => fetchTab("coach")}
            />
          )}
          {tab === "draft" && (
            <DraftPanel
              loading={!!loading[`${dealId}:draft`]}
              error={errors[`${dealId}:draft`]}
              data={entry?.draft}
              draftEdit={draftEdit}
              setDraftEdit={setDraftEdit}
              onRegenerate={() => fetchTab("draft")}
            />
          )}
          {tab === "context" && (
            <ContextPanel
              loading={!!loading[`${dealId}:context`]}
              error={errors[`${dealId}:context`]}
              data={entry?.context}
              onRetry={() => fetchTab("context")}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function Spinner({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-zinc-400">
      <span className="inline-block h-3 w-3 rounded-full border-2 border-zinc-700 border-t-zinc-300 animate-spin" />
      {label}
    </div>
  );
}

function ErrorBox({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="rounded border border-red-500/30 bg-red-500/10 p-3 space-y-2">
      <p className="text-sm text-red-300">{error}</p>
      <button onClick={onRetry} className="text-xs underline text-red-300 hover:text-red-200">
        Retry
      </button>
    </div>
  );
}

function CoachPanel({
  loading,
  error,
  data,
  onRetry,
}: {
  loading: boolean;
  error?: string;
  data?: CoachResponse;
  onRetry: () => void;
}) {
  if (loading) return <Spinner label="Thinking..." />;
  if (error) return <ErrorBox error={error} onRetry={onRetry} />;
  if (!data) return null;
  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-100 whitespace-pre-wrap leading-relaxed">{data.suggestion}</p>
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
      >
        <RefreshCw className="h-3 w-3" />
        Regenerate
      </button>
    </div>
  );
}

function DraftPanel({
  loading,
  error,
  data,
  draftEdit,
  setDraftEdit,
  onRegenerate,
}: {
  loading: boolean;
  error?: string;
  data?: DraftResponse;
  draftEdit: string;
  setDraftEdit: (s: string) => void;
  onRegenerate: () => void;
}) {
  const [copied, setCopied] = useState(false);
  if (loading) return <Spinner label="Drafting..." />;
  if (error) return <ErrorBox error={error} onRetry={onRegenerate} />;
  if (!data) return null;
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(draftEdit);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked — silent fail
    }
  };
  return (
    <div className="space-y-3">
      <span className="inline-block rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider bg-[var(--violet-bg)] text-[var(--violet-primary)]">
        {data.suggestedChannel}
      </span>
      <textarea
        value={draftEdit}
        onChange={(e) => setDraftEdit(e.target.value)}
        rows={data.suggestedChannel === "sms" ? 4 : 12}
        className="w-full rounded border border-zinc-800 bg-zinc-900 p-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-[var(--violet-primary)]/50"
      />
      <div className="flex items-center gap-2">
        <button
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs bg-[var(--violet-bg)] text-[var(--violet-primary)] hover:bg-[var(--violet-border)] transition-colors"
        >
          <Copy className="h-3 w-3" />
          {copied ? "Copied!" : "Copy"}
        </button>
        <button
          onClick={onRegenerate}
          className="inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
        >
          <RefreshCw className="h-3 w-3" />
          Regenerate
        </button>
      </div>
    </div>
  );
}

function ContextPanel({
  loading,
  error,
  data,
  onRetry,
}: {
  loading: boolean;
  error?: string;
  data?: ContextResponse;
  onRetry: () => void;
}) {
  if (loading) return <Spinner label="Loading context..." />;
  if (error) return <ErrorBox error={error} onRetry={onRetry} />;
  if (!data) return null;
  const ctx = data.context;
  return (
    <div className="space-y-5">
      <Section title="Deal">
        <Row label="Name" value={ctx.deal.name} />
        <Row label="Value" value={`$${ctx.deal.value.toLocaleString()}`} />
        <div className="flex items-baseline justify-between gap-2 py-1">
          <span className="text-xs uppercase tracking-wider text-zinc-500">Stage</span>
          <StagePill tone={getStageTone(ctx.deal.stage)}>{ctx.deal.stage}</StagePill>
        </div>
        <Row label="Age" value={`${ctx.deal.ageDays} days`} />
      </Section>
      <Section title="Contact">
        {ctx.contact ? (
          <>
            <Row label="Name" value={ctx.contact.name ?? "—"} />
            <Row label="Email" value={ctx.contact.email ?? "—"} />
            <Row label="Phone" value={ctx.contact.phone ?? "—"} />
          </>
        ) : (
          <p className="text-sm text-zinc-500">No contact assigned.</p>
        )}
      </Section>
      <Section title="Recent calls">
        {ctx.recentCalls.length === 0 ? (
          <p className="text-sm text-zinc-500">No calls logged for this contact.</p>
        ) : (
          <ul className="space-y-3">
            {ctx.recentCalls.map((call, i) => (
              <CallItem key={i} call={call} />
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-xs uppercase tracking-wider text-zinc-500 mb-2">{title}</h3>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-1">
      <span className="text-xs uppercase tracking-wider text-zinc-500">{label}</span>
      <span className="text-sm text-zinc-300 truncate">{value}</span>
    </div>
  );
}

function CallItem({
  call,
}: {
  call: {
    direction: string;
    durationSeconds: number;
    occurredAt: string;
    transcriptExcerpt: string | null;
  };
}) {
  const [expanded, setExpanded] = useState(false);
  const [now] = useState(() => Date.now());
  const formatDuration = (s: number) => {
    if (!s) return "0s";
    const m = Math.floor(s / 60);
    const sec = Math.round(s % 60);
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  };
  const formatRelative = (iso: string) => {
    if (!iso) return "—";
    const days = Math.floor((now - new Date(iso).getTime()) / 86400000);
    if (days === 0) return "today";
    if (days === 1) return "yesterday";
    if (days < 7) return `${days}d ago`;
    return new Date(iso).toLocaleDateString();
  };
  const excerpt = call.transcriptExcerpt;
  const isLong = !!excerpt && excerpt.length > 200;
  const visible = excerpt && !isLong ? excerpt : excerpt && expanded ? excerpt : excerpt?.slice(0, 200);
  return (
    <li className="rounded border border-zinc-800 bg-zinc-900/50 p-3 space-y-1">
      <div className="flex items-center justify-between text-xs text-zinc-400">
        <span className="capitalize">{call.direction}</span>
        <span>
          {formatDuration(call.durationSeconds)} · {formatRelative(call.occurredAt)}
        </span>
      </div>
      {excerpt && (
        <div>
          <p className="text-xs text-zinc-300 leading-relaxed">
            {visible}
            {isLong && !expanded ? "…" : ""}
          </p>
          {isLong && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-xs text-[var(--violet-primary)] hover:underline mt-1"
            >
              {expanded ? "Show less" : "Read more"}
            </button>
          )}
        </div>
      )}
    </li>
  );
}
