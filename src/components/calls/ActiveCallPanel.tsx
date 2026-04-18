'use client';
import { useState, useEffect, useRef } from 'react';
import {
  Mic, MicOff, Pause, Play, PhoneOff, Hash, FileText,
  MessageSquare, PhoneForwarded, StickyNote,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface Props {
  callRecordId: string;
  contactName: string;
  contactPhone: string;
  onCallEnded: (duration: number) => void;
}

export default function ActiveCallPanel({
  callRecordId, contactName, contactPhone, onCallEnded
}: Props) {
  const [elapsed, setElapsed] = useState(0);
  const [muted, setMuted] = useState(false);
  const [onHold, setOnHold] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [note, setNote] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Timer
  useEffect(() => {
    timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  // Realtime: auto-close when Telnyx status webhook marks call completed/failed
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`active-call:${callRecordId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'calls', filter: `id=eq.${callRecordId}` },
        (payload) => {
          const status = (payload.new as { status?: string }).status;
          if (status === 'completed' || status === 'failed') {
            if (timerRef.current) clearInterval(timerRef.current);
            onCallEnded(elapsed);
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [callRecordId, onCallEnded]);

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const handleHangup = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (note.trim()) {
      await fetch(`/api/calls/${callRecordId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: note }),
      });
    }
    await fetch(`/api/calls/${callRecordId}/hangup`, { method: 'POST' });
    onCallEnded(elapsed);
  };

  const controls = [
    { icon: muted ? MicOff : Mic,     label: muted ? 'Unmute' : 'Mute',     action: () => setMuted(m => !m),   active: muted },
    { icon: onHold ? Play : Pause,    label: onHold ? 'Resume' : 'Hold',    action: () => setOnHold(h => !h),  active: onHold },
    { icon: StickyNote,               label: 'Notes',                        action: () => setShowNotes(n => !n), active: showNotes },
    { icon: MessageSquare,            label: 'Message',                      action: () => {},                  active: false },
    { icon: FileText,                 label: 'Scripts',                      action: () => {},                  active: false },
    { icon: PhoneForwarded,           label: 'Transfer',                     action: () => {},                  active: false },
    { icon: Hash,                     label: 'Dialpad',                      action: () => {},                  active: false },
  ];

  return (
    <div className="fixed bottom-6 right-6 z-50 w-80 bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="bg-indigo-600 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-white/70 text-xs">Outgoing Call</p>
            <p className="text-white font-semibold">{contactName}</p>
            <p className="text-white/60 text-xs font-mono">{contactPhone}</p>
          </div>
          <span className="text-white/60 text-xs">
            {onHold ? '⏸ Hold' : muted ? '🔇 Muted' : '● Live'}
          </span>
        </div>
      </div>

      {/* Timer */}
      <div className="text-center py-4">
        <span className="text-4xl font-mono text-white tracking-wider">{fmt(elapsed)}</span>
      </div>

      {/* Controls grid */}
      <div className="grid grid-cols-4 gap-2 px-4 pb-4">
        {controls.map(({ icon: Icon, label, action, active }) => (
          <button
            key={label}
            onClick={action}
            className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-colors text-xs ${
              active
                ? 'bg-indigo-600/30 text-indigo-400'
                : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
            }`}
          >
            <Icon size={18} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* Notes panel */}
      {showNotes && (
        <div className="px-4 pb-3">
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Type call notes…"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm p-2 resize-none h-20 focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder:text-zinc-600"
          />
        </div>
      )}

      {/* Hang up */}
      <div className="px-4 pb-5">
        <button
          onClick={handleHangup}
          className="w-full bg-red-600 hover:bg-red-500 text-white rounded-xl py-3 flex items-center justify-center gap-2 font-semibold transition-colors"
        >
          <PhoneOff size={16} /> End Call
        </button>
      </div>
    </div>
  );
}
