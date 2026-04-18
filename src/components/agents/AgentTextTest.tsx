"use client";
import { useState, useRef, useEffect } from "react";
import { Send, RefreshCw, Bot, User, MessageSquare, Play } from "lucide-react";

interface Message { id: string; role: "user" | "assistant"; content: string; duration_ms?: number; }
interface Props {
  agentId: string;
  agentName: string;
  systemPrompt: string;
}

const OPENERS = [
  "I'm interested in your services",
  "How much does it cost?",
  "I'm not sure I need this",
  "Can I speak to a real person?",
  "Call me back later",
];

export function AgentTextTest({ agentId, agentName, systemPrompt }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [started, setStarted] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const startConversation = async () => {
    setStarted(true);
    setLoading(true);
    try {
      const res = await fetch("/api/voice/test-llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [], system_prompt: systemPrompt }),
      });
      const data = await res.json() as { response: string; duration_ms: number };
      setMessages([{ id: crypto.randomUUID(), role: "assistant", content: data.response, duration_ms: data.duration_ms }]);
    } catch {
      setMessages([{ id: crypto.randomUUID(), role: "assistant", content: "Error connecting to AI. Check your ANTHROPIC_API_KEY env var.", }]);
    } finally { setLoading(false); }
  };

  const sendMessage = async (text?: string) => {
    const content = (text || input).trim();
    if (!content || loading) return;
    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/voice/test-llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: updated.map(m => ({ role: m.role, content: m.content })),
          system_prompt: systemPrompt,
        }),
      });
      const data = await res.json() as { response: string; duration_ms: number };
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: "assistant", content: data.response, duration_ms: data.duration_ms }]);
    } catch {
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: "assistant", content: "Error generating response." }]);
    } finally { setLoading(false); }
  };

  if (!started) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <div className="w-12 h-12 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
          <MessageSquare className="h-5 w-5 text-indigo-400" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-white mb-1">Test {agentName}&apos;s script logic</p>
          <p className="text-xs text-zinc-500 max-w-xs">No microphone needed — type as the lead, see exactly how the agent responds.</p>
        </div>
        <button onClick={startConversation}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl transition-colors">
          <Play className="h-3.5 w-3.5" /> Start conversation
        </button>
        <div className="flex flex-wrap gap-2 justify-center">
          {OPENERS.map(o => (
            <button key={o} onClick={() => { setStarted(true); startConversation().then(() => sendMessage(o)); }}
              className="text-xs px-3 py-1.5 rounded-full border border-zinc-700 text-zinc-400 hover:border-indigo-500 hover:text-indigo-300 transition-all">
              {o}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex-1 space-y-3 overflow-y-auto min-h-[300px] max-h-[500px] pr-1">
        {messages.map(msg => (
          <div key={msg.id} className={`flex gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
            <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-1 ${msg.role === "assistant" ? "bg-indigo-600" : "bg-zinc-700"}`}>
              {msg.role === "assistant" ? <Bot className="h-3 w-3 text-white" /> : <User className="h-3 w-3 text-zinc-300" />}
            </div>
            <div className="max-w-[80%] space-y-1">
              <div className={`px-3 py-2.5 rounded-xl text-sm leading-relaxed ${msg.role === "assistant" ? "bg-indigo-500/10 border border-indigo-500/20 text-indigo-100" : "bg-zinc-800 text-zinc-200"}`}>
                {msg.content}
              </div>
              {msg.duration_ms && <p className="text-[10px] text-zinc-600 px-1">{msg.duration_ms}ms</p>}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex gap-2.5">
            <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center"><Bot className="h-3 w-3 text-white" /></div>
            <div className="px-3 py-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
              <div className="flex gap-1">
                {[0, 150, 300].map(d => <span key={d} className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: `${d}ms` }} />)}
              </div>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div className="flex gap-2">
        <input
          className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 placeholder-zinc-600"
          placeholder="Type as the lead..." value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage()}
          disabled={loading} />
        <button onClick={() => sendMessage()} disabled={!input.trim() || loading}
          className="p-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-xl transition-colors">
          <Send className="h-4 w-4" />
        </button>
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {OPENERS.slice(0, 3).map(o => (
          <button key={o} onClick={() => setInput(o)}
            className="text-[11px] px-2.5 py-1 rounded-full border border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300 transition-all">
            {o}
          </button>
        ))}
        <button onClick={() => { setMessages([]); setStarted(false); }}
          className="text-[11px] px-2.5 py-1 rounded-full border border-zinc-800 text-zinc-600 hover:text-zinc-400 transition-all ml-auto flex items-center gap-1">
          <RefreshCw className="h-2.5 w-2.5" /> Reset
        </button>
      </div>
    </div>
  );
}
