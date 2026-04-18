'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Sparkles, Layers, PenLine, Upload, X, Loader2,
  ChevronRight, Check, ArrowLeft, ArrowRight, Volume2, Phone, Play, Pause
} from 'lucide-react'
import { AGENT_TEMPLATES, EXAMPLE_DESCRIPTIONS, type AgentTemplate } from '@/lib/agent-templates'
import { createAIAgent } from '@/hooks/use-ai-agents'

interface Voice {
  id: string
  name: string
  gender: string
  accent: string
  description: string
  preview_url: string
}

interface GeneratedAgent {
  agentName: string
  personality: string
  greeting: string
  systemPrompt: string
  objectionHandling: string
  knowledgeBase: string
}

const TYPE_BADGE: Record<string, { label: string; cls: string }> = {
  outbound: { label: 'Outbound', cls: 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' },
  inbound:  { label: 'Inbound',  cls: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' },
  both:     { label: 'Both',     cls: 'bg-amber-500/10 text-amber-400 border border-amber-500/20' },
}

export default function BuildAgentPage() {
  const router = useRouter()

  const fileInputRef = useRef<HTMLInputElement>(null)

  const [activeTab, setActiveTab] = useState<'ai' | 'templates' | 'blank'>('ai')
  const [filter, setFilter] = useState<'all' | 'outbound' | 'inbound' | 'appointment'>('all')

  // AI builder state
  const [description, setDescription] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [fileContents, setFileContents] = useState<string[]>([])
  const [generating, setGenerating] = useState(false)
  const [genStep, setGenStep] = useState('')
  const [generated, setGenerated] = useState<GeneratedAgent | null>(null)
  const [genError, setGenError] = useState('')

  // Editable generated fields
  const [editName, setEditName] = useState('')
  const [editPersonality, setEditPersonality] = useState('')
  const [editGreeting, setEditGreeting] = useState('')
  const [editPrompt, setEditPrompt] = useState('')
  const [editObjections, setEditObjections] = useState('')

  // Template state
  const [selectedTemplate, setSelectedTemplate] = useState<AgentTemplate | null>(null)
  const [fromTemplate, setFromTemplate] = useState<AgentTemplate | null>(null)

  // Save state
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')

  // Voice picker state
  const [voices, setVoices] = useState<Voice[]>([])
  const [editVoiceId, setEditVoiceId] = useState<string>('21m00Tcm4TlvDq8ikWAM') // Rachel default
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Test-call state
  const [testPhone, setTestPhone] = useState('')
  const [testCalling, setTestCalling] = useState(false)
  const [testMsg, setTestMsg] = useState<string | null>(null)

  // Load voices on mount
  useEffect(() => {
    fetch('/api/voice/voices').then(r => r.json()).then(d => {
      if (Array.isArray(d?.voices)) setVoices(d.voices)
    }).catch(() => {})
  }, [])

  function previewVoice(v: Voice) {
    // Toggle: clicking the playing voice stops it
    if (playingVoiceId === v.id && audioRef.current) {
      audioRef.current.pause()
      setPlayingVoiceId(null)
      return
    }
    if (audioRef.current) audioRef.current.pause()
    const audio = new Audio(v.preview_url)
    audio.onended = () => setPlayingVoiceId(null)
    audio.play().catch(() => setPlayingVoiceId(null))
    audioRef.current = audio
    setPlayingVoiceId(v.id)
  }

  async function runTestCall() {
    setTestMsg(null)
    const clean = testPhone.replace(/[^\d+]/g, '')
    if (clean.length < 10) { setTestMsg('Enter a valid phone number first'); return }
    setTestCalling(true)
    try {
      const res = await fetch('/api/agents/test-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: clean,
          greeting: editGreeting,
          systemPrompt: editPrompt,
          voiceId: editVoiceId,
        }),
      })
      const data = await res.json()
      setTestMsg(res.ok ? `✓ Test call started — watch your phone` : (data.error || 'Test call failed'))
    } catch {
      setTestMsg('Test call failed')
    } finally {
      setTestCalling(false)
      setTimeout(() => setTestMsg(null), 8000)
    }
  }

  // Auto-select template from URL param
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const templateId = params.get('template')
    if (templateId) {
      const t = AGENT_TEMPLATES.find(x => x.id === templateId)
      if (t) {
        setFromTemplate(t)
        setSelectedTemplate(t)
        setActiveTab('templates')
        applyTemplate(t)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function applyTemplate(t: AgentTemplate) {
    setFromTemplate(t)
    setGenerated({
      agentName: t.agentName,
      personality: t.personality,
      greeting: t.greeting,
      systemPrompt: t.systemPrompt,
      objectionHandling: t.objectionHandling,
      knowledgeBase: '',
    })
    setEditName(t.agentName)
    setEditPersonality(t.personality)
    setEditGreeting(t.greeting)
    setEditPrompt(t.systemPrompt)
    setEditObjections(t.objectionHandling)
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const newFiles = Array.from(e.target.files || [])
    setFiles(prev => [...prev, ...newFiles])
    for (const file of newFiles) {
      const reader = new FileReader()
      reader.onload = ev => {
        const text = ev.target?.result as string
        setFileContents(prev => [...prev, `--- ${file.name} ---\n${text.substring(0, 8000)}`])
      }
      reader.readAsText(file)
    }
  }

  async function handleGenerate() {
    if (description.trim().length < 20) {
      setGenError('Please write at least a sentence describing your business.')
      return
    }
    setGenError('')
    setGenerating(true)
    setGenerated(null)
    setFromTemplate(null)

    const steps = ['Reading your description...', 'Analyzing your business...', 'Writing your agent prompt...', 'Finalizing...']
    for (let i = 0; i < steps.length - 1; i++) {
      setGenStep(steps[i])
      await new Promise(r => setTimeout(r, 700))
    }
    setGenStep(steps[steps.length - 1])

    try {
      const res = await fetch('/api/agents/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: description.trim(),
          knowledgeBase: fileContents.join('\n\n'),
        }),
      })
      if (!res.ok) throw new Error('Generation failed')
      const data: GeneratedAgent = await res.json()
      setGenerated(data)
      setEditName(data.agentName)
      setEditPersonality(data.personality)
      setEditGreeting(data.greeting)
      setEditPrompt(data.systemPrompt)
      setEditObjections(data.objectionHandling)
    } catch {
      setGenError('Something went wrong. Please try again.')
    } finally {
      setGenerating(false)
      setGenStep('')
    }
  }

  async function handleSave() {
    setSaving(true)
    setSaveError('')
    try {
      const { data, error } = await createAIAgent({
        name: editName,
        type: fromTemplate?.type === 'inbound' ? 'inbound' : 'outbound',
        system_prompt: [editPrompt, editObjections ? `\n\nOBJECTION HANDLING:\n${editObjections}` : ''].join(''),
        greeting_message: editGreeting,
        voice_id: editVoiceId,
      })

      if (error) throw new Error(error)
      setSaved(true)
      setTimeout(() => router.push('/ai-agents'), 1500)
    } catch (e: any) {
      setSaveError(e.message || 'Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const showForm = !!generated
  const filteredTemplates = filter === 'all'
    ? AGENT_TEMPLATES
    : AGENT_TEMPLATES.filter(t => t.tags.includes(filter))

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <div className="border-b border-zinc-800 bg-zinc-900/50 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-4">
          <Link href="/ai-agents" className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <div className="flex-1">
            <h1 className="text-base font-semibold text-white flex items-center gap-2">
              <Sparkles size={16} className="text-indigo-400" /> Create AI Agent
            </h1>
            <p className="text-xs text-zinc-500">Choose how you want to build</p>
          </div>
          {fromTemplate && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              {fromTemplate.icon} {fromTemplate.name}
            </span>
          )}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8">

        {/* Tab switcher — only show when no form is visible */}
        {!showForm && (
          <div className="flex gap-2 mb-8 p-1 bg-zinc-900 border border-zinc-800 rounded-xl">
            {[
              { id: 'ai',        icon: Sparkles, label: 'Build with AI' },
              { id: 'templates', icon: Layers,   label: 'Templates' },
              { id: 'blank',     icon: PenLine,  label: 'Manual setup' },
            ].map(tab => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  onClick={() => tab.id === 'blank' ? router.push('/ai-agents/new') : setActiveTab(tab.id as any)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === tab.id && tab.id !== 'blank'
                      ? 'bg-zinc-800 text-white'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  <Icon size={14} /> {tab.label}
                </button>
              )
            })}
          </div>
        )}

        {/* ── AI BUILDER TAB ── */}
        {activeTab === 'ai' && !showForm && (
          <div className="space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">Describe your business</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={6}
                placeholder={'e.g. "I run a dental clinic in Seattle called Smile Center. We\'re open Mon-Fri 9am-5pm, accept Delta Dental and Cigna. I want the agent to book appointments and answer patient questions..."'}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-indigo-500 placeholder:text-zinc-600 resize-none transition-colors"
              />
              <p className="text-xs text-zinc-600">Include: business name, hours, services, location, what you want the agent to do.</p>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-zinc-500">EXAMPLE DESCRIPTIONS</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(EXAMPLE_DESCRIPTIONS).map(([label, prompt]) => (
                  <button key={label} onClick={() => setDescription(prompt)}
                    className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-300 transition-colors">
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">
                Upload knowledge base <span className="text-zinc-600 font-normal">(optional)</span>
              </label>
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border border-dashed border-zinc-700 rounded-xl p-5 text-center cursor-pointer hover:border-zinc-500 transition-colors">
                <Upload size={18} className="mx-auto mb-1.5 text-zinc-600" />
                <p className="text-sm text-zinc-500">Price list, FAQ, menu, or policy document</p>
                <p className="text-xs text-zinc-700 mt-0.5">PDF, TXT, DOCX</p>
              </div>
              <input ref={fileInputRef} type="file" multiple accept=".pdf,.txt,.docx,.doc"
                onChange={handleFileUpload} className="hidden" />
              {files.map((f, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span className="text-sm text-zinc-300">{f.name}</span>
                    <span className="text-xs text-zinc-600">({(f.size/1024).toFixed(0)}KB)</span>
                  </div>
                  <button onClick={() => { setFiles(p=>p.filter((_,j)=>j!==i)); setFileContents(p=>p.filter((_,j)=>j!==i)) }}
                    className="text-zinc-600 hover:text-red-400 transition-colors"><X size={13} /></button>
                </div>
              ))}
            </div>

            {genError && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">{genError}</p>}

            <button onClick={handleGenerate} disabled={generating || description.trim().length < 10}
              className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2 text-sm">
              {generating
                ? <><Loader2 size={15} className="animate-spin" /> {genStep || 'Building...'}</>
                : <><Sparkles size={15} /> Build my agent <ChevronRight size={15} /></>}
            </button>

            <p className="text-center text-xs text-zinc-600">
              Prefer templates?{' '}
              <button onClick={() => setActiveTab('templates')} className="text-indigo-400 hover:text-indigo-300 transition-colors">
                Browse 8 industry templates →
              </button>
            </p>
          </div>
        )}

        {/* ── TEMPLATES TAB ── */}
        {activeTab === 'templates' && !showForm && (
          <div className="space-y-5">
            <div className="flex gap-2 flex-wrap">
              {[
                { id: 'all', label: 'All' },
                { id: 'outbound', label: 'Outbound' },
                { id: 'inbound', label: 'Inbound' },
                { id: 'appointment', label: 'Appointment booking' },
              ].map(f => (
                <button key={f.id} onClick={() => setFilter(f.id as any)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    filter === f.id
                      ? 'border-indigo-500 bg-indigo-500/10 text-indigo-400'
                      : 'border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300'
                  }`}>
                  {f.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              {filteredTemplates.map(t => (
                <div key={t.id}
                  onClick={() => { setSelectedTemplate(t); applyTemplate(t) }}
                  className={`bg-zinc-900 border rounded-xl overflow-hidden cursor-pointer transition-all hover:border-zinc-600 ${
                    selectedTemplate?.id === t.id ? 'border-indigo-500' : 'border-zinc-800'
                  }`}>
                  <div className="h-1" style={{ backgroundColor: t.color }} />
                  <div className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{t.icon}</span>
                        <div>
                          <p className="text-sm font-medium text-white leading-tight">{t.name}</p>
                          <p className="text-xs text-zinc-600">{t.industry}</p>
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-zinc-500 leading-relaxed mb-3">{t.description}</p>
                    <div className="flex items-center justify-between">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${TYPE_BADGE[t.type].cls}`}>
                        {TYPE_BADGE[t.type].label}
                      </span>
                      <span className="text-xs text-indigo-400 flex items-center gap-1">
                        Use <ArrowRight size={11} />
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-center text-xs text-zinc-600">
              Want something custom?{' '}
              <button onClick={() => setActiveTab('ai')} className="text-indigo-400 hover:text-indigo-300 transition-colors">
                Build with AI instead →
              </button>
            </p>
          </div>
        )}

        {/* ── GENERATED / TEMPLATE FORM ── */}
        {showForm && (
          <div className="space-y-5">
            {/* Banner */}
            <div className="flex items-center gap-3 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
              <div className="w-7 h-7 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                <Check size={14} className="text-emerald-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-emerald-400">
                  {fromTemplate ? `${fromTemplate.icon} ${fromTemplate.name} template loaded` : 'Agent generated — review and save'}
                </p>
                <p className="text-xs text-zinc-500 mt-0.5">All fields are editable. Save when ready.</p>
              </div>
              <button onClick={() => { setGenerated(null); setFromTemplate(null); setSelectedTemplate(null) }}
                className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1 transition-colors flex-shrink-0">
                <ArrowLeft size={11} /> Back
              </button>
            </div>

            {/* Name + Personality */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-500">AGENT NAME</label>
                <input value={editName} onChange={e => setEditName(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-indigo-500" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-500">PERSONALITY</label>
                <div className="flex gap-2 h-[42px]">
                  {['professional', 'friendly', 'assertive'].map(p => (
                    <button key={p} onClick={() => setEditPersonality(p)}
                      className={`flex-1 text-xs rounded-lg border capitalize transition-colors ${
                        editPersonality === p
                          ? 'border-indigo-500 bg-indigo-500/10 text-indigo-400'
                          : 'border-zinc-700 text-zinc-500 hover:border-zinc-600'
                      }`}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Greeting */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-500">OPENING GREETING</label>
              <textarea value={editGreeting} onChange={e => setEditGreeting(e.target.value)} rows={3}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-indigo-500 resize-none" />
            </div>

            {/* System prompt */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-500">SYSTEM PROMPT</label>
              <textarea value={editPrompt} onChange={e => setEditPrompt(e.target.value)} rows={14}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-xs text-zinc-300 outline-none focus:border-indigo-500 resize-none font-mono leading-relaxed" />
            </div>

            {/* Objections */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-500">OBJECTION HANDLING</label>
              <textarea value={editObjections} onChange={e => setEditObjections(e.target.value)} rows={5}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-300 outline-none focus:border-indigo-500 resize-none" />
            </div>

            {/* Knowledge base (AI builder only) */}
            {generated?.knowledgeBase && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-500">EXTRACTED KNOWLEDGE BASE</label>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-xs text-zinc-500 font-mono leading-relaxed max-h-40 overflow-y-auto whitespace-pre-wrap">
                  {generated.knowledgeBase}
                </div>
              </div>
            )}

            {/* Voice picker */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-500 flex items-center gap-1.5">
                <Volume2 size={12} /> VOICE
              </label>
              <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
                {voices.map(v => (
                  <div
                    key={v.id}
                    onClick={() => setEditVoiceId(v.id)}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${
                      editVoiceId === v.id
                        ? 'border-indigo-500 bg-indigo-500/10'
                        : 'border-zinc-800 bg-zinc-900 hover:border-zinc-600'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); previewVoice(v) }}
                      className="flex-shrink-0 w-8 h-8 rounded-full bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-400"
                      title="Preview voice"
                    >
                      {playingVoiceId === v.id ? <Pause size={12} /> : <Play size={12} />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{v.name}</p>
                      <p className="text-xs text-zinc-500 truncate">{v.accent} · {v.gender}</p>
                    </div>
                    {editVoiceId === v.id && <Check size={14} className="text-indigo-400 flex-shrink-0" />}
                  </div>
                ))}
              </div>
              {voices.length === 0 && (
                <p className="text-xs text-zinc-600">Loading voices…</p>
              )}
            </div>

            {/* Test call */}
            <div className="space-y-2 p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl">
              <label className="text-xs font-medium text-zinc-500 flex items-center gap-1.5">
                <Phone size={12} /> TEST CALL — ring your phone to hear this agent
              </label>
              <div className="flex gap-2">
                <input
                  type="tel"
                  value={testPhone}
                  onChange={e => setTestPhone(e.target.value)}
                  placeholder="+1 555 123 4567"
                  className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
                />
                <button
                  type="button"
                  onClick={runTestCall}
                  disabled={testCalling || !testPhone}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors"
                >
                  {testCalling ? <Loader2 size={13} className="animate-spin" /> : <Phone size={13} />}
                  {testCalling ? 'Calling…' : 'Call me'}
                </button>
              </div>
              {testMsg && (
                <p className={`text-xs rounded-lg px-3 py-2 ${
                  testMsg.startsWith('✓') ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                }`}>{testMsg}</p>
              )}
            </div>

            {saveError && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">{saveError}</p>}

            <button onClick={handleSave} disabled={saving || saved}
              className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2 text-sm">
              {saved
                ? <><Check size={15} className="text-emerald-400" /> Saved! Redirecting...</>
                : saving
                ? <><Loader2 size={15} className="animate-spin" /> Saving agent...</>
                : <>Save &amp; activate agent <ChevronRight size={15} /></>}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
