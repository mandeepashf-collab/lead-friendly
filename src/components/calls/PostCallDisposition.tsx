'use client';
import { useState } from 'react';
import { CheckCircle } from 'lucide-react';

const DISPOSITIONS = [
  'No Answer', 'Voicemail', 'Follow Up',
  'Requested Appointment', 'Not Interested', 'Incorrect Number',
];

interface Props {
  callRecordId: string;
  contactName: string;
  duration: number;
  onDone: () => void;
}

export default function PostCallDisposition({
  callRecordId, contactName, duration, onDone
}: Props) {
  const [selected, setSelected] = useState('');
  const [saving, setSaving] = useState(false);

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')} Min ${String(s % 60).padStart(2, '0')} Sec`;

  const handleDone = async () => {
    setSaving(true);
    if (selected) {
      // Map user-friendly labels to DB-safe outcome values
      const outcomeMap: Record<string, string> = {
        'No Answer': 'no_answer',
        'Voicemail': 'voicemail',
        'Follow Up': 'follow_up',
        'Requested Appointment': 'appointment_requested',
        'Not Interested': 'not_interested',
        'Incorrect Number': 'wrong_number',
      };
      await fetch(`/api/calls/${callRecordId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          disposition: selected,
          outcome: outcomeMap[selected] || selected.toLowerCase().replace(/\s+/g, '_'),
          status: 'completed',
        }),
      });
    }
    setSaving(false);
    onDone();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <div className="flex items-center gap-2 mb-1">
          <CheckCircle size={18} className="text-indigo-400" />
          <h2 className="text-white font-semibold">Call Summary</h2>
        </div>
        <p className="text-zinc-400 text-sm mb-4">{contactName}</p>

        <div className="bg-zinc-800 rounded-xl p-4 mb-5 text-center">
          <p className="text-zinc-400 text-xs mb-1">Duration</p>
          <p className="text-white text-2xl font-semibold">{fmt(duration)}</p>
          <p className="text-emerald-400 text-xs mt-1">✓ Completed</p>
        </div>

        <p className="text-zinc-400 text-xs font-medium mb-3 uppercase tracking-wider">Call Outcome</p>
        <div className="grid grid-cols-2 gap-2 mb-5">
          {DISPOSITIONS.map(d => (
            <button
              key={d}
              onClick={() => setSelected(d)}
              className={`py-2.5 px-3 rounded-xl text-sm font-medium transition-all border ${
                selected === d
                  ? 'bg-indigo-600 border-indigo-500 text-white'
                  : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-zinc-500'
              }`}
            >
              {d}
            </button>
          ))}
        </div>

        <button
          onClick={handleDone}
          disabled={saving}
          className="w-full border border-zinc-600 text-white rounded-xl py-3 font-medium hover:bg-zinc-800 transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Done'}
        </button>
      </div>
    </div>
  );
}
