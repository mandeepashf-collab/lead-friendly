'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, RotateCcw, MessageSquare, Loader2, Phone, PhoneOff, Volume2, Download, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SUGGESTED_CHAT_MESSAGES } from '@/lib/test-scenarios'
import { getVoiceName, getVoiceDisplayLabel } from '@/lib/voices'
import { CallAnalysis, type AnalysisData } from './CallAnalysis'

interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  tokenEstimate?: number
}

interface Props {
  agentId: string
  agentName: string
  systemPrompt: string
  voiceId?: string
  onAnalysis?: (analysis: AnalysisData) => void
}

export function AgentChatSimulator({ agentId, agentName, systemPrompt, voiceId, onAnalysis }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [callStarted, setCallStarted] = useState(false)
  const [error, setError] = useState('')
  const [playingVoice, setPlayingVoice] = useState<number | null>(null)
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function startCall() {
    setCallStarted(true)
    setMessages([])
    setError('')
    setAnalysis(null)
    setLoading(true)

    try {
      const res = await fetch('/api/agents/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemPrompt,
          agentName,
          messages: [{ role: 'user', content: '__START_CALL__' }],
        }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)

      setMessages([{
        role: 'assistant',
        content: data.reply,
        timestamp: new Date(),
        tokenEstimate: Math.ceil(data.reply.split(' ').length * 1.3),
      }])
      setTimeout(() => inputRef.current?.focus(), 100)
    } catch {
      setError('Failed to start call. Check your API key.')
      setCallStarted(false)
    } finally {
      setLoading(false)
    }
  }

  async function endCall() {
    setCallStarted(false)

    // Generate analysis if there are messages
    if (messages.length > 1) {
      try {
        const fullText = messages
          .map((m) => `${m.role === 'assistant' ? 'Agent' : 'Customer'}: ${m.content}`)
          .join('\n')

        const res = await fetch('/api/agents/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemPrompt: `You are analyzing an AI agent chat test. Return ONLY valid JSON (no markdown): {"score":1-10,"summary":"string","strengths":["...","..."],"improvements":["...","..."],"goal_achieved":true/false,"goal_label":"string"}`,
            agentName: 'Analyzer',
            messages: [{ role: 'user', content: `Agent purpose: "${systemPrompt?.slice(0, 200)}"\n\nTRANSCRIPT:\n${fullText}\n\nAnalyze and return JSON.` }],
          }),
        })
        if (res.ok) {
          const data = await res.json()
          const cleaned = (data.reply || '{}').replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
          const parsed = JSON.parse(cleaned)
          const analysisData = {
            ...parsed,
            turns: messages.length,
            agent_talk_ratio: Math.round((messages.filter(m => m.role === 'assistant').length / messages.length) * 100),
          }
          setAnalysis(analysisData)
          onAnalysis?.(analysisData)
        }
      } catch {
        // Skip analysis on failure
      }
    }
    setInput('')
    setError('')
  }

  function resetAll() {
    setMessages([])
    setInput('')
    setError('')
    setAnalysis(null)
    setCallStarted(false)
  }

  async function sendMessage(text?: string) {
    const msgText = text || input.trim()
    if (!msgText || loading) return
    if (text) setInput('')
    else setInput('')
    setError('')

    if (!callStarted) await startCall()

    const userMsg: Message = { role: 'user', content: msgText, timestamp: new Date() }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setLoading(true)

    try {
      const res = await fetch('/api/agents/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemPrompt,
          agentName,
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
        }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.reply,
        timestamp: new Date(),
        tokenEstimate: Math.ceil(data.reply.split(' ').length * 1.3),
      }])
    } catch {
      setError('Something went wrong. Try again.')
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  async function playAsVoice(text: string, index: number) {
    if (playingVoice === index) {
      audioRef.current?.pause()
      setPlayingVoice(null)
      return
    }
    audioRef.current?.pause()
    setPlayingVoice(index)
    try {
      const res = await fetch('/api/voice/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voiceId: voiceId || undefined }),
      })
      if (!res.ok) { setPlayingVoice(null); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audioRef.current = audio
      audio.play()
      audio.onended = () => { setPlayingVoice(null); URL.revokeObjectURL(url) }
      audio.onerror = () => setPlayingVoice(null)
    } catch {
      setPlayingVoice(null)
    }
  }

  function exportTranscript() {
    const text = messages
      .map(m => `[${m.role === 'assistant' ? agentName : 'Customer'}] ${m.timestamp.toLocaleTimeString()}\n${m.content}`)
      .join('\n\n')
    const blob = new Blob([`Agent Test Transcript\n${'='.repeat(40)}\nAgent: ${agentName}\nDate: ${new Date().toLocaleDateString()}\n\n${text}`], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${agentName.replace(/\s+/g, '-').toLowerCase()}-test-${Date.now()}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  function formatTime(d: Date) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden" style={{ minHeight: '480px', maxHeight: '560px' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <MessageSquare size={14} className="text-indigo-400 flex-shrink-0" />
            <span className="text-sm font-medium text-white">Chat Simulator</span>
            {voiceId && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700 truncate"
                title={`Voice: ${getVoiceDisplayLabel(voiceId)}`}
              >
                {getVoiceDisplayLabel(voiceId)}
              </span>
            )}
            {callStarted && (
              <span className="flex items-center gap-1 text-xs text-emerald-400 flex-shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button onClick={exportTranscript}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600 transition-colors">
                <Download size={10} />Export
              </button>
            )}
            {callStarted && (
              <button onClick={endCall}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:border-red-500/50 hover:text-red-400 transition-colors">
                <PhoneOff size={11} />End
              </button>
            )}
            {messages.length > 0 && !callStarted && (
              <button onClick={resetAll}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:border-zinc-600 transition-colors">
                <RotateCcw size={11} />Reset
              </button>
            )}
          </div>
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
          {!callStarted && messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center py-8">
              <div className="w-12 h-12 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-3">
                <Phone size={20} className="text-indigo-400" />
              </div>
              <p className="text-sm font-medium text-zinc-400 mb-1">Chat Simulator</p>
              <p className="text-xs text-zinc-600 mb-4 max-w-48">Type a message to start, or click a suggestion below</p>
              <button onClick={() => startCall()}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors">
                <Phone size={13} />Start test call
              </button>
            </div>
          )}

          {loading && messages.length === 0 && callStarted && (
            <div className="flex items-center justify-center h-full">
              <div className="flex items-center gap-2 text-zinc-500 text-sm">
                <Loader2 size={14} className="animate-spin text-indigo-400" />Agent is starting…
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && (
                <div className="w-6 h-6 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center flex-shrink-0 mr-2 mt-0.5">
                  <span className="text-xs text-indigo-400 font-bold">{agentName[0]}</span>
                </div>
              )}
              <div className={`max-w-[80%] ${msg.role === 'user' ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                <div className={`px-3 py-2 rounded-xl text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-indigo-600 text-white rounded-br-sm'
                    : 'bg-zinc-800 text-zinc-100 rounded-bl-sm'
                }`}>
                  {msg.content}
                </div>
                <div className={cn(
                  "flex items-center gap-2",
                  msg.role === 'user' ? 'justify-end' : 'justify-start'
                )}>
                  <span className="text-xs text-zinc-600">{formatTime(msg.timestamp)}</span>
                  {msg.role === 'assistant' && (
                    <>
                      {msg.tokenEstimate && (
                        <span className="text-xs text-zinc-700 flex items-center gap-0.5">
                          <Zap className="h-2.5 w-2.5" />{msg.tokenEstimate} tokens
                        </span>
                      )}
                      <button
                        onClick={() => playAsVoice(msg.content, i)}
                        className={cn(
                          "flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border transition-colors",
                          playingVoice === i
                            ? "border-indigo-500/40 bg-indigo-500/10 text-indigo-400"
                            : "border-zinc-800 text-zinc-600 hover:text-zinc-400 hover:border-zinc-700"
                        )}
                      >
                        <Volume2 className="h-2.5 w-2.5" />
                        {playingVoice === i ? 'Playing…' : 'Play'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}

          {loading && messages.length > 0 && (
            <div className="flex justify-start">
              <div className="w-6 h-6 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center flex-shrink-0 mr-2 mt-0.5">
                <span className="text-xs text-indigo-400 font-bold">{agentName[0]}</span>
              </div>
              <div className="px-3 py-2.5 bg-zinc-800 rounded-xl rounded-bl-sm flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce" style={{animationDelay:'0ms'}} />
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce" style={{animationDelay:'150ms'}} />
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce" style={{animationDelay:'300ms'}} />
              </div>
            </div>
          )}

          {error && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-center">
              {error}
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Suggested messages */}
        {!callStarted && messages.length === 0 && (
          <div className="px-3 py-2 border-t border-zinc-800 shrink-0">
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTED_CHAT_MESSAGES.slice(0, 4).map(s => (
                <button key={s} onClick={() => { setCallStarted(true); sendMessage(s) }}
                  className="text-xs px-2.5 py-1 rounded-full border border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300 transition-colors">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Suggestion chips during call */}
        {callStarted && !loading && (
          <div className="px-3 pt-2 shrink-0">
            <div className="flex gap-1.5 flex-wrap">
              {SUGGESTED_CHAT_MESSAGES.slice(4).map(s => (
                <button key={s} onClick={() => sendMessage(s)}
                  className="text-xs px-2 py-1 rounded-full border border-zinc-800 text-zinc-600 hover:border-zinc-600 hover:text-zinc-400 transition-colors">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        {(callStarted || messages.length > 0) && (
          <div className="px-3 py-3 border-t border-zinc-800 shrink-0">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                placeholder="Type as the caller…"
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500 placeholder:text-zinc-600"
                disabled={loading}
              />
              <button onClick={() => sendMessage()} disabled={loading || !input.trim()}
                className="w-9 h-9 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg flex items-center justify-center flex-shrink-0 transition-colors">
                {loading ? <Loader2 size={14} className="animate-spin text-white" /> : <Send size={14} className="text-white" />}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Analysis */}
      {analysis && (
        <CallAnalysis
          analysis={analysis}
          agentId={agentId}
          systemPrompt={systemPrompt}
          onTestAgain={resetAll}
        />
      )}
    </div>
  )
}
