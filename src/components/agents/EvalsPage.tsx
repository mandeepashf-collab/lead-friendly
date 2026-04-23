"use client";

// src/components/agents/EvalsPage.tsx
//
// Real evals UI. Replaces the fully-mocked version that shipped with DEFAULT_EVALS + Math.random().
// Props unchanged (agentId, systemPrompt) so the parent page does not need edits.
//
// Stage 2 of P1 #3. See architecture memo §4.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart2,
  CheckCircle2,
  Loader2,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  User,
  X,
  XCircle,
  AlertCircle,
  MessageSquareQuote,
  ChevronDown,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Types — mirror the API GET response
// ─────────────────────────────────────────────────────────────────────────────

interface EvalRow {
  id: string;
  agent_id: string;
  title: string;
  criterion: string;
  source: "user" | "ai_generated" | "from_annotation";
  source_ref: string | null;
  generation_batch_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  latest_run: {
    verdict: "PASS" | "FAIL" | "INCONCLUSIVE";
    reason: string;
    created_at: string;
  } | null;
}

interface CallOption {
  id: string;
  label: string;    // "Apr 23, 2:04 PM — 74s — Brandon → +1253..."
  duration: number;
  has_transcript: boolean;
}

interface Props {
  agentId: string;
  systemPrompt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function EvalsPage({ agentId, systemPrompt }: Props) {
  const [evals, setEvals] = useState<EvalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Inline form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formCriterion, setFormCriterion] = useState("");
  const [saving, setSaving] = useState(false);

  // Run state (per-eval)
  const [runningEvalId, setRunningEvalId] = useState<string | null>(null);
  const [runPickerOpenFor, setRunPickerOpenFor] = useState<string | null>(null);
  const [callOptions, setCallOptions] = useState<CallOption[]>([]);
  const [callsLoading, setCallsLoading] = useState(false);

  // Generation state
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  // ───── Fetchers ─────

  const loadEvals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/agents/${agentId}/evals`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setEvals(data.evals ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    loadEvals();
  }, [loadEvals]);

  // ───── Actions ─────

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormTitle("");
    setFormCriterion("");
  };

  const openNewForm = () => {
    setEditingId(null);
    setFormTitle("");
    setFormCriterion("");
    setShowForm(true);
  };

  const openEditForm = (ev: EvalRow) => {
    setEditingId(ev.id);
    setFormTitle(ev.title);
    setFormCriterion(ev.criterion);
    setShowForm(true);
  };

  const saveEval = async () => {
    const title = formTitle.trim();
    const criterion = formCriterion.trim();
    if (title.length < 2 || criterion.length < 10) {
      setError(
        "Title must be at least 2 characters and criterion at least 10 characters.",
      );
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = editingId
        ? await fetch(`/api/evals/${editingId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title, criterion }),
          })
        : await fetch(`/api/agents/${agentId}/evals`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title, criterion, source: "user" }),
          });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      resetForm();
      await loadEvals();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const deleteEval = async (evalId: string) => {
    if (!confirm("Delete this eval? Past run results will be preserved.")) return;
    try {
      const res = await fetch(`/api/evals/${evalId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      await loadEvals();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const generateStarterEvals = async (replaceLast = false) => {
    setGenerating(true);
    setGenError(null);
    try {
      const res = await fetch(`/api/agents/${agentId}/evals/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ replaceLastBatch: replaceLast }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      await loadEvals();
    } catch (e) {
      setGenError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  };

  const openRunPicker = async (evalId: string) => {
    setRunPickerOpenFor(evalId);
    setCallsLoading(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/recent-calls?limit=20`);
      if (res.ok) {
        const body = await res.json();
        const opts: CallOption[] = (body.calls ?? []).map((c: any) => ({
          id: c.id,
          label: formatCallLabel(c),
          duration: c.duration_seconds ?? 0,
          has_transcript: true,
        }));
        setCallOptions(opts);
      } else {
        setCallOptions([]);
      }
    } catch {
      setCallOptions([]);
    } finally {
      setCallsLoading(false);
    }
  };

  const runEval = async (evalId: string, callId: string) => {
    setRunningEvalId(evalId);
    setRunPickerOpenFor(null);
    try {
      const res = await fetch(`/api/evals/${evalId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      await loadEvals();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunningEvalId(null);
    }
  };

  // ───── Derived ─────

  const hasInstructions = (systemPrompt?.trim().length ?? 0) >= 20;
  const isEmpty = !loading && evals.length === 0;

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full p-6 text-white bg-zinc-950">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2">
            <BarChart2 size={20} className="text-indigo-400" />
            <h2 className="text-xl font-semibold">Evals</h2>
          </div>
          <p className="mt-1 text-sm text-zinc-400">
            Plain-English criteria judged by Claude against real call transcripts. PASS / FAIL / INCONCLUSIVE.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isEmpty && (
            <>
              <button
                onClick={() => generateStarterEvals(false)}
                disabled={generating || !hasInstructions}
                title={
                  !hasInstructions
                    ? "Agent needs a system prompt before we can generate evals"
                    : "Generate more starter evals from agent instructions"
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 rounded-lg hover:bg-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {generating ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Sparkles size={14} />
                )}
                {generating ? "Generating…" : "Suggest more"}
              </button>
              <button
                onClick={openNewForm}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors"
              >
                <Plus size={14} />
                Add eval
              </button>
            </>
          )}
        </div>
      </div>

      {/* Errors */}
      {error && (
        <div className="flex items-start gap-2 p-3 mb-4 text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg">
          <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
          <div className="flex-1">{error}</div>
          <button onClick={() => setError(null)} className="text-red-300 hover:text-red-200">
            <X size={14} />
          </button>
        </div>
      )}
      {genError && (
        <div className="flex items-start gap-2 p-3 mb-4 text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg">
          <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
          <div className="flex-1">{genError}</div>
          <button onClick={() => setGenError(null)} className="text-red-300 hover:text-red-200">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center flex-1 text-zinc-500">
          <Loader2 size={20} className="animate-spin" />
          <span className="ml-2 text-sm">Loading evals…</span>
        </div>
      )}

      {/* Empty state — the killer-feature moment */}
      {isEmpty && (
        <EmptyState
          hasInstructions={hasInstructions}
          generating={generating}
          onGenerate={() => generateStarterEvals(false)}
          onManual={openNewForm}
        />
      )}

      {/* Inline form (add or edit) */}
      {showForm && (
        <EvalForm
          title={formTitle}
          criterion={formCriterion}
          editing={editingId !== null}
          saving={saving}
          onTitleChange={setFormTitle}
          onCriterionChange={setFormCriterion}
          onCancel={resetForm}
          onSave={saveEval}
        />
      )}

      {/* List */}
      {!loading && !isEmpty && (
        <div className="flex flex-col flex-1 gap-2 overflow-y-auto">
          {evals.map((ev) => (
            <EvalRowCard
              key={ev.id}
              ev={ev}
              running={runningEvalId === ev.id}
              pickerOpen={runPickerOpenFor === ev.id}
              callOptions={callOptions}
              callsLoading={callsLoading && runPickerOpenFor === ev.id}
              onRunClick={() => openRunPicker(ev.id)}
              onPickCall={(callId) => runEval(ev.id, callId)}
              onClosePicker={() => setRunPickerOpenFor(null)}
              onEdit={() => openEditForm(ev)}
              onDelete={() => deleteEval(ev.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function EmptyState({
  hasInstructions,
  generating,
  onGenerate,
  onManual,
}: {
  hasInstructions: boolean;
  generating: boolean;
  onGenerate: () => void;
  onManual: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 text-center">
      <div className="flex items-center justify-center w-16 h-16 mb-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/20">
        <Sparkles size={28} className="text-indigo-400" />
      </div>
      <h3 className="mb-2 text-lg font-semibold text-white">
        Let Claude draft your evals
      </h3>
      <p className="max-w-md mb-6 text-sm text-zinc-400">
        We ship zero opinionated evals. Give us your agent's instructions and we'll propose 5–10
        testable criteria tailored to exactly what this agent is supposed to do.
      </p>
      <div className="flex items-center gap-3">
        <button
          onClick={onGenerate}
          disabled={generating || !hasInstructions}
          title={
            !hasInstructions
              ? "Add a system prompt to the agent first"
              : undefined
          }
          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {generating ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Sparkles size={16} />
          )}
          {generating ? "Generating starter evals…" : "✨ Generate starter evals"}
        </button>
        <button
          onClick={onManual}
          className="px-4 py-2.5 text-sm text-zinc-300 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
        >
          Write your own
        </button>
      </div>
      {!hasInstructions && (
        <p className="mt-4 text-xs text-amber-400/80">
          This agent has no system prompt yet — add one on the Configure tab first.
        </p>
      )}
    </div>
  );
}

function EvalForm({
  title,
  criterion,
  editing,
  saving,
  onTitleChange,
  onCriterionChange,
  onCancel,
  onSave,
}: {
  title: string;
  criterion: string;
  editing: boolean;
  saving: boolean;
  onTitleChange: (v: string) => void;
  onCriterionChange: (v: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="p-4 mb-4 bg-zinc-900 border border-zinc-800 rounded-xl">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white">
          {editing ? "Edit eval" : "New eval"}
        </h3>
        <button
          onClick={onCancel}
          className="text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <X size={16} />
        </button>
      </div>
      <label className="block mb-3">
        <span className="block mb-1 text-xs text-zinc-400">Title</span>
        <input
          type="text"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="e.g. Introduces self with name"
          maxLength={120}
          className="w-full px-3 py-2 text-sm text-white bg-zinc-950 border border-zinc-800 rounded-lg focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
        />
      </label>
      <label className="block mb-3">
        <span className="block mb-1 text-xs text-zinc-400">
          Criterion (plain English — what should always be true?)
        </span>
        <textarea
          value={criterion}
          onChange={(e) => onCriterionChange(e.target.value)}
          placeholder="e.g. The agent states their name in the first turn and confirms they are calling from Lead Friendly."
          maxLength={2000}
          rows={3}
          className="w-full px-3 py-2 text-sm text-white bg-zinc-950 border border-zinc-800 rounded-lg resize-none focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
        />
        <div className="mt-1 text-xs text-zinc-600">
          {criterion.length} / 2000 · Must be clearly pass/fail from a transcript alone.
        </div>
      </label>
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-sm text-zinc-300 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={saving || title.trim().length < 2 || criterion.trim().length < 10}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <CheckCircle2 size={14} />
          )}
          {saving ? "Saving…" : editing ? "Save changes" : "Add eval"}
        </button>
      </div>
    </div>
  );
}

function EvalRowCard({
  ev,
  running,
  pickerOpen,
  callOptions,
  callsLoading,
  onRunClick,
  onPickCall,
  onClosePicker,
  onEdit,
  onDelete,
}: {
  ev: EvalRow;
  running: boolean;
  pickerOpen: boolean;
  callOptions: CallOption[];
  callsLoading: boolean;
  onRunClick: () => void;
  onPickCall: (callId: string) => void;
  onClosePicker: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="relative p-4 bg-zinc-900 border border-zinc-800 rounded-xl hover:border-zinc-700 transition-colors">
      <div className="flex items-start gap-3">
        <VerdictBadge verdict={ev.latest_run?.verdict ?? null} running={running} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-medium text-white">{ev.title}</h3>
            <SourceBadge source={ev.source} />
          </div>
          <p className="mt-1 text-xs text-zinc-400 line-clamp-2">{ev.criterion}</p>
          {ev.latest_run && (
            <div
              className="mt-2 text-xs text-zinc-500"
              title={ev.latest_run.reason}
            >
              Last run{" "}
              <RelativeTime iso={ev.latest_run.created_at} />
              {" · "}
              <span className="italic">"{ev.latest_run.reason}"</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onRunClick}
            disabled={running}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-white bg-zinc-800 hover:bg-zinc-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Run this eval against a specific call"
          >
            {running ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Play size={12} />
            )}
            {running ? "Judging…" : "Run"}
            <ChevronDown size={12} />
          </button>
          <button
            onClick={onEdit}
            className="p-1.5 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-md transition-colors"
            title="Edit"
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-zinc-800 rounded-md transition-colors"
            title="Delete"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Run-picker dropdown */}
      {pickerOpen && (
        <div className="absolute right-4 top-14 z-20 w-80 p-2 bg-zinc-950 border border-zinc-700 rounded-lg shadow-xl">
          <div className="flex items-center justify-between px-2 py-1 mb-1">
            <span className="text-xs font-medium text-zinc-300">
              Run against which call?
            </span>
            <button
              onClick={onClosePicker}
              className="text-zinc-500 hover:text-zinc-300"
            >
              <X size={12} />
            </button>
          </div>
          {callsLoading && (
            <div className="flex items-center justify-center py-4 text-xs text-zinc-500">
              <Loader2 size={12} className="animate-spin mr-1.5" />
              Loading calls…
            </div>
          )}
          {!callsLoading && callOptions.length === 0 && (
            <div className="px-2 py-3 text-xs text-zinc-500">
              No calls with transcripts available yet for this agent.
            </div>
          )}
          {!callsLoading && callOptions.length > 0 && (
            <ul className="max-h-64 overflow-y-auto">
              {callOptions.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => onPickCall(c.id)}
                    className="w-full px-2 py-1.5 text-left text-xs text-zinc-300 hover:bg-zinc-800 rounded-md transition-colors"
                  >
                    {c.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function VerdictBadge({
  verdict,
  running,
}: {
  verdict: "PASS" | "FAIL" | "INCONCLUSIVE" | null;
  running: boolean;
}) {
  if (running) {
    return (
      <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-zinc-800 text-zinc-400">
        <Loader2 size={16} className="animate-spin" />
      </div>
    );
  }
  if (!verdict) {
    return (
      <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-zinc-800 text-zinc-600 text-xs">
        —
      </div>
    );
  }
  const styles: Record<string, string> = {
    PASS: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20",
    FAIL: "bg-red-500/15 text-red-400 border border-red-500/20",
    INCONCLUSIVE: "bg-amber-500/15 text-amber-400 border border-amber-500/20",
  };
  const icon: Record<string, React.ReactNode> = {
    PASS: <CheckCircle2 size={16} />,
    FAIL: <XCircle size={16} />,
    INCONCLUSIVE: <AlertCircle size={16} />,
  };
  return (
    <div
      className={`flex items-center justify-center w-10 h-10 rounded-lg ${styles[verdict]}`}
    >
      {icon[verdict]}
    </div>
  );
}

function SourceBadge({
  source,
}: {
  source: "user" | "ai_generated" | "from_annotation";
}) {
  const configs = {
    user: {
      icon: <User size={10} />,
      label: "You",
      cls: "bg-zinc-800 text-zinc-400",
    },
    ai_generated: {
      icon: <Sparkles size={10} />,
      label: "AI-generated",
      cls: "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20",
    },
    from_annotation: {
      icon: <MessageSquareQuote size={10} />,
      label: "From annotation",
      cls: "bg-purple-500/10 text-purple-400 border border-purple-500/20",
    },
  };
  const c = configs[source];
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded ${c.cls}`}
    >
      {c.icon}
      {c.label}
    </span>
  );
}

function RelativeTime({ iso }: { iso: string }) {
  const label = useMemo(() => relativeTime(iso), [iso]);
  return <span title={new Date(iso).toLocaleString()}>{label}</span>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatCallLabel(c: any): string {
  const parts: string[] = [];
  if (c.created_at || c.started_at) {
    const d = new Date(c.created_at ?? c.started_at);
    parts.push(
      d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }),
    );
  }
  if (c.duration_seconds != null) {
    parts.push(`${Math.round(c.duration_seconds)}s`);
  }
  const who = c.to_number || c.from_number || c.contact_name || c.phone;
  if (who) parts.push(String(who));
  return parts.join(" · ") || (c.id ? c.id.slice(0, 8) : "(call)");
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

// Also expose as default so either import style works.
export default EvalsPage;
