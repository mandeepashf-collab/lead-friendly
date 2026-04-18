"use client";
import { useState, useRef, useEffect } from "react";
import { Play, Pause, Volume2, Settings, Flag, X, ChevronDown, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface TranscriptLine {
  index: number;
  timestamp: string;
  speaker: "agent" | "user";
  text: string;
  annotation?: {
    type: string;
    description: string;
    lineNum: number;
  };
}

interface CallRecord {
  id: string;
  displayId: string;
  phone: string;
  date: string;
  duration: string;
  recording_url?: string;
  transcript: TranscriptLine[];
  tags: string[];
}

const ANNOTATION_TYPES = [
  { value: "BAD", label: "Needs Improvement", color: "bg-red-500/10 border-red-500/30 text-red-400" },
  { value: "GOOD", label: "Good Response", color: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" },
  { value: "COMMENT", label: "Comment", color: "bg-blue-500/10 border-blue-500/30 text-blue-400" },
];

function msToTimestamp(ms: number) {
  const totalSecs = Math.floor(ms / 1000);
  const m = Math.floor(totalSecs / 60);
  const s = totalSecs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function AnnotatePage({ agentId }: { agentId: string }) {
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [includePrevious, setIncludePrevious] = useState(false);
  const [minDuration, setMinDuration] = useState(5);
  const [jumpTo, setJumpTo] = useState('');
  const [annotatingLine, setAnnotatingLine] = useState<number | null>(null);
  const [annotationType, setAnnotationType] = useState('BAD');
  const [annotationText, setAnnotationText] = useState('');
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [newTag, setNewTag] = useState('');
  const audioRef = useRef<HTMLAudioElement>(null);

  const call = calls[currentIndex] || null;

  useEffect(() => {
    async function loadCalls() {
      const supabase = createClient();

      // 1. Load calls using the correct column name
      const { data: callsData } = await supabase.from('calls')
        .select('id, duration_seconds, recording_url, created_at, contacts(phone)')
        .eq('ai_agent_id', agentId)
        .gte('duration_seconds', minDuration)
        .order('created_at', { ascending: false })
        .limit(115);

      if (!callsData || callsData.length === 0) {
        setCalls([]);
        setLoading(false);
        return;
      }

      const callIds = callsData.map(c => c.id);

      // 2. Load transcripts from call_turns table (not calls.transcript)
      const { data: turnsData } = await supabase.from('call_turns')
        .select('call_id, ordinal, role, content, created_at')
        .in('call_id', callIds)
        .order('ordinal', { ascending: true });

      // Group turns by call_id
      const turns = turnsData || [];
      const turnsByCall: Record<string, Array<{ call_id: string; ordinal: number; role: string; content: string; created_at: string }>> = {};
      for (const turn of turns) {
        if (!turnsByCall[turn.call_id]) turnsByCall[turn.call_id] = [];
        turnsByCall[turn.call_id].push(turn);
      }

      // 3. Load existing annotations from call_annotations table
      const { data: annotationsData } = await supabase.from('call_annotations')
        .select('call_id, line_index, annotation_type, title')
        .in('call_id', callIds);

      // Group annotations by call_id
      const annotationsByCall: Record<string, Record<number, { type: string; description: string }>> = {};
      for (const a of (annotationsData || [])) {
        if (!annotationsByCall[a.call_id]) annotationsByCall[a.call_id] = {};
        const typeMap: Record<string, string> = { needs_improvement: 'BAD', great_response: 'GOOD', comment: 'COMMENT' };
        annotationsByCall[a.call_id][a.line_index] = {
          type: typeMap[a.annotation_type] || 'COMMENT',
          description: a.title || '',
        };
      }

      // 4. Map everything together
      const mapped = callsData.map((c: Record<string, unknown>) => {
        const contact = c.contacts as Record<string, string> | null;
        const callId = c.id as string;
        const turns = turnsByCall[callId] || [];
        const annotations = annotationsByCall[callId] || {};

        const lines: TranscriptLine[] = turns.map((t, idx) => ({
          index: idx,
          timestamp: msToTimestamp(idx * 5000), // approximate since we don't have exact timestamps
          speaker: t.role === 'assistant' ? 'agent' : 'user',
          text: t.content || '',
          annotation: annotations[idx]
            ? { type: annotations[idx].type, description: annotations[idx].description, lineNum: idx + 1 }
            : undefined,
        }));

        return {
          id: callId,
          displayId: `call_${callId.slice(0, 8)}`,
          phone: contact?.phone || 'Unknown',
          date: new Date(c.created_at as string).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }),
          duration: msToTimestamp((c.duration_seconds as number) * 1000),
          recording_url: c.recording_url as string | undefined,
          transcript: lines,
          tags: [],
        };
      });

      setCalls(mapped);
      setLoading(false);
    }

    loadCalls();
  }, [agentId, minDuration]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.ontimeupdate = () => setCurrentTime(a.currentTime);
    a.onloadedmetadata = () => setDuration(a.duration);
    a.onended = () => setPlaying(false);
  }, [call?.recording_url]);

  const togglePlay = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); } else { a.play(); setPlaying(true); }
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = audioRef.current;
    if (!a || !duration) return;
    const r = e.currentTarget.getBoundingClientRect();
    a.currentTime = ((e.clientX - r.left) / r.width) * duration;
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  const saveAnnotation = async (lineIdx: number) => {
    if (!call || !annotationText.trim()) return;
    try {
      const supabase = createClient();
      await supabase.from('call_annotations').insert({
        call_id: call.id,
        line_index: lineIdx,
        speaker: call.transcript[lineIdx]?.speaker,
        transcript_line: call.transcript[lineIdx]?.text,
        annotation_type: annotationType === 'BAD' ? 'needs_improvement' : annotationType === 'GOOD' ? 'great_response' : 'comment',
        title: annotationText,
        priority: 'medium',
      });
      setCalls(prev => prev.map((c, i) => {
        if (i !== currentIndex) return c;
        const transcript = [...c.transcript];
        transcript[lineIdx] = { ...transcript[lineIdx], annotation: { type: annotationType, description: annotationText, lineNum: lineIdx + 1 } };
        return { ...c, transcript };
      }));
    } catch (err) { console.error(err); }
    setAnnotatingLine(null);
    setAnnotationText('');
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20 text-zinc-500">
      <Loader2 className="h-5 w-5 animate-spin mr-2" />Loading calls…
    </div>
  );

  return (
    <div className="flex flex-col h-full -mx-6">
      {/* Top bar */}
      <div className="flex items-center gap-6 px-6 py-3 border-b border-zinc-800 bg-zinc-900/50 flex-wrap">
        <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer">
          <div onClick={() => setIncludePrevious(!includePrevious)}
            className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer ${includePrevious ? 'bg-indigo-600' : 'bg-zinc-700'}`}>
            <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${includePrevious ? 'translate-x-4' : ''}`} />
          </div>
          Include Previously Annotated
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-400">
          Min Duration (sec):
          <input type="number" value={minDuration} onChange={e => setMinDuration(Number(e.target.value))}
            className="w-16 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-indigo-500" />
        </label>
        <div className="ml-auto flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-zinc-400">
            Jump to call:
            <input value={jumpTo} onChange={e => setJumpTo(e.target.value)} placeholder="Call ID or Phone Number"
              className="w-48 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-indigo-500" />
          </label>
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <span>Progress:</span>
            <div className="w-32 h-2 bg-zinc-800 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-600 rounded-full" style={{ width: `${calls.length > 0 ? ((currentIndex + 1) / calls.length) * 100 : 0}%` }} />
            </div>
            <span className="font-mono text-xs">{currentIndex + 1} / {calls.length}</span>
          </div>
        </div>
      </div>

      {/* Main content */}
      {!call ? (
        <div className="flex items-center justify-center py-20 text-zinc-600 text-sm">No calls to annotate</div>
      ) : (
        <div className="flex flex-1 min-h-0">
          {/* Left: transcript */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-0">
            <h2 className="text-base font-semibold text-white mb-4">Call Transcript</h2>

            {/* Audio player */}
            {call.recording_url && (
              <div className="mb-5">
                <audio ref={audioRef} src={call.recording_url} preload="metadata" />
                <div className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
                  <button onClick={togglePlay} className="w-8 h-8 flex items-center justify-center rounded-full bg-zinc-800 hover:bg-indigo-600 transition-colors flex-shrink-0">
                    {playing ? <Pause className="h-3.5 w-3.5 text-white" /> : <Play className="h-3.5 w-3.5 text-white ml-0.5" />}
                  </button>
                  <span className="text-xs font-mono text-zinc-500 w-12">{fmt(currentTime)}</span>
                  <div className="flex-1 h-1 bg-zinc-700 rounded-full cursor-pointer" onClick={seek}>
                    <div className="h-full bg-indigo-500 rounded-full" style={{ width: duration ? `${(currentTime/duration)*100}%` : '0%' }} />
                  </div>
                  <span className="text-xs font-mono text-zinc-500 w-12 text-right">{fmt(duration)}</span>
                  <Volume2 className="h-4 w-4 text-zinc-500" />
                  <Settings className="h-4 w-4 text-zinc-500" />
                </div>
              </div>
            )}

            {/* Transcript lines */}
            <div className="space-y-0">
              {call.transcript.length === 0 && (
                <p className="text-sm text-zinc-600 italic">No transcript available for this call.</p>
              )}
              {call.transcript.map((line) => (
                <div key={line.index} className="group">
                  <div className={`flex gap-3 py-2 px-2 rounded-lg transition-colors ${annotatingLine === line.index ? 'bg-zinc-900' : 'hover:bg-zinc-900/50'}`}>
                    <span className="text-xs font-mono text-zinc-600 w-8 flex-shrink-0 mt-0.5">{line.timestamp}</span>
                    <p className="flex-1 text-sm text-zinc-300 leading-relaxed">
                      <span className={`font-medium mr-1 ${line.speaker === 'agent' ? 'text-indigo-400' : 'text-zinc-400'}`}>
                        {line.speaker === 'agent' ? 'Agent:' : 'User:'}
                      </span>
                      {line.text}
                    </p>
                    <button
                      onClick={() => { setAnnotatingLine(annotatingLine === line.index ? null : line.index); setAnnotationText(''); }}
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded text-zinc-600 hover:text-indigo-400 hover:bg-indigo-500/10 transition-all flex-shrink-0"
                    >
                      <Flag className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Existing annotation */}
                  {line.annotation && (
                    <div className={`mx-10 mb-2 rounded-lg border p-3 text-sm ${ANNOTATION_TYPES.find(t => t.value === line.annotation?.type)?.color || 'bg-zinc-800 border-zinc-700 text-zinc-400'}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <Flag className="h-3.5 w-3.5" />
                        <span className="font-medium">{ANNOTATION_TYPES.find(t => t.value === line.annotation?.type)?.label || line.annotation.type}</span>
                        <span className="text-zinc-500 text-xs">Line {line.annotation.lineNum}</span>
                      </div>
                      <p className="text-xs opacity-80">{line.annotation.description}</p>
                    </div>
                  )}

                  {/* Annotation form */}
                  {annotatingLine === line.index && (
                    <div className="mx-10 mb-3 bg-zinc-900 border border-zinc-700 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-medium text-zinc-300">Add annotation for line {line.index + 1}</p>
                        <button onClick={() => setAnnotatingLine(null)} className="text-zinc-600 hover:text-white"><X className="h-3.5 w-3.5" /></button>
                      </div>
                      <div className="flex gap-2">
                        {ANNOTATION_TYPES.map(t => (
                          <button key={t.value} onClick={() => setAnnotationType(t.value)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${annotationType === t.value ? t.color : 'border-zinc-700 text-zinc-500 hover:border-zinc-600'}`}>
                            {t.value}
                          </button>
                        ))}
                      </div>
                      <input value={annotationText} onChange={e => setAnnotationText(e.target.value)}
                        placeholder="Describe what went wrong or right..."
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
                      <div className="flex gap-2">
                        <button onClick={() => saveAnnotation(line.index)}
                          className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors">
                          Save
                        </button>
                        <button onClick={() => setAnnotatingLine(null)}
                          className="px-4 py-2 border border-zinc-700 text-zinc-400 text-sm rounded-lg hover:border-zinc-600 transition-colors">
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Right: Call Details */}
          <div className="w-72 flex-shrink-0 border-l border-zinc-800 flex flex-col">
            <div className="flex-1 overflow-y-auto p-4 space-y-5">
              <div>
                <p className="text-sm font-semibold text-white mb-3">Call Details</p>
                <div className="space-y-1.5 text-xs">
                  <div className="flex gap-2"><span className="text-zinc-500 w-16">ID:</span><span className="text-zinc-300 font-mono truncate">{call.displayId}</span></div>
                  <div className="flex gap-2"><span className="text-zinc-500 w-16">Number:</span><span className="text-zinc-300">{call.phone}</span></div>
                  <div className="flex gap-2"><span className="text-zinc-500 w-16">Date:</span><span className="text-zinc-300">{call.date}</span></div>
                  <div className="flex gap-2"><span className="text-zinc-500 w-16">Duration:</span><span className="text-zinc-300">{call.duration}</span></div>
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-zinc-400 mb-2">Call Tags</p>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {call.tags.map(tag => (
                    <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-400 flex items-center gap-1">
                      {tag}
                      <button onClick={() => setCalls(prev => prev.map((c,i) => i===currentIndex ? {...c, tags: c.tags.filter(t=>t!==tag)} : c))}><X className="h-2.5 w-2.5" /></button>
                    </span>
                  ))}
                </div>
                <input value={newTag} onChange={e => setNewTag(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && newTag.trim()) { setCalls(prev => prev.map((c,i) => i===currentIndex ? {...c,tags:[...c.tags,newTag.trim()]} : c)); setNewTag(''); }}}
                  placeholder="Add tags..." className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500" />
              </div>

              <div>
                <button className="w-full flex items-center justify-between text-xs font-medium text-zinc-400 hover:text-white py-1">
                  <span>Instructions</span><ChevronDown className="h-3.5 w-3.5" />
                </button>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-zinc-400">Evals</p>
                  <span className="text-[10px] text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full">
                    {call.transcript.filter(l => l.annotation).length}/{call.transcript.length} evals created
                  </span>
                </div>
                <div className="h-1 bg-zinc-800 rounded-full overflow-hidden mb-3">
                  <div className="h-full bg-indigo-500 rounded-full"
                    style={{ width: `${call.transcript.length > 0 ? (call.transcript.filter(l=>l.annotation).length/call.transcript.length)*100 : 0}%` }} />
                </div>
                {call.transcript.filter(l => l.annotation).map(l => (
                  <div key={l.index} className="mb-2 p-2 bg-zinc-900 border border-zinc-800 rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-zinc-300">Line {l.index + 1}</span>
                      <button className="text-[10px] text-indigo-400 hover:text-indigo-300">Edit</button>
                    </div>
                    <p className="text-[11px] text-zinc-500 leading-relaxed">{l.annotation?.description}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Bottom buttons */}
            <div className="border-t border-zinc-800 p-4 flex gap-2">
              <button className="flex-1 py-2 border border-zinc-700 rounded-lg text-sm text-zinc-400 hover:border-zinc-600 hover:text-white transition-colors">
                Finish Later
              </button>
              <button
                onClick={() => { if (currentIndex < calls.length - 1) setCurrentIndex(currentIndex + 1); }}
                className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Complete + Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
