"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, User, Bot, Target, X, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface Result {
  id: string;
  label: string;
  sub?: string;
  type: "contact" | "agent" | "opportunity";
  href: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery("");
      setResults([]);
      setSelected(0);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Debounced search
  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); setLoading(false); return; }
    setLoading(true);
    try {
      const supabase = createClient();
      const like = `%${q}%`;

      const [contactsRes, agentsRes, oppsRes] = await Promise.all([
        supabase
          .from("contacts")
          .select("id, first_name, last_name, email, phone")
          .or(`first_name.ilike.${like},last_name.ilike.${like},email.ilike.${like},phone.ilike.${like}`)
          .limit(5),
        supabase
          .from("ai_agents")
          .select("id, name, description")
          .ilike("name", like)
          .limit(5),
        supabase
          .from("opportunities")
          .select("id, name, value")
          .ilike("name", like)
          .limit(5),
      ]);

      const mapped: Result[] = [
        ...(contactsRes.data || []).map((c) => ({
          id: c.id,
          label: [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || "Unknown",
          sub: c.email || c.phone || "",
          type: "contact" as const,
          href: `/people/${c.id}`,
        })),
        ...(agentsRes.data || []).map((a) => ({
          id: a.id,
          label: a.name,
          sub: a.description || "AI Agent",
          type: "agent" as const,
          href: `/ai-agents/${a.id}`,
        })),
        ...(oppsRes.data || []).map((o) => ({
          id: o.id,
          label: o.name,
          sub: o.value ? `$${Number(o.value).toLocaleString()}` : "Opportunity",
          type: "opportunity" as const,
          href: `/opportunities`,
        })),
      ];
      setResults(mapped);
      setSelected(0);
    } catch (err) {
      console.error("Search error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) { setResults([]); setLoading(false); return; }
    setLoading(true);
    debounceRef.current = setTimeout(() => search(query), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, search]);

  const navigate = (r: Result) => {
    router.push(r.href);
    onClose();
  };

  // Keyboard nav
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSelected(s => Math.min(s + 1, results.length - 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
    if (e.key === "Enter" && results[selected]) navigate(results[selected]);
  };

  const typeIcon = (type: Result["type"]) => {
    if (type === "contact")     return <User className="h-4 w-4 text-blue-400" />;
    if (type === "agent")       return <Bot className="h-4 w-4 text-indigo-400" />;
    if (type === "opportunity") return <Target className="h-4 w-4 text-emerald-400" />;
  };

  const typeLabel = (type: Result["type"]) => {
    if (type === "contact")     return "Contact";
    if (type === "agent")       return "AI Agent";
    if (type === "opportunity") return "Deal";
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-24"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Panel */}
      <div
        className="relative w-full max-w-xl mx-4 rounded-xl border border-zinc-800 bg-zinc-900/95 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800">
          <Search className="h-5 w-5 text-zinc-500 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search contacts, agents, deals…"
            className="flex-1 bg-transparent text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
          />
          {loading
            ? <Loader2 className="h-4 w-4 text-zinc-600 animate-spin shrink-0" />
            : query && <button onClick={() => setQuery("")} className="text-zinc-600 hover:text-zinc-400"><X className="h-4 w-4" /></button>
          }
        </div>

        {/* Results */}
        {results.length > 0 ? (
          <ul className="max-h-80 overflow-y-auto py-2">
            {results.map((r, i) => (
              <li key={r.id}>
                <button
                  onClick={() => navigate(r)}
                  onMouseEnter={() => setSelected(i)}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    selected === i ? "bg-indigo-600/15 text-white" : "text-zinc-300 hover:bg-zinc-800/60"
                  }`}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-800">
                    {typeIcon(r.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{r.label}</p>
                    {r.sub && <p className="text-xs text-zinc-500 truncate">{r.sub}</p>}
                  </div>
                  <span className="text-xs text-zinc-600 shrink-0">{typeLabel(r.type)}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : query && !loading ? (
          <div className="px-4 py-8 text-center text-zinc-600 text-sm">
            No results for &quot;{query}&quot;
          </div>
        ) : !query ? (
          <div className="px-4 py-6 text-center text-zinc-700 text-xs">
            Search across contacts, AI agents, and deals
          </div>
        ) : null}

        {/* Footer hint */}
        <div className="border-t border-zinc-800 px-4 py-2 flex items-center gap-4 text-[10px] text-zinc-700">
          <span><kbd className="font-mono">↑↓</kbd> navigate</span>
          <span><kbd className="font-mono">↵</kbd> open</span>
          <span><kbd className="font-mono">esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
