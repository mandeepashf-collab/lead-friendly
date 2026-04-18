"use client";

import { useState, useRef, useEffect } from "react";
import { Play, Square, ChevronDown, Loader2, Bot, User2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { testScenarios } from "@/lib/test-scenarios";
import { CallAnalysis, type AnalysisData } from "./CallAnalysis";

interface SimMessage {
  role: "customer" | "agent";
  content: string;
  turn: number;
}

interface Props {
  agentId: string;
  agentName: string;
  systemPrompt: string;
}

export function AISimulation({ agentId, agentName, systemPrompt }: Props) {
  const [scenario, setScenario] = useState(testScenarios[0].prompt);
  const [selectedPreset, setSelectedPreset] = useState<string>(testScenarios[0].name);
  const [showScenarioDropdown, setShowScenarioDropdown] = useState(false);
  const [running, setRunning] = useState(false);
  const [messages, setMessages] = useState<SimMessage[]>([]);
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [error, setError] = useState("");
  const [maxTurns, setMaxTurns] = useState(8);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const runSimulation = async () => {
    if (!scenario.trim()) return;
    setRunning(true);
    setMessages([]);
    setAnalysis(null);
    setError("");

    try {
      const res = await fetch("/api/agents/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_id: agentId, scenario, max_turns: maxTurns }),
      });

      if (!res.ok) throw new Error(`API error ${res.status}`);

      const data = await res.json();

      if (data.error) throw new Error(data.error);

      // Animate messages appearing one by one
      const sim: SimMessage[] = data.simulation || [];
      for (let i = 0; i < sim.length; i++) {
        await new Promise((resolve) => setTimeout(resolve, 400));
        setMessages((prev) => [...prev, sim[i]]);
      }

      if (data.analysis) {
        await new Promise((resolve) => setTimeout(resolve, 600));
        setAnalysis({
          ...data.analysis,
          turns: sim.length,
          duration: `~${Math.round((sim.length * 15) / 60)}m ${(sim.length * 15) % 60}s`,
          agent_talk_ratio: Math.round(
            (sim.filter((m: SimMessage) => m.role === "agent").length / sim.length) * 100
          ),
        });
      }
    } catch (err: any) {
      setError(err.message || "Simulation failed. Check your API keys.");
    } finally {
      setRunning(false);
    }
  };

  const reset = () => {
    setMessages([]);
    setAnalysis(null);
    setError("");
  };

  return (
    <div className="space-y-4">
      {/* Scenario Picker */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-3">
        <div>
          <label className="block text-xs font-semibold text-zinc-400 mb-2">Test Scenario</label>

          {/* Preset dropdown */}
          <div className="relative mb-2">
            <button
              onClick={() => setShowScenarioDropdown((s) => !s)}
              className="flex w-full items-center justify-between rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-300 hover:border-zinc-600 transition-colors"
            >
              <span>{selectedPreset}</span>
              <ChevronDown className={cn("h-4 w-4 text-zinc-500 transition-transform", showScenarioDropdown && "rotate-180")} />
            </button>
            {showScenarioDropdown && (
              <div className="absolute z-20 top-full mt-1 left-0 right-0 rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl overflow-hidden">
                {testScenarios.map((s) => (
                  <button
                    key={s.name}
                    onClick={() => {
                      setSelectedPreset(s.name);
                      setScenario(s.prompt);
                      setShowScenarioDropdown(false);
                    }}
                    className="flex w-full items-start gap-3 px-4 py-3 hover:bg-zinc-800 transition-colors border-b border-zinc-800/50 last:border-0 text-left"
                  >
                    <span className="text-lg leading-none mt-0.5">{s.emoji}</span>
                    <div>
                      <p className="text-sm font-medium text-white">{s.name}</p>
                      <p className="text-xs text-zinc-500 mt-0.5">{s.description}</p>
                    </div>
                  </button>
                ))}
                <button
                  onClick={() => {
                    setSelectedPreset("Custom Scenario");
                    setScenario("");
                    setShowScenarioDropdown(false);
                  }}
                  className="flex w-full items-start gap-3 px-4 py-3 hover:bg-zinc-800 transition-colors text-left"
                >
                  <span className="text-lg leading-none mt-0.5">✏️</span>
                  <div>
                    <p className="text-sm font-medium text-white">Custom Scenario</p>
                    <p className="text-xs text-zinc-500">Write your own customer persona</p>
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* Editable scenario prompt */}
          <textarea
            value={scenario}
            onChange={(e) => setScenario(e.target.value)}
            rows={3}
            placeholder="Describe how the simulated customer should behave…"
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-300 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none resize-none"
          />
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs text-zinc-500">Max turns:</label>
            <select
              value={maxTurns}
              onChange={(e) => setMaxTurns(Number(e.target.value))}
              className="h-8 rounded-lg border border-zinc-800 bg-zinc-900 px-2 text-xs text-zinc-300 focus:border-indigo-500 focus:outline-none"
            >
              {[4, 6, 8, 10, 12].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>

          {messages.length > 0 && !running && (
            <button
              onClick={reset}
              className="text-xs text-zinc-500 hover:text-zinc-300 border border-zinc-800 px-3 py-1.5 rounded-lg hover:bg-zinc-800 transition-colors"
            >
              Clear
            </button>
          )}

          <button
            onClick={runSimulation}
            disabled={running || !scenario.trim()}
            className="ml-auto flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
          >
            {running ? (
              <><Loader2 className="h-4 w-4 animate-spin" />Simulating…</>
            ) : (
              <><Play className="h-4 w-4 fill-current" />Run Simulation</>
            )}
          </button>
        </div>
      </div>

      {/* Transcript */}
      {(messages.length > 0 || running) && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
          <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
            <div className="h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />
            <span className="text-xs font-semibold text-zinc-400">Simulation Transcript</span>
          </div>

          <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={cn(
                  "flex gap-2 animate-in fade-in slide-in-from-bottom-2 duration-300",
                  msg.role === "agent" ? "justify-start" : "justify-end"
                )}
              >
                {msg.role === "agent" && (
                  <div className="h-6 w-6 rounded-full bg-indigo-600/20 border border-indigo-500/20 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="h-3.5 w-3.5 text-indigo-400" />
                  </div>
                )}
                <div className="max-w-[80%] space-y-1">
                  <p className={cn(
                    "text-xs font-medium",
                    msg.role === "agent" ? "text-indigo-400" : "text-blue-400 text-right"
                  )}>
                    {msg.role === "agent" ? agentName : "Simulated Customer"}
                  </p>
                  <div className={cn(
                    "rounded-xl px-3 py-2 text-xs leading-relaxed",
                    msg.role === "agent"
                      ? "bg-zinc-800 text-zinc-200 rounded-tl-sm"
                      : "bg-blue-900/30 border border-blue-700/30 text-blue-200 rounded-tr-sm"
                  )}>
                    {msg.content}
                  </div>
                </div>
                {msg.role === "customer" && (
                  <div className="h-6 w-6 rounded-full bg-blue-600/20 border border-blue-500/20 flex items-center justify-center shrink-0 mt-5">
                    <User2 className="h-3.5 w-3.5 text-blue-400" />
                  </div>
                )}
              </div>
            ))}

            {running && messages.length > 0 && (
              <div className="flex justify-center py-2">
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Continuing conversation…
                </div>
              </div>
            )}

            {error && (
              <p className="text-xs text-red-400 text-center bg-red-950/30 border border-red-900/30 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
            <div ref={bottomRef} />
          </div>
        </div>
      )}

      {/* Analysis */}
      {analysis && (
        <CallAnalysis
          analysis={analysis}
          agentId={agentId}
          systemPrompt={systemPrompt}
          onTestAgain={reset}
        />
      )}
    </div>
  );
}
