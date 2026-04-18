"use client";

import { useState } from "react";
import { Star, CheckCircle2, AlertTriangle, BarChart3, Lightbulb, RefreshCw, Loader2, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AnalysisData {
  score: number;
  summary: string;
  strengths: string[];
  improvements: string[];
  goal_achieved: boolean;
  goal_label: string;
  // optional extra stats
  duration?: string;
  turns?: number;
  agent_talk_ratio?: number;
}

interface Props {
  analysis: AnalysisData;
  agentId?: string;
  systemPrompt?: string;
  onTestAgain?: () => void;
  onPromptsApplied?: (newPrompt: string) => void;
}

function Stars({ score }: { score: number }) {
  const filled = Math.round(score / 2);
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={cn("h-4 w-4", i <= filled ? "text-amber-400 fill-amber-400" : "text-zinc-700")}
        />
      ))}
    </div>
  );
}

export function CallAnalysis({ analysis, agentId, systemPrompt, onTestAgain, onPromptsApplied }: Props) {
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);

  const applyImprovements = async () => {
    if (!agentId || !systemPrompt || !analysis.improvements?.length) return;
    setApplying(true);
    try {
      // Build enhanced prompt by appending improvement notes
      const improvementText = analysis.improvements.join("\n- ");
      const newPrompt = `${systemPrompt}\n\n--- Improvement Notes ---\n- ${improvementText}`;

      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      await supabase
        .from("ai_agents")
        .update({ system_prompt: newPrompt })
        .eq("id", agentId);

      setApplied(true);
      onPromptsApplied?.(newPrompt);
    } catch {
      // Silent fail
    } finally {
      setApplying(false);
    }
  };

  const scoreColor =
    analysis.score >= 8
      ? "text-emerald-400"
      : analysis.score >= 6
      ? "text-amber-400"
      : "text-red-400";

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-indigo-400" />
          <h3 className="text-sm font-semibold text-white">Test Call Analysis</h3>
        </div>
        <div className="flex items-center gap-3">
          <Stars score={analysis.score} />
          <span className={cn("text-lg font-bold tabular-nums", scoreColor)}>
            {analysis.score}/10
          </span>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Summary */}
        <p className="text-sm text-zinc-400 leading-relaxed">{analysis.summary}</p>

        {/* Goal + Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
            <p className="text-xs text-zinc-500 mb-1 flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />Goal
            </p>
            <div className="flex items-center gap-2">
              {analysis.goal_achieved ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
              )}
              <span className="text-xs font-medium text-white">{analysis.goal_label || "—"}</span>
            </div>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
            <p className="text-xs text-zinc-500 mb-1">Stats</p>
            <div className="space-y-0.5">
              {analysis.turns && (
                <p className="text-xs text-zinc-400">{analysis.turns} turns</p>
              )}
              {analysis.duration && (
                <p className="text-xs text-zinc-400">~{analysis.duration}</p>
              )}
              {analysis.agent_talk_ratio !== undefined && (
                <p className="text-xs text-zinc-400">Agent: {analysis.agent_talk_ratio}%</p>
              )}
            </div>
          </div>
        </div>

        {/* Strengths */}
        {analysis.strengths?.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-emerald-400 mb-2 flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" />Strengths
            </p>
            <ul className="space-y-1">
              {analysis.strengths.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-zinc-400">
                  <span className="text-emerald-500 mt-0.5 shrink-0">•</span>{s}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Improvements */}
        {analysis.improvements?.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-amber-400 mb-2 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />Improvements
            </p>
            <ul className="space-y-1">
              {analysis.improvements.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-zinc-400">
                  <span className="text-amber-500 mt-0.5 shrink-0">⚠</span>{s}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2 border-t border-zinc-800">
          {onTestAgain && (
            <button
              onClick={onTestAgain}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />Test Again
            </button>
          )}
          {agentId && systemPrompt && analysis.improvements?.length > 0 && (
            <button
              onClick={applyImprovements}
              disabled={applying || applied}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors",
                applied
                  ? "bg-emerald-600/20 border border-emerald-600/30 text-emerald-400"
                  : "bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
              )}
            >
              {applying ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : applied ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : (
                <Lightbulb className="h-3.5 w-3.5" />
              )}
              {applied ? "Applied!" : applying ? "Applying…" : "Apply Suggestions"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
