"use client";

// src/components/agents/ConvertAnnotationToEvalButton.tsx
//
// Stage 4 of P1 #3. Drop this next to each annotation row on AnnotatePage.
// One import, one JSX line — zero touch on the rest of the annotation UI.
//
// Usage:
//   import { ConvertAnnotationToEvalButton } from "@/components/agents/ConvertAnnotationToEvalButton";
//   ...
//   <ConvertAnnotationToEvalButton
//     annotationId={annotation.id}
//     agentId={agentId}
//     transcriptLine={annotation.transcript_line}
//     annotationTitle={annotation.title}
//     promptCorrection={annotation.prompt_correction}
//   />

import { useState } from "react";
import {
  CheckCircle2,
  Loader2,
  MessageSquareQuote,
  Sparkles,
  X,
} from "lucide-react";

interface Props {
  annotationId: string;
  agentId: string;
  transcriptLine: string;
  annotationTitle?: string | null;
  promptCorrection?: string | null;

  /** Optional callback after successful conversion, e.g. to refresh parent state */
  onConverted?: (evalId: string) => void;

  /** Shown as "Converted ✓" if this annotation has already become an eval */
  alreadyConverted?: boolean;

  /** Button visual variant. "link" = small inline text; "pill" = outlined button */
  variant?: "link" | "pill";
}

export function ConvertAnnotationToEvalButton({
  annotationId,
  agentId,
  transcriptLine,
  annotationTitle,
  promptCorrection,
  onConverted,
  alreadyConverted = false,
  variant = "link",
}: Props) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(() => deriveTitle(annotationTitle, transcriptLine));
  const [criterion, setCriterion] = useState(() =>
    deriveCriterion(transcriptLine, promptCorrection, annotationTitle),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSavedId, setJustSavedId] = useState<string | null>(null);

  const canSave =
    title.trim().length >= 2 && title.trim().length <= 120 &&
    criterion.trim().length >= 10 && criterion.trim().length <= 2000;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/agents/${agentId}/evals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          criterion: criterion.trim(),
          source: "from_annotation",
          source_ref: annotationId,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const newEvalId = data?.eval?.id as string | undefined;
      if (newEvalId) {
        setJustSavedId(newEvalId);
        onConverted?.(newEvalId);
        // auto-close after a beat so user sees the confirmation
        setTimeout(() => setOpen(false), 1200);
      } else {
        setOpen(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  // ── Trigger button ──
  if (alreadyConverted && !open) {
    return (
      <span
        title="This annotation has been converted to an eval"
        className="inline-flex items-center gap-1 text-[11px] text-purple-400"
      >
        <CheckCircle2 size={11} />
        Converted to eval
      </span>
    );
  }

  const triggerClasses =
    variant === "pill"
      ? "inline-flex items-center gap-1.5 px-2 py-1 text-xs text-purple-300 bg-purple-500/10 border border-purple-500/20 rounded-md hover:bg-purple-500/20 transition-colors"
      : "inline-flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 transition-colors";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={triggerClasses}
        title="Turn this annotation into a reusable eval"
      >
        <MessageSquareQuote size={12} />
        Convert to eval
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget && !saving) setOpen(false);
          }}
        >
          <div className="w-full max-w-lg p-5 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-start gap-2">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20">
                  <MessageSquareQuote size={16} className="text-purple-400" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">Convert annotation to eval</h3>
                  <p className="text-xs text-zinc-500">
                    This eval will run against every future call — not just this one.
                  </p>
                </div>
              </div>
              <button
                onClick={() => !saving && setOpen(false)}
                className="text-zinc-500 hover:text-zinc-300 transition-colors"
                disabled={saving}
              >
                <X size={16} />
              </button>
            </div>

            {/* Reference line from the transcript — read-only, for context */}
            <div className="p-2 mb-3 bg-zinc-950 border border-zinc-800 rounded-lg">
              <div className="mb-1 text-[10px] font-medium tracking-wider text-zinc-600 uppercase">
                From transcript line
              </div>
              <div className="text-xs text-zinc-400 italic">"{transcriptLine}"</div>
            </div>

            {/* Title */}
            <label className="block mb-3">
              <span className="block mb-1 text-xs text-zinc-400">Title</span>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
                disabled={saving}
                className="w-full px-3 py-2 text-sm text-white bg-zinc-950 border border-zinc-800 rounded-lg focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:opacity-60"
              />
            </label>

            {/* Criterion */}
            <label className="block mb-3">
              <span className="block mb-1 text-xs text-zinc-400">
                Criterion (plain English — what should always be true?)
              </span>
              <textarea
                value={criterion}
                onChange={(e) => setCriterion(e.target.value)}
                maxLength={2000}
                rows={4}
                disabled={saving}
                className="w-full px-3 py-2 text-sm text-white bg-zinc-950 border border-zinc-800 rounded-lg resize-none focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:opacity-60"
              />
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-zinc-600">
                  We pre-filled this from the annotation. Edit freely — clearer criteria judge better.
                </span>
                <span className="text-xs text-zinc-600">{criterion.length} / 2000</span>
              </div>
            </label>

            {/* Tip */}
            <div className="flex items-start gap-1.5 mb-4 text-xs text-indigo-300/80">
              <Sparkles size={12} className="mt-0.5 flex-shrink-0" />
              <span>
                Tip: criteria that start with "The agent always..." or "The agent never..." tend to get
                the most reliable verdicts.
              </span>
            </div>

            {/* Error */}
            {error && (
              <div className="p-2 mb-3 text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-md">
                {error}
              </div>
            )}

            {/* Just-saved confirmation */}
            {justSavedId && (
              <div className="flex items-center gap-1.5 p-2 mb-3 text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-md">
                <CheckCircle2 size={12} />
                Eval created — you can run it from the Evals tab.
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => !saving && setOpen(false)}
                disabled={saving}
                className="px-3 py-1.5 text-sm text-zinc-300 bg-zinc-800 hover:bg-zinc-700 rounded-lg disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!canSave || saving || justSavedId !== null}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <CheckCircle2 size={14} />
                )}
                {saving ? "Creating eval…" : "Create eval"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Derivation helpers — these are deliberately rough; user edits before saving
// ─────────────────────────────────────────────────────────────────────────────

function deriveTitle(
  annotationTitle: string | null | undefined,
  transcriptLine: string,
): string {
  const candidate = (annotationTitle ?? "").trim();
  if (candidate.length >= 2) return candidate.slice(0, 120);
  // Fall back to first ~60 chars of the transcript line
  const trimmed = transcriptLine.trim().replace(/\s+/g, " ");
  if (trimmed.length <= 60) return trimmed || "Untitled eval";
  return trimmed.slice(0, 57) + "…";
}

function deriveCriterion(
  transcriptLine: string,
  promptCorrection: string | null | undefined,
  annotationTitle: string | null | undefined,
): string {
  // If we have a prompt_correction, that's the agent's corrected behavior — use it as the "should"
  const correction = (promptCorrection ?? "").trim();
  if (correction.length >= 10) {
    return `The agent should: ${correction}`;
  }

  // Otherwise fall back to the annotation title + the bad line for context
  const titleHint = (annotationTitle ?? "").trim();
  const line = transcriptLine.trim().replace(/\s+/g, " ");
  const shortLine = line.length > 120 ? line.slice(0, 117) + "…" : line;

  if (titleHint.length >= 10) {
    return `The agent should avoid the behavior demonstrated in: "${shortLine}". Specifically: ${titleHint}`;
  }

  // Worst case — just the line itself, user will rewrite
  return `The agent should avoid the behavior demonstrated in: "${shortLine}". (Edit this to describe what the agent SHOULD do instead.)`;
}
