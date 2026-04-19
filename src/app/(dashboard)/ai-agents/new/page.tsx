"use client";

import { useRouter } from "next/navigation";
import { useState, useRef, useEffect, useCallback } from "react";
import {
  ArrowLeft, Save, CheckCircle2, User, Mic, FileText, BookOpen,
  Settings2, Loader2, Play, Square, Search, MessageSquare, Phone,
  FlaskConical, Clock, Bot, PhoneIncoming, PhoneOutgoing,
  Flag, BarChart2, Plus, ChevronDown, ChevronRight, X,
  Calendar, Repeat, Send, Zap, Globe, Volume2, Pause,
  Brain, Shield, Timer, Hash, Sparkles, Target,
  ToggleLeft, ToggleRight, Trash2, GripVertical,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createAIAgent } from "@/hooks/use-ai-agents";
import { getVoiceName, getVoiceMeta } from "@/lib/voices";

// ── Types ─────────────────────────────────────────────────────────
interface ElevenLabsVoice {
  id: string;
  name: string;
  preview_url: string;
  gender: string;
  accent: string;
  age: string;
  use_case: string;
  description: string;
  category: string;
}

interface AgentAction {
  id: string;
  type: "book_appointment" | "transfer_call" | "send_sms" | "trigger_workflow" | "update_contact";
  enabled: boolean;
  config: Record<string, string>;
}

interface PromptEvalResult {
  score: number;
  grade: string;
  strengths: string[];
  improvements: string[];
  suggested_additions: string[];
  summary: string;
}

// ── GHL-style 3-tab wizard ────────────────────────────────────────
const WIZARD_TABS = [
  { id: "details", label: "Agent Details", icon: User,   num: "1" },
  { id: "goals",   label: "Agent Goals",   icon: Target, num: "2" },
  { id: "phone",   label: "Phone & Test",  icon: Phone,  num: "3" },
] as const;
type WizardTabId = typeof WIZARD_TABS[number]["id"];

const VARS = [
  "{first_name}", "{last_name}", "{company_name}", "{agent_name}",
  "{lender}", "{loan_amount}", "{city}", "{state}",
  "{lead_source}", "{phone}", "{email}", "{date}",
];

const ACTION_TYPES = [
  { type: "book_appointment",  label: "Book Appointment",  icon: Calendar, description: "Let the AI book meetings on your calendar" },
  { type: "transfer_call",     label: "Transfer Call",      icon: Repeat,   description: "Transfer to a live agent when AI can't help" },
  { type: "send_sms",          label: "Send SMS",           icon: Send,     description: "Send text messages during or after the call" },
  { type: "trigger_workflow",  label: "Trigger Workflow",   icon: Zap,      description: "Fire an automation workflow" },
  { type: "update_contact",    label: "Update Contact",     icon: User,     description: "Update CRM contact fields from the call" },
] as const;

// ── Voice Picker Modal ───────────────────────────────────────────
function VoicePickerModal({
  voices, currentVoiceId, onSelect, onClose, playingVoice, onPreview,
}: {
  voices: ElevenLabsVoice[];
  currentVoiceId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
  playingVoice: string | null;
  onPreview: (id: string, name: string, url?: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [genderFilter, setGenderFilter] = useState("all");
  const [accentFilter, setAccentFilter] = useState("all");
  const [tab, setTab] = useState<"library" | "custom">("library");

  const accents = [...new Set(voices.map(v => v.accent).filter(Boolean))].sort();

  const customVoices = voices.filter(v => v.category !== "premade" && v.category !== "professional");
  const libraryVoices = voices.filter(v => v.category === "premade" || v.category === "professional");
  const baseList = tab === "custom" ? customVoices : libraryVoices;

  const filtered = baseList.filter(v => {
    const matchSearch = v.name.toLowerCase().includes(search.toLowerCase()) ||
      v.description?.toLowerCase().includes(search.toLowerCase()) ||
      v.accent?.toLowerCase().includes(search.toLowerCase());
    const matchGender = genderFilter === "all" || v.gender === genderFilter;
    const matchAccent = accentFilter === "all" || v.accent === accentFilter;
    return matchSearch && matchGender && matchAccent;
  });

  const currentVoice = voices.find(v => v.id === currentVoiceId);

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-zinc-800">
          <div>
            <h2 className="text-lg font-semibold text-white">Select Voice</h2>
            <p className="text-xs text-zinc-500 mt-0.5">{voices.length} voices available</p>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Current voice banner */}
        {currentVoice && (
          <div className="mx-5 mt-4 flex items-center gap-3 p-3 rounded-xl bg-indigo-600/10 border border-indigo-500/20">
            <button
              onClick={() => onPreview(currentVoice.id, currentVoice.name, currentVoice.preview_url)}
              className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center flex-shrink-0"
            >
              {playingVoice === currentVoice.id
                ? <Square className="h-3 w-3 text-white fill-white" />
                : <Play className="h-3 w-3 text-white fill-white ml-0.5" />}
            </button>
            <div className="flex-1">
              <p className="text-sm font-medium text-white">{currentVoice.name}</p>
              <p className="text-xs text-indigo-300">Currently selected</p>
            </div>
            <CheckCircle2 className="h-5 w-5 text-indigo-400" />
          </div>
        )}

        {/* Tabs: Library / Custom */}
        <div className="flex gap-1 mx-5 mt-4 p-1 rounded-lg bg-zinc-800/50 w-fit">
          <button onClick={() => setTab("library")}
            className={cn("px-4 py-1.5 rounded-md text-sm font-medium transition-all",
              tab === "library" ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-white")}>
            Library
          </button>
          <button onClick={() => setTab("custom")}
            className={cn("px-4 py-1.5 rounded-md text-sm font-medium transition-all",
              tab === "custom" ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-white")}>
            My Voices
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 px-5 mt-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search voices..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <select value={genderFilter} onChange={e => setGenderFilter(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
            <option value="all">All Genders</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
          </select>
          <select value={accentFilter} onChange={e => setAccentFilter(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
            <option value="all">All Accents</option>
            {accents.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>

        {/* Voice list */}
        <div className="flex-1 overflow-y-auto p-5 space-y-1.5 min-h-0">
          {tab === "custom" && customVoices.length === 0 ? (
            <div className="text-center py-10">
              <Mic className="h-8 w-8 text-zinc-700 mx-auto mb-2" />
              <p className="text-sm font-medium text-zinc-400">No custom voices yet</p>
              <p className="text-xs text-zinc-600 mt-1">Clone a voice from a sample recording in your ElevenLabs dashboard, then it will appear here.</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10">
              <Mic className="h-8 w-8 text-zinc-700 mx-auto mb-2" />
              <p className="text-sm text-zinc-500">No voices match your filters</p>
            </div>
          ) : (
            filtered.map(v => (
              <div
                key={v.id}
                onClick={() => { onSelect(v.id); onClose(); }}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all group",
                  v.id === currentVoiceId
                    ? "bg-indigo-600/15 border border-indigo-500/30"
                    : "hover:bg-zinc-800 border border-transparent"
                )}
              >
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); onPreview(v.id, v.name, v.preview_url); }}
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors",
                    playingVoice === v.id ? "bg-indigo-600" : "bg-zinc-700 group-hover:bg-zinc-600"
                  )}
                >
                  {playingVoice === v.id
                    ? <Square className="h-3 w-3 text-white fill-white" />
                    : <Play className="h-3 w-3 text-white fill-white ml-0.5" />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-white">{v.name}</p>
                    {v.accent && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700">{v.accent}</span>}
                    {v.gender && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700 capitalize">{v.gender}</span>}
                  </div>
                  {v.description && <p className="text-xs text-zinc-500 mt-0.5 truncate">{v.description}</p>}
                </div>
                {v.id === currentVoiceId && <CheckCircle2 className="h-4 w-4 text-indigo-400 flex-shrink-0" />}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ── Collapsible Section ──────────────────────────────────────────
function CollapsibleSection({
  title, description, icon: Icon, defaultOpen = false, children,
}: {
  title: string; description?: string; icon: React.ElementType; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-zinc-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-zinc-800/30 transition-colors"
      >
        <Icon className="h-4 w-4 text-indigo-400 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium text-white">{title}</p>
          {description && <p className="text-xs text-zinc-500 mt-0.5">{description}</p>}
        </div>
        <ChevronRight className={cn("h-4 w-4 text-zinc-500 transition-transform", open && "rotate-90")} />
      </button>
      {open && <div className="px-4 pb-4 border-t border-zinc-800/50">{children}</div>}
    </div>
  );
}

// ── Prompt Evaluation Result Panel ───────────────────────────────
function PromptEvalPanel({ result, onClose }: { result: PromptEvalResult; onClose: () => void }) {
  const gradeColor: Record<string, string> = {
    A: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    B: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    C: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    D: "text-orange-400 bg-orange-500/10 border-orange-500/20",
    F: "text-red-400 bg-red-500/10 border-red-500/20",
  };
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-amber-400" />
          <h3 className="text-sm font-semibold text-white">Prompt Evaluation</h3>
        </div>
        <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors"><X className="h-4 w-4" /></button>
      </div>

      <div className="flex items-center gap-4">
        <div className={cn("w-16 h-16 rounded-xl flex items-center justify-center text-2xl font-bold border", gradeColor[result.grade] || gradeColor.C)}>
          {result.grade}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm text-zinc-300">Score:</span>
            <span className="text-sm font-bold text-white">{result.score}/100</span>
          </div>
          <div className="w-full bg-zinc-800 rounded-full h-2">
            <div className="bg-indigo-600 h-2 rounded-full transition-all" style={{ width: `${result.score}%` }} />
          </div>
        </div>
      </div>

      <p className="text-sm text-zinc-400">{result.summary}</p>

      {result.strengths.length > 0 && (
        <div>
          <p className="text-xs font-medium text-emerald-400 mb-1.5">Strengths</p>
          <ul className="space-y-1">
            {result.strengths.map((s, i) => (
              <li key={i} className="text-xs text-zinc-400 flex items-start gap-1.5">
                <CheckCircle2 className="h-3 w-3 text-emerald-500 mt-0.5 flex-shrink-0" />{s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.improvements.length > 0 && (
        <div>
          <p className="text-xs font-medium text-amber-400 mb-1.5">Improvements</p>
          <ul className="space-y-1">
            {result.improvements.map((s, i) => (
              <li key={i} className="text-xs text-zinc-400 flex items-start gap-1.5">
                <Target className="h-3 w-3 text-amber-500 mt-0.5 flex-shrink-0" />{s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.suggested_additions.length > 0 && (
        <div>
          <p className="text-xs font-medium text-indigo-400 mb-1.5">Suggested Additions</p>
          <ul className="space-y-1">
            {result.suggested_additions.map((s, i) => (
              <li key={i} className="text-xs text-zinc-400 flex items-start gap-1.5">
                <Plus className="h-3 w-3 text-indigo-500 mt-0.5 flex-shrink-0" />{s}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────
export default function NewAgentPage() {
  const router = useRouter();
  const [wizardTab, setWizardTab] = useState<WizardTabId>("details");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Voice state
  const [voices, setVoices] = useState<ElevenLabsVoice[]>([]);
  const [voicesLoading, setVoicesLoading] = useState(false);
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const [audioRef, setAudioRef] = useState<HTMLAudioElement | null>(null);
  const [showVoicePicker, setShowVoicePicker] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [previewingGreeting, setPreviewingGreeting] = useState(false);

  // Goals tab mode
  const [goalsMode, setGoalsMode] = useState<"basic" | "advanced">("advanced");
  const [showVarMenu, setShowVarMenu] = useState(false);

  // Prompt evaluation
  const [evalLoading, setEvalLoading] = useState(false);
  const [evalResult, setEvalResult] = useState<PromptEvalResult | null>(null);

  // Actions
  const [actions, setActions] = useState<AgentAction[]>([
    { id: "1", type: "book_appointment", enabled: true, config: {} },
    { id: "2", type: "transfer_call", enabled: true, config: {} },
  ]);
  const [showActionMenu, setShowActionMenu] = useState(false);

  const [form, setForm] = useState({
    name: "", role: "outbound_sales", company_name: "", personality: 50,
    voice_id: "21m00Tcm4TlvDq8ikWAM", greeting_inbound: "", greeting_outbound: "", prompt: "",
    objections: "", closing: "", max_duration_mins: 10, knowledge: "",
    transfer: "", dnc: "stop calling, remove me, do not call",
    timezone: "America/New_York", wait_before_speak: 1,
    interruption_sensitivity: 50, backchanneling: true,
    backchannel_words: "yeah, okay, uh-huh, right, got it",
    silence_timeout: 60, end_call_phrases: "goodbye, have a great day",
  });

  useEffect(() => {
    setVoicesLoading(true);
    fetch("/api/voice/voices")
      .then(r => r.json())
      .then((data: { voices: ElevenLabsVoice[] }) => {
        setVoices(data.voices || []);
        if (data.voices?.length > 0) set("voice_id")(data.voices[0].id);
      })
      .catch(() => {})
      .finally(() => setVoicesLoading(false));
  }, []);

  const previewVoice = async (voiceId: string, voiceName: string, previewUrl?: string) => {
    if (playingVoice === voiceId) {
      audioRef?.pause();
      audioRef?.remove();
      setPlayingVoice(null);
      return;
    }
    if (audioRef) {
      audioRef.pause();
      audioRef.remove();
      setAudioRef(null);
    }
    setPlayingVoice(voiceId);
    setVoiceError(null);
    try {
      // Primary: proxy through our own backend (avoids CSP issues)
      let audioSrc = `/api/voice/preview?voiceId=${voiceId}`;
      const audio = new Audio();
      audio.preload = "auto";
      audio.onended = () => { setPlayingVoice(null); setAudioRef(null); };
      audio.onerror = async () => {
        // Fallback 1: try direct preview URL (requires CSP to allow storage.googleapis.com)
        if (previewUrl && audio.src !== previewUrl) {
          audio.src = previewUrl;
          return;
        }
        // Fallback 2: synthesize via our API
        try {
          const res = await fetch("/api/voice/synthesize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: `Hi, I am ${voiceName}. I am your AI sales assistant, ready to help grow your business.`, voiceId }),
          });
          if (res.ok) {
            const blob = await res.blob();
            audio.src = URL.createObjectURL(blob);
            return;
          }
        } catch { /* fall through */ }
        // All fallbacks failed — show error to user
        console.error("[Voice preview] All sources failed for", voiceId);
        setVoiceError(`Couldn't preview ${voiceName}. Check your ElevenLabs API key or try again.`);
        setPlayingVoice(null);
        setAudioRef(null);
      };
      audio.oncanplaythrough = () => {
        audio.play().catch((err) => {
          console.error("[Voice preview play error]", err);
          setVoiceError(`Couldn't play audio for ${voiceName}. Try clicking again.`);
          setPlayingVoice(null);
          setAudioRef(null);
        });
      };
      audio.src = audioSrc;
      setAudioRef(audio);
    } catch (err) {
      console.error("[Voice preview error]", err);
      setVoiceError(`Couldn't preview ${voiceName}. Please try again.`);
      setPlayingVoice(null);
    }
  };

  const previewGreeting = async () => {
    const greeting = form.greeting_outbound || form.greeting_inbound;
    if (!greeting.trim() || !form.voice_id) return;
    setPreviewingGreeting(true);
    setVoiceError(null);
    try {
      const text = greeting
        .replace(/\{agent_name\}/g, form.name || "your agent")
        .replace(/\{company_name\}/g, form.company_name || "your company")
        .replace(/\{first_name\}/g, "there");
      const res = await fetch("/api/voice/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voiceId: form.voice_id }),
      });
      if (!res.ok) {
        setVoiceError("Couldn't generate greeting preview. Check your ElevenLabs API key.");
        return;
      }
      const blob = await res.blob();
      const audio = new Audio(URL.createObjectURL(blob));
      audio.onended = () => { setPreviewingGreeting(false); setAudioRef(null); };
      audio.onerror = () => { setPreviewingGreeting(false); setAudioRef(null); };
      if (audioRef) { audioRef.pause(); audioRef.remove(); }
      setPlayingVoice(null);
      setAudioRef(audio);
      await audio.play();
    } catch {
      setVoiceError("Couldn't generate greeting preview. Please try again.");
    } finally {
      setPreviewingGreeting(false);
    }
  };

  const set = (k: keyof typeof form) => (v: string | number | boolean) => setForm(f => ({ ...f, [k]: v }));

  const insertVariable = useCallback((variable: string) => {
    const el = promptTextareaRef.current;
    if (!el) {
      set("prompt")(form.prompt + variable);
      return;
    }
    const start = el.selectionStart ?? form.prompt.length;
    const end = el.selectionEnd ?? form.prompt.length;
    const newVal = form.prompt.substring(0, start) + variable + form.prompt.substring(end);
    set("prompt")(newVal);
    setTimeout(() => {
      el.focus();
      const pos = start + variable.length;
      el.setSelectionRange(pos, pos);
    }, 0);
  }, [form.prompt]);

  const evaluatePrompt = async () => {
    if (!form.prompt.trim()) return;
    setEvalLoading(true);
    setEvalResult(null);
    try {
      const res = await fetch("/api/agents/evaluate-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: form.prompt, agentName: form.name, role: form.role }),
      });
      if (res.ok) {
        const data = await res.json() as PromptEvalResult;
        setEvalResult(data);
      }
    } catch {
      // silently fail
    } finally {
      setEvalLoading(false);
    }
  };

  const addAction = (type: AgentAction["type"]) => {
    setActions(prev => [...prev, { id: Date.now().toString(), type, enabled: true, config: {} }]);
    setShowActionMenu(false);
  };

  const removeAction = (actionId: string) => {
    setActions(prev => prev.filter(a => a.id !== actionId));
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setError("Agent name is required"); return; }
    setSaving(true);
    setError("");

    const { error: err } = await createAIAgent({
      name: form.name,
      type: "outbound",
      voice_id: form.voice_id,
      system_prompt: form.prompt,
      greeting_message: form.greeting_outbound || form.greeting_inbound,
      company_name: form.company_name,
      max_duration_mins: form.max_duration_mins,
      objection_handling: form.objections,
      closing_script: form.closing,
      max_call_duration: form.max_duration_mins,
      knowledge_base: form.knowledge,
      transfer_number: form.transfer,
      dnc_phrases: form.dnc,
      personality: form.personality,
      role: form.role,
      inbound_prompt: form.prompt,
      inbound_greeting: form.greeting_inbound,
      outbound_prompt: form.prompt,
      outbound_greeting: form.greeting_outbound,
    });
    if (err) { setError(err); setSaving(false); return; }
    setSaved(true);
    setTimeout(() => router.push("/ai-agents"), 1000);
  };

  // Prefer the live /api/voice/voices result; fall back to the static
  // voice catalog in src/lib/voices.ts so Summary/Quick Info never shows
  // a raw ElevenLabs voice ID (e.g. "21m00Tcm4TlvDq8ikWAM") if the API
  // is slow or unreachable.
  let currentVoice: ElevenLabsVoice | undefined = voices.find(v => v.id === form.voice_id);
  if (!currentVoice && form.voice_id) {
    const meta = getVoiceMeta(form.voice_id);
    if (meta) {
      currentVoice = {
        id: meta.id,
        name: meta.name,
        preview_url: "",
        gender: meta.gender ?? "",
        accent: meta.accent ?? "",
        age: "",
        use_case: "",
        description: meta.description ?? "",
        category: "premade",
      };
    }
  }
  // Friendly label for display-only surfaces (never leaks raw IDs).
  const voiceDisplayName = currentVoice?.name || getVoiceName(form.voice_id);

  return (
    <div className="space-y-5">
      {/* ── Top Bar ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/ai-agents")}
            className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors">
            <ArrowLeft className="h-4 w-4" />Back
          </button>
          <div className="h-4 w-px bg-zinc-700" />
          <div>
            <h1 className="text-xl font-bold text-white">New Agent</h1>
            <p className="text-zinc-500 text-xs">Create a new AI Voice Agent</p>
          </div>
        </div>
        <button onClick={handleSave} disabled={saving}
          className={cn("flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-medium transition-colors",
            saved ? "bg-emerald-600 text-white" : "bg-indigo-600 text-white hover:bg-indigo-700",
            saving && "opacity-70 cursor-not-allowed")}>
          {saved ? <><CheckCircle2 className="h-4 w-4" />Saved!</> : saving ? <><Loader2 className="h-4 w-4 animate-spin" />Saving...</> : <><Save className="h-4 w-4" />Create Agent</>}
        </button>
      </div>

      {error && <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">{error}</div>}

      {/* ── Tab Navigation ──────────────────────────────────────────── */}
      <div className="flex items-center gap-1 border-b border-zinc-800">
        {WIZARD_TABS.map(t => {
          const active = wizardTab === t.id;
          return (
            <button key={t.id} onClick={() => setWizardTab(t.id)}
              className={cn("flex items-center gap-2 px-4 pb-3 text-sm font-medium transition-colors border-b-2 -mb-px",
                active ? "border-indigo-500 text-white" : "border-transparent text-zinc-500 hover:text-zinc-300")}>
              <span className={cn("w-5 h-5 rounded-full text-xs flex items-center justify-center font-bold",
                active ? "bg-indigo-600 text-white" : "bg-zinc-800 text-zinc-500")}>
                {t.num}
              </span>
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* TAB 1: AGENT DETAILS                                          */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {wizardTab === "details" && (
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-6">
          {/* Left: Identity & Voice */}
          <div className="space-y-5">
            {/* Identity Section */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-5">
              <div className="flex items-center gap-2 mb-1">
                <User className="h-4 w-4 text-indigo-400" />
                <h2 className="text-base font-semibold text-white">Agent Identity</h2>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-zinc-500 mb-1.5 block">Agent Name *</label>
                  <input value={form.name} onChange={e => set("name")(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                    placeholder="e.g. Sarah" />
                </div>
                <div>
                  <label className="text-xs text-zinc-500 mb-1.5 block">Business Name</label>
                  <input value={form.company_name} onChange={e => set("company_name")(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                    placeholder="e.g. Lead Friendly" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-zinc-500 mb-1.5 block">Timezone</label>
                  <select value={form.timezone} onChange={e => set("timezone")(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500">
                    <option value="America/New_York">Eastern (ET)</option>
                    <option value="America/Chicago">Central (CT)</option>
                    <option value="America/Denver">Mountain (MT)</option>
                    <option value="America/Los_Angeles">Pacific (PT)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-zinc-500 mb-1.5 block">Role</label>
                  <select value={form.role} onChange={e => set("role")(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500">
                    <option value="outbound_sales">Outbound Sales</option>
                    <option value="appointment_setter">Appointment Setter</option>
                    <option value="follow_up">Follow-up Agent</option>
                    <option value="customer_service">Customer Service</option>
                    <option value="lead_qualifier">Lead Qualifier</option>
                    <option value="reactivation">Re-activation Campaign</option>
                    <option value="inbound_support">Inbound Support</option>
                  </select>
                </div>
              </div>

              {/* Separate Inbound/Outbound Greetings */}
              <div>
                <label className="text-xs text-zinc-500 mb-1.5 block">Outbound Greeting</label>
                <textarea value={form.greeting_outbound} onChange={e => set("greeting_outbound")(e.target.value)} rows={2}
                  placeholder={"Hi {first_name}! This is {agent_name} from {company_name}. I'm calling about..."}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 resize-none" />
                <p className="text-[10px] text-zinc-600 mt-1">First thing the agent says on outbound calls.</p>
              </div>
              <div>
                <label className="text-xs text-zinc-500 mb-1.5 block">Inbound Greeting</label>
                <textarea value={form.greeting_inbound} onChange={e => set("greeting_inbound")(e.target.value)} rows={2}
                  placeholder={"Thanks for calling {company_name}! This is {agent_name}. How can I help you today?"}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 resize-none" />
              </div>
            </div>

            {/* Voice Selection */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Mic className="h-4 w-4 text-indigo-400" />
                  <h2 className="text-base font-semibold text-white">Voice</h2>
                </div>
                <button onClick={() => setShowVoicePicker(true)}
                  className="text-xs px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-indigo-300 hover:border-indigo-500 transition-colors">
                  Browse All Voices
                </button>
              </div>

              {/* Current voice card */}
              {voicesLoading ? (
                <div className="flex items-center gap-2 text-zinc-500 text-sm py-4">
                  <Loader2 className="h-4 w-4 animate-spin" />Loading voices...
                </div>
              ) : currentVoice ? (
                <div className="flex items-center gap-4 p-4 rounded-xl bg-zinc-800/50 border border-zinc-700">
                  <button
                    onClick={() => previewVoice(currentVoice.id, currentVoice.name, currentVoice.preview_url)}
                    className={cn("w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 transition-colors",
                      playingVoice === currentVoice.id ? "bg-indigo-600" : "bg-zinc-700 hover:bg-zinc-600")}
                  >
                    {playingVoice === currentVoice.id
                      ? <Square className="h-4 w-4 text-white fill-white" />
                      : <Play className="h-4 w-4 text-white fill-white ml-0.5" />}
                  </button>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-white">{currentVoice.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {currentVoice.gender && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-400 capitalize">{currentVoice.gender}</span>
                      )}
                      {currentVoice.accent && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-400">{currentVoice.accent}</span>
                      )}
                    </div>
                    {currentVoice.description && <p className="text-xs text-zinc-500 mt-1">{currentVoice.description}</p>}
                  </div>
                  <button onClick={() => setShowVoicePicker(true)}
                    className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
                    Change
                  </button>
                </div>
              ) : (
                <button onClick={() => setShowVoicePicker(true)}
                  className="w-full p-4 rounded-xl border border-dashed border-zinc-700 text-sm text-zinc-500 hover:border-indigo-500 hover:text-indigo-400 transition-colors">
                  Click to select a voice
                </button>
              )}

              {/* Voice error feedback */}
              {voiceError && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                  <Volume2 className="h-4 w-4 text-red-400 flex-shrink-0" />
                  <p className="text-xs text-red-300 flex-1">{voiceError}</p>
                  <button onClick={() => setVoiceError(null)} className="text-red-400 hover:text-red-300"><X className="h-3 w-3" /></button>
                </div>
              )}

              {/* Preview Greeting with Voice */}
              {(form.greeting_outbound || form.greeting_inbound) && form.voice_id && (
                <button
                  onClick={previewGreeting}
                  disabled={previewingGreeting}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-indigo-500/30 bg-indigo-600/10 text-sm font-medium text-indigo-300 hover:bg-indigo-600/20 transition-colors disabled:opacity-50"
                >
                  {previewingGreeting ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin" />Generating preview...</>
                  ) : (
                    <><Volume2 className="h-3.5 w-3.5" />Preview Greeting with Selected Voice</>
                  )}
                </button>
              )}

            </div>
          </div>

          {/* Right: Advanced Settings */}
          <div className="space-y-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <Settings2 className="h-4 w-4 text-indigo-400" />
                <h3 className="text-sm font-semibold text-white">Advanced Settings</h3>
              </div>

              <div className="space-y-3">
                {/* Agent Behavior — voice pacing, timing, interruptions */}
                <CollapsibleSection title="Agent Behavior" icon={Bot} description="Speed, pacing, interruptions" defaultOpen>
                  <div className="space-y-3 mt-3">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-xs text-zinc-500">Voice Speed</label>
                        <span className="text-xs text-indigo-400 font-mono">1.0x</span>
                      </div>
                      <input type="range" min={0.5} max={2} step={0.1} defaultValue={1}
                        className="w-full accent-indigo-500" />
                      <div className="flex justify-between text-[10px] text-zinc-600 mt-1">
                        <span>Slower</span><span>Normal</span><span>Faster</span>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-zinc-500 mb-1 block">Wait Time Before Speaking (seconds)</label>
                      <input type="number" value={form.wait_before_speak} onChange={e => set("wait_before_speak")(parseInt(e.target.value) || 0)}
                        min={0} max={10}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
                      <p className="text-[10px] text-zinc-600 mt-1">Delay before the agent starts speaking after the caller finishes.</p>
                    </div>
                  </div>
                </CollapsibleSection>

                {/* Call Controls */}
                <CollapsibleSection title="Call Controls" icon={Timer} description="Duration, end-call, silence">
                  <div className="space-y-3 mt-3">
                    <div>
                      <label className="text-xs text-zinc-500 mb-1 block">Max Call Duration (minutes)</label>
                      <input type="number" value={form.max_duration_mins} onChange={e => set("max_duration_mins")(parseInt(e.target.value) || 10)}
                        min={1} max={60}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
                    </div>
                    <div>
                      <label className="text-xs text-zinc-500 mb-1 block">Silence Timeout (seconds)</label>
                      <input type="number" value={form.silence_timeout} onChange={e => set("silence_timeout")(parseInt(e.target.value) || 60)}
                        min={10} max={180}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
                      <p className="text-[10px] text-zinc-600 mt-1">Auto-end call after this much silence.</p>
                    </div>
                    <div>
                      <label className="text-xs text-zinc-500 mb-1 block">End Call Phrases</label>
                      <textarea value={form.end_call_phrases} onChange={e => set("end_call_phrases")(e.target.value)} rows={2}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-indigo-500 resize-none font-mono" />
                    </div>
                  </div>
                </CollapsibleSection>

                {/* Agent Behavior */}
                <CollapsibleSection title="Agent Behavior" icon={Brain} description="Interruptions, backchanneling">
                  <div className="space-y-3 mt-3">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-xs text-zinc-500">Interruption Sensitivity</label>
                        <span className="text-xs text-indigo-400">{form.interruption_sensitivity}%</span>
                      </div>
                      <input type="range" min={0} max={100} value={form.interruption_sensitivity}
                        onChange={e => set("interruption_sensitivity")(parseInt(e.target.value))}
                        className="w-full accent-indigo-500" />
                      <div className="flex justify-between text-[10px] text-zinc-600 mt-1">
                        <span>Low</span><span>High</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-zinc-300">Backchanneling</p>
                        <p className="text-[10px] text-zinc-600">Say &quot;yeah&quot;, &quot;uh-huh&quot; while listening</p>
                      </div>
                      <button onClick={() => set("backchanneling")(!form.backchanneling)}
                        className="text-indigo-400">
                        {form.backchanneling
                          ? <ToggleRight className="h-6 w-6" />
                          : <ToggleLeft className="h-6 w-6 text-zinc-600" />}
                      </button>
                    </div>
                    {form.backchanneling && (
                      <div>
                        <label className="text-xs text-zinc-500 mb-1 block">Backchannel Words</label>
                        <input value={form.backchannel_words} onChange={e => set("backchannel_words")(e.target.value)}
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-indigo-500 font-mono" />
                      </div>
                    )}
                  </div>
                </CollapsibleSection>

                {/* Safety */}
                <CollapsibleSection title="Safety & Compliance" icon={Shield} description="DNC phrases, transfer number">
                  <div className="space-y-3 mt-3">
                    <div>
                      <label className="text-xs text-zinc-500 mb-1 block">Do-Not-Call Phrases</label>
                      <textarea value={form.dnc} onChange={e => set("dnc")(e.target.value)} rows={2}
                        placeholder="stop calling, remove me, do not call"
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-indigo-500 resize-none font-mono" />
                      <p className="text-[10px] text-zinc-600 mt-1">Comma-separated. Agent ends call gracefully when heard.</p>
                    </div>
                    <div>
                      <label className="text-xs text-zinc-500 mb-1 block">Transfer Number</label>
                      <input value={form.transfer} onChange={e => set("transfer")(e.target.value)}
                        placeholder="+1 555 123 4567"
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
                    </div>
                  </div>
                </CollapsibleSection>

                {/* Personality */}
                <CollapsibleSection title="Personality" icon={User} description="Agent tone and style">
                  <div className="space-y-3 mt-3">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-xs text-zinc-500">
                          Style: <span className="text-indigo-400">{form.personality < 33 ? "Friendly & Warm" : form.personality < 66 ? "Professional" : "Confident & Assertive"}</span>
                        </label>
                        <span className="text-xs text-indigo-400">{form.personality}%</span>
                      </div>
                      <input type="range" min={0} max={100} value={form.personality}
                        onChange={e => set("personality")(Number(e.target.value))}
                        className="w-full accent-indigo-500" />
                      <div className="flex justify-between text-[10px] text-zinc-600 mt-1">
                        <span>Friendly</span><span>Professional</span><span>Assertive</span>
                      </div>
                    </div>
                  </div>
                </CollapsibleSection>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* TAB 2: AGENT GOALS                                            */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {wizardTab === "goals" && (
        <div className="space-y-5">
          {/* Mode toggle */}
          <div className="flex items-center justify-between">
            <div className="flex gap-1 p-1 rounded-lg bg-zinc-800/50 border border-zinc-800">
              <button onClick={() => setGoalsMode("basic")}
                className={cn("px-4 py-1.5 rounded-md text-sm font-medium transition-all",
                  goalsMode === "basic" ? "bg-indigo-600 text-white" : "text-zinc-400 hover:text-white")}>
                Basic
              </button>
              <button onClick={() => setGoalsMode("advanced")}
                className={cn("px-4 py-1.5 rounded-md text-sm font-medium transition-all",
                  goalsMode === "advanced" ? "bg-indigo-600 text-white" : "text-zinc-400 hover:text-white")}>
                Advanced
              </button>
            </div>
            {goalsMode === "advanced" && (
              <button
                onClick={evaluatePrompt}
                disabled={evalLoading || !form.prompt.trim()}
                className="text-xs px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-400 hover:bg-amber-500/20 transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                {evalLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                {evalLoading ? "Evaluating..." : "Evaluate Prompt"}
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-6">
            {/* Left: Prompt / Knowledge Base */}
            <div className="space-y-5">
              {/* Knowledge Base */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <BookOpen className="h-4 w-4 text-indigo-400" />
                  <h3 className="text-sm font-semibold text-white">Knowledge Base</h3>
                </div>
                <textarea value={form.knowledge} onChange={e => set("knowledge")(e.target.value)} rows={4}
                  placeholder="Paste your company FAQ, product info, pricing, or any reference material the agent should know about..."
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 resize-none" />
                <p className="text-[10px] text-zinc-600 mt-1">The agent will reference this information during calls. You can paste documents, FAQs, or structured data.</p>
              </div>

              {goalsMode === "basic" ? (
                /* ── Basic Mode ──────────────────────────── */
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Target className="h-4 w-4 text-indigo-400" />
                    <h3 className="text-sm font-semibold text-white">Information to Collect</h3>
                  </div>
                  <p className="text-xs text-zinc-500">Select what information the agent should try to gather from callers.</p>
                  <div className="space-y-2">
                    {[
                      { label: "Full Name", desc: "Ask for the caller's first and last name" },
                      { label: "Email Address", desc: "Collect email for follow-up" },
                      { label: "Phone Number", desc: "Confirm or get alternate phone" },
                      { label: "Company / Address", desc: "Business name or physical address" },
                      { label: "Issue / Interest", desc: "What brought them to call" },
                      { label: "Preferred Meeting Time", desc: "When they're available" },
                    ].map(item => (
                      <label key={item.label} className="flex items-center gap-3 p-3 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 cursor-pointer transition-colors">
                        <input type="checkbox" defaultChecked className="rounded border-zinc-600 bg-zinc-700 text-indigo-600 focus:ring-indigo-500" />
                        <div>
                          <p className="text-sm text-white">{item.label}</p>
                          <p className="text-xs text-zinc-500">{item.desc}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              ) : (
                /* ── Advanced Mode: Prompt Editor ─────────── */
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-indigo-400" />
                      <h3 className="text-sm font-semibold text-white">Agent Prompt</h3>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <button
                          onClick={() => setShowVarMenu(!showVarMenu)}
                          onBlur={() => setTimeout(() => setShowVarMenu(false), 150)}
                          className="text-xs px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-300 hover:border-indigo-500 hover:text-indigo-300 transition-colors flex items-center gap-1.5"
                        >
                          <Hash className="h-3 w-3" /> Custom Values
                        </button>
                        {showVarMenu && (
                          <div className="absolute right-0 top-8 z-20 bg-zinc-900 border border-zinc-700 rounded-xl p-3 shadow-xl min-w-[220px]">
                            <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Click to insert at cursor</p>
                            <div className="grid grid-cols-2 gap-1">
                              {VARS.map(v => (
                                <button key={v}
                                  type="button"
                                  onMouseDown={e => e.preventDefault()}
                                  onClick={() => { insertVariable(v); setShowVarMenu(false); }}
                                  className="text-xs px-2 py-1.5 rounded-lg bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20 text-left font-mono transition-colors">
                                  {v}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <textarea
                    ref={promptTextareaRef}
                    value={form.prompt}
                    onChange={e => set("prompt")(e.target.value)}
                    rows={16}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-300 focus:outline-none focus:border-indigo-500 resize-none leading-relaxed font-mono"
                    placeholder={"You are {agent_name}, a sales agent for {company_name}...\n\nYour goal is to...\n\nWhen objections arise..."}
                  />
                  <p className="text-[10px] text-zinc-600">This is the main instruction set for your AI agent. Use Custom Values to personalize each call.</p>

                  {/* Modular script sections */}
                  <div className="space-y-2 mt-4">
                    <CollapsibleSection title="Objection Handling" icon={Shield} description="How to handle common objections">
                      <textarea value={form.objections} onChange={e => set("objections")(e.target.value)} rows={5}
                        placeholder={"If they say \"not interested\": I understand. Can I ask what you're currently using?\n\nIf they say \"too expensive\": I hear you. Let me share what clients typically save..."}
                        className="w-full mt-3 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-300 focus:outline-none focus:border-indigo-500 resize-none" />
                    </CollapsibleSection>

                    <CollapsibleSection title="Closing Script" icon={Target} description="How to wrap up the call">
                      <textarea value={form.closing} onChange={e => set("closing")(e.target.value)} rows={4}
                        placeholder="Great speaking with you today! Just to confirm, I've got you down for [date] at [time]. You'll receive a confirmation email shortly..."
                        className="w-full mt-3 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-300 focus:outline-none focus:border-indigo-500 resize-none" />
                    </CollapsibleSection>
                  </div>
                </div>
              )}

              {/* Prompt Evaluation Results */}
              {evalResult && (
                <PromptEvalPanel result={evalResult} onClose={() => setEvalResult(null)} />
              )}
            </div>

            {/* Right: Actions */}
            <div className="space-y-4">
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-indigo-400" />
                    <h3 className="text-sm font-semibold text-white">Actions</h3>
                  </div>
                  <div className="relative">
                    <button
                      onClick={() => setShowActionMenu(!showActionMenu)}
                      className="text-xs px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors flex items-center gap-1.5"
                    >
                      <Plus className="h-3 w-3" /> New Action
                    </button>
                    {showActionMenu && (
                      <div className="absolute right-0 top-9 z-20 bg-zinc-900 border border-zinc-700 rounded-xl p-2 shadow-xl min-w-[260px]">
                        {ACTION_TYPES.map(at => (
                          <button key={at.type}
                            onClick={() => addAction(at.type)}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-zinc-800 transition-colors text-left"
                          >
                            <at.icon className="h-4 w-4 text-indigo-400 flex-shrink-0" />
                            <div>
                              <p className="text-sm text-white">{at.label}</p>
                              <p className="text-[10px] text-zinc-500">{at.description}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {actions.length === 0 ? (
                  <div className="text-center py-8">
                    <Zap className="h-8 w-8 text-zinc-700 mx-auto mb-2" />
                    <p className="text-xs text-zinc-500">No actions configured</p>
                    <p className="text-[10px] text-zinc-600 mt-1">Add actions to let your agent book meetings, transfer calls, and more.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {actions.map(action => {
                      const actionType = ACTION_TYPES.find(at => at.type === action.type);
                      if (!actionType) return null;
                      const Icon = actionType.icon;
                      return (
                        <div key={action.id} className="flex items-center gap-3 p-3 rounded-xl bg-zinc-800/50 border border-zinc-700 group">
                          <GripVertical className="h-3.5 w-3.5 text-zinc-600 flex-shrink-0" />
                          <Icon className="h-4 w-4 text-indigo-400 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white">{actionType.label}</p>
                            <p className="text-[10px] text-zinc-500">{actionType.description}</p>
                          </div>
                          <button
                            onClick={() => removeAction(action.id)}
                            className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400 transition-all"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Action-specific config */}
                {actions.some(a => a.type === "transfer_call") && (
                  <div className="mt-4 pt-4 border-t border-zinc-800">
                    <label className="text-xs text-zinc-500 mb-1.5 block">Transfer Number</label>
                    <input value={form.transfer} onChange={e => set("transfer")(e.target.value)}
                      placeholder="+1 555 123 4567"
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* TAB 3: PHONE & TEST                                           */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {wizardTab === "phone" && (
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-6">
          {/* Left: Info */}
          <div className="space-y-5">
            {/* Phone Number Info */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <Phone className="h-4 w-4 text-indigo-400" />
                <h2 className="text-base font-semibold text-white">Phone Numbers</h2>
              </div>
              <div className="rounded-xl bg-zinc-800/50 border border-zinc-700 p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-indigo-600/20 flex items-center justify-center">
                    <Phone className="h-5 w-5 text-indigo-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white">Number Pool (Auto-Rotation)</p>
                    <p className="text-xs text-zinc-500">Calls will automatically rotate through your active phone numbers to prevent spam flagging.</p>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Active</span>
                </div>
              </div>
              <div className="rounded-lg border border-indigo-500/20 bg-indigo-500/5 p-3">
                <p className="text-xs text-indigo-300">Phone numbers are managed in Settings &gt; Phone Numbers. Your agent will use round-robin rotation across all active numbers automatically.</p>
              </div>
            </div>

            {/* Agent Summary */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <Bot className="h-4 w-4 text-indigo-400" />
                <h2 className="text-base font-semibold text-white">Agent Summary</h2>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between py-2 border-b border-zinc-800">
                  <span className="text-zinc-500">Name</span>
                  <span className="text-white font-medium">{form.name || "Not set"}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-zinc-800">
                  <span className="text-zinc-500">Voice</span>
                  <span className="text-white">{voiceDisplayName}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-zinc-800">
                  <span className="text-zinc-500">Role</span>
                  <span className="text-white capitalize">{form.role.replace(/_/g, " ")}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-zinc-800">
                  <span className="text-zinc-500">Max Duration</span>
                  <span className="text-white">{form.max_duration_mins} min</span>
                </div>
                <div className="flex justify-between py-2 border-b border-zinc-800">
                  <span className="text-zinc-500">Actions</span>
                  <span className="text-white">{actions.length} configured</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-zinc-500">Prompt</span>
                  <span className={form.prompt.trim() ? "text-emerald-400" : "text-amber-400"}>
                    {form.prompt.trim() ? `${form.prompt.length} chars` : "Not set"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Create & Next Steps */}
          <div className="space-y-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <FlaskConical className="h-4 w-4 text-indigo-400" />
                <h3 className="text-sm font-semibold text-white">Ready to Create?</h3>
              </div>

              <p className="text-xs text-zinc-400">
                Once you create this agent, you&apos;ll be able to test it with phone calls, chat simulations, and AI-powered evaluations.
              </p>

              <button
                onClick={handleSave}
                disabled={saving || !form.name.trim()}
                className="w-full px-4 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving ? "Creating..." : saved ? "Created!" : "Create Agent"}
              </button>

              <div className="border-t border-zinc-800 pt-4">
                <p className="text-xs text-zinc-400 font-medium uppercase tracking-wide mb-3">After Creation</p>
                <div className="space-y-2 text-xs text-zinc-500">
                  <div className="flex items-start gap-2">
                    <Phone className="h-3.5 w-3.5 text-indigo-400 mt-0.5 flex-shrink-0" />
                    <span>Test with outbound calls to your phone</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <MessageSquare className="h-3.5 w-3.5 text-indigo-400 mt-0.5 flex-shrink-0" />
                    <span>Chat simulation for quick testing</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Bot className="h-3.5 w-3.5 text-indigo-400 mt-0.5 flex-shrink-0" />
                    <span>AI simulation for automated testing</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <BarChart2 className="h-3.5 w-3.5 text-indigo-400 mt-0.5 flex-shrink-0" />
                    <span>Run evals and review performance</span>
                  </div>
                </div>
              </div>

              <div className="border-t border-zinc-800 pt-4">
                <p className="text-xs text-zinc-400 font-medium uppercase tracking-wide mb-3">Quick Info</p>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Voice</span>
                    <span className="text-white">{voiceDisplayName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Number Pool</span>
                    <span className="text-emerald-400">Auto-rotation</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Direction</span>
                    <span className="text-white">{form.role.includes("inbound") ? "Inbound" : "Outbound"}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Voice Picker Modal */}
      {showVoicePicker && (
        <VoicePickerModal
          voices={voices}
          currentVoiceId={form.voice_id}
          onSelect={(id) => set("voice_id")(id)}
          onClose={() => setShowVoicePicker(false)}
          playingVoice={playingVoice}
          onPreview={previewVoice}
        />
      )}
    </div>
  );
}
