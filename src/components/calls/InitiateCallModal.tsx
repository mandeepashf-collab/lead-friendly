'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Phone, X, Loader2, AlertTriangle, Bot, User as UserIcon } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface PhoneNumber {
  id: string;
  number: string;
  phone_number?: string;
  label?: string;
  status?: string;
}

interface AgentRow {
  id: string;
  name: string;
  status?: string;
}

interface Props {
  contactName: string;
  contactPhone: string;
  contactId?: string;
  /**
   * Optional pre-selected agent. If provided, the modal opens in AI-Agent
   * mode with this agent locked in. If omitted (default), user chooses
   * Manual vs AI Agent inside the modal.
   */
  agentId?: string;
  onClose: () => void;
  onCallStarted: (callRecordId: string) => void;
}

type Mode = 'manual' | 'ai_agent';

export default function InitiateCallModal({
  contactName, contactPhone, contactId, agentId, onClose, onCallStarted,
}: Props) {
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([]);
  const [selectedFrom, setSelectedFrom] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Mode: manual (human call via /api/calls/human) or ai_agent (AI via /api/calls/trigger).
  // If parent passes agentId, we lock into AI mode for backward compatibility.
  const [mode, setMode] = useState<Mode>(agentId ? 'ai_agent' : 'manual');

  // Agents list for AI mode
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | undefined>(agentId);

  // Rep phone (profile.phone) — required for manual mode
  const [repPhone, setRepPhone] = useState<string | null>(null);
  const [repPhoneLoading, setRepPhoneLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) { setRepPhoneLoading(false); return; }

      const [{ data: profile }, { data: agentRows }] = await Promise.all([
        supabase.from('profiles').select('phone, organization_id').eq('id', user.id).single(),
        supabase
          .from('ai_agents')
          .select('id, name, status')
          .eq('status', 'active')
          .order('created_at', { ascending: true }),
      ]);
      if (cancelled) return;

      const phone = (profile as { phone?: string | null } | null)?.phone ?? null;
      setRepPhone(phone && phone.trim() ? phone : null);
      setRepPhoneLoading(false);

      const list = (agentRows ?? []) as AgentRow[];
      setAgents(list);
      if (!selectedAgentId && list.length > 0) {
        setSelectedAgentId(list[0].id);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetch('/api/phone-numbers')
      .then(r => r.json())
      .then(d => {
        const nums: PhoneNumber[] = d.numbers ?? d.phoneNumbers ?? d.data ?? [];
        const finalNums: PhoneNumber[] = nums.length > 0
          ? nums
          : [{ id: 'default', number: '+12722194909', label: 'Lead Friendly Main' }];
        setPhoneNumbers(finalNums);
        const first = finalNums[0];
        setSelectedFrom(first.number ?? first.phone_number ?? '+12722194909');
      })
      .catch(() => setError('Could not load phone numbers'));
  }, []);

  const canStart =
    mode === 'manual'
      ? !!repPhone && !!selectedFrom
      : !!selectedAgentId && !!selectedFrom;

  const handleCall = async () => {
    if (!selectedFrom) return;
    if (mode === 'manual' && !repPhone) return;
    if (mode === 'ai_agent' && !selectedAgentId) return;
    setLoading(true);
    setError('');
    try {
      const endpoint = mode === 'manual' ? '/api/calls/human' : '/api/calls/trigger';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mode === 'manual' ? {
          contactId,
          contactPhone,
          fromNumber: selectedFrom,
        } : {
          contactId,
          contactPhone,
          fromNumber: selectedFrom,
          agentId: selectedAgentId,
        }),
      });
      const data = await res.json() as {
        callRecordId?: string;
        error?: string;
        message?: string;
        code?: string;
      };
      if (!res.ok) {
        // SELF_CALL_BLOCKED: stay on the modal so user can adjust settings
        if (data.error === 'SELF_CALL_BLOCKED') {
          setError(data.message || "Can't call yourself. Pick a different rep phone in Settings, or test with a different contact.");
          return;
        }
        throw new Error(data.message || data.error || 'Call failed');
      }
      onCallStarted(data.callRecordId!);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Call failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-white font-semibold text-lg">Start Call</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="mb-4 p-3 bg-zinc-800 rounded-xl">
          <p className="text-zinc-400 text-xs mb-1">Calling</p>
          <p className="text-white font-medium">{contactName || 'Unknown'}</p>
          <p className="text-indigo-400 text-sm font-mono">{contactPhone}</p>
        </div>

        {/* Mode selector — hidden if parent locked in an agent */}
        {!agentId && (
          <div className="mb-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMode('manual')}
              className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                mode === 'manual'
                  ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
                  : 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <UserIcon size={14} /> Manual Call
            </button>
            <button
              type="button"
              onClick={() => setMode('ai_agent')}
              className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                mode === 'ai_agent'
                  ? 'border-indigo-500/50 bg-indigo-500/10 text-indigo-300'
                  : 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Bot size={14} /> AI Agent
            </button>
          </div>
        )}

        <div className="mb-4">
          <label className="text-zinc-400 text-xs mb-2 block">Call from (caller ID)</label>
          {phoneNumbers.length === 0 ? (
            <div className="flex items-center gap-2 text-zinc-500 text-sm">
              <Loader2 size={14} className="animate-spin" />
              Loading numbers…
            </div>
          ) : (
            <select
              value={selectedFrom}
              onChange={e => setSelectedFrom(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {phoneNumbers.map(n => {
                const num = n.number ?? n.phone_number ?? '';
                return (
                  <option key={n.id} value={num}>
                    {n.label ? `${n.label} — ${num}` : num}
                  </option>
                );
              })}
            </select>
          )}
        </div>

        {/* AI-mode: agent dropdown */}
        {mode === 'ai_agent' && (
          <div className="mb-4">
            <label className="text-zinc-400 text-xs mb-2 block">AI Agent</label>
            {agents.length === 0 ? (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-3 text-xs text-amber-200">
                No active AI agents.{' '}
                <Link href="/ai-agents" onClick={onClose} className="underline hover:text-amber-100">
                  Create one →
                </Link>
              </div>
            ) : (
              <select
                value={selectedAgentId ?? ''}
                onChange={e => setSelectedAgentId(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {agents.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            )}
          </div>
        )}

        {/* Manual-mode: rep phone confirmation */}
        {mode === 'manual' && (
          <div className="mb-4">
            {repPhoneLoading ? (
              <div className="flex items-center gap-2 text-zinc-500 text-xs">
                <Loader2 size={12} className="animate-spin" />
                Checking your phone…
              </div>
            ) : repPhone ? (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs">
                <span className="text-zinc-400">Rings your phone:</span>{' '}
                <span className="text-emerald-300 font-mono">{repPhone}</span>
              </div>
            ) : (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-3 text-xs text-amber-200 flex items-start gap-2">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Your phone is not set.</p>
                  <p className="mt-1 text-amber-200/80">
                    We need to know where to ring you first, then bridge the contact.{' '}
                    <Link
                      href="/settings#phone"
                      onClick={onClose}
                      className="underline hover:text-amber-100"
                    >
                      Add it in Settings →
                    </Link>
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

        <button
          onClick={handleCall}
          disabled={loading || !canStart}
          className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Starting call…
            </>
          ) : (
            <>
              <Phone size={16} />
              Start Call
            </>
          )}
        </button>
      </div>
    </div>
  );
}
