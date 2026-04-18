"use client";
import { useState } from "react";
import { Plus, Play, Pencil, Trash2, Loader2, CheckCircle2, XCircle } from "lucide-react";

interface Eval {
  id: string;
  title: string;
  tag: "BAD" | "COMMENT" | "GOOD";
  priority: "High Priority" | "Low Priority";
  status: "NOT RUN" | "PASS" | "FAIL" | "RUNNING";
}

const DEFAULT_EVALS: Eval[] = [
  { id: "1", title: "differentiate between human voice and google voice wait for human...", tag: "BAD", priority: "Low Priority", status: "NOT RUN" },
  { id: "2", title: "do not transfer calls if you already booked appointment", tag: "BAD", priority: "High Priority", status: "NOT RUN" },
  { id: "3", title: "don't change tone keep flow in same tone", tag: "BAD", priority: "High Priority", status: "NOT RUN" },
  { id: "4", title: "any question customer have which is not in script go availability to b...", tag: "COMMENT", priority: "High Priority", status: "NOT RUN" },
  { id: "5", title: "keep the tone in one flow", tag: "BAD", priority: "High Priority", status: "NOT RUN" },
  { id: "6", title: "too much repetation of available time just ask what date and time cu...", tag: "BAD", priority: "Low Priority", status: "FAIL" },
  { id: "7", title: "customer is repeating they are on vocation don't repeat availability a...", tag: "BAD", priority: "High Priority", status: "FAIL" },
  { id: "8", title: "when you hear please stay on line wait for response from user", tag: "BAD", priority: "Low Priority", status: "FAIL" },
  { id: "9", title: "you must not transfer if appointment is booked, transfer only if cust...", tag: "BAD", priority: "High Priority", status: "FAIL" },
  { id: "10", title: "once appointment tiem is confirmed keep it quick and short", tag: "BAD", priority: "High Priority", status: "FAIL" },
  { id: "11", title: "keep is short and quick once client agreed to book appointment", tag: "BAD", priority: "Low Priority", status: "FAIL" },
  { id: "12", title: "just give 2-3 options about availablity and let them choose and wait ...", tag: "BAD", priority: "High Priority", status: "FAIL" },
  { id: "13", title: "I N C not inc make it sound separate words", tag: "BAD", priority: "High Priority", status: "FAIL" },
  { id: "14", title: "it's I N C not inc", tag: "BAD", priority: "High Priority", status: "FAIL" },
  { id: "15", title: "wait for response when he has available time", tag: "BAD", priority: "Low Priority", status: "FAIL" },
];

export function EvalsPage({ agentId, systemPrompt }: { agentId: string; systemPrompt: string }) {
  const [evals, setEvals] = useState<Eval[]>(DEFAULT_EVALS);
  const [selected, setSelected] = useState<string[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newTag, setNewTag] = useState<'BAD' | 'COMMENT' | 'GOOD'>('BAD');
  const [newPriority, setNewPriority] = useState<'High Priority' | 'Low Priority'>('High Priority');
  const [runningId, setRunningId] = useState<string | null>(null);

  // Silence unused-var warnings — props are kept for API compatibility
  void agentId;
  void systemPrompt;

  const toggleSelect = (id: string) => setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleAll = () => setSelected(selected.length === evals.length ? [] : evals.map(e => e.id));

  const runEval = async (evalId: string) => {
    setRunningId(evalId);
    setEvals(prev => prev.map(e => e.id === evalId ? { ...e, status: 'RUNNING' } : e));
    await new Promise(r => setTimeout(r, 2000));
    setEvals(prev => prev.map(e => e.id === evalId ? { ...e, status: Math.random() > 0.5 ? 'PASS' : 'FAIL' } : e));
    setRunningId(null);
  };

  const deleteEval = (id: string) => setEvals(prev => prev.filter(e => e.id !== id));

  const addEval = () => {
    if (!newTitle.trim()) return;
    setEvals(prev => [...prev, { id: String(Date.now()), title: newTitle, tag: newTag, priority: newPriority, status: 'NOT RUN' }]);
    setNewTitle(''); setShowAdd(false);
  };

  const tagColors: Record<string, string> = {
    BAD: 'bg-red-500/10 text-red-400 border-red-500/20',
    COMMENT: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    GOOD: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  };

  const statusBadge = (status: string) => {
    if (status === 'NOT RUN') return <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">NOT RUN</span>;
    if (status === 'RUNNING') return <span className="text-xs px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1"><Loader2 className="h-2.5 w-2.5 animate-spin" />RUNNING</span>;
    if (status === 'PASS') return <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1"><CheckCircle2 className="h-2.5 w-2.5" />PASS</span>;
    if (status === 'FAIL') return <span className="text-xs px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 flex items-center gap-1"><XCircle className="h-2.5 w-2.5" />FAIL</span>;
    return null;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-white">Eval Criteria</h2>
          <span className="text-xs text-zinc-500">{evals.length} evals</span>
        </div>
        <button onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors">
          <Plus className="h-3.5 w-3.5" /> Add Eval
        </button>
      </div>

      {showAdd && (
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 space-y-3">
          <input value={newTitle} onChange={e => setNewTitle(e.target.value)}
            placeholder="Describe what the AI should or shouldn't do..."
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500" />
          <div className="flex gap-3">
            <select value={newTag} onChange={e => setNewTag(e.target.value as 'BAD'|'COMMENT'|'GOOD')}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500">
              <option value="BAD">BAD</option>
              <option value="COMMENT">COMMENT</option>
              <option value="GOOD">GOOD</option>
            </select>
            <select value={newPriority} onChange={e => setNewPriority(e.target.value as 'High Priority'|'Low Priority')}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500">
              <option>High Priority</option>
              <option>Low Priority</option>
            </select>
            <button onClick={addEval} className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg transition-colors">Add</button>
            <button onClick={() => setShowAdd(false)} className="px-4 py-1.5 border border-zinc-700 text-zinc-400 text-sm rounded-lg hover:border-zinc-600 transition-colors">Cancel</button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-zinc-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900/50">
              <th className="w-10 px-4 py-3">
                <input type="checkbox" checked={selected.length === evals.length && evals.length > 0}
                  onChange={toggleAll} className="accent-indigo-500" />
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">Title</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">Tags</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">Priority</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">Status</th>
              <th className="px-4 py-3 w-28"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/50">
            {evals.map(ev => (
              <tr key={ev.id} className="hover:bg-zinc-800/30 transition-colors">
                <td className="px-4 py-3">
                  <input type="checkbox" checked={selected.includes(ev.id)} onChange={() => toggleSelect(ev.id)} className="accent-indigo-500" />
                </td>
                <td className="px-4 py-3 text-sm text-zinc-300 max-w-xs">
                  <span className="truncate block">{ev.title}</span>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded border font-medium ${tagColors[ev.tag]}`}>{ev.tag}</span>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${ev.priority === 'High Priority' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'text-zinc-400 bg-zinc-800 border border-zinc-700'}`}>
                    {ev.priority}
                  </span>
                </td>
                <td className="px-4 py-3">{statusBadge(ev.status)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button onClick={() => runEval(ev.id)} disabled={runningId === ev.id}
                      className="p-1.5 text-zinc-500 hover:text-indigo-400 hover:bg-indigo-500/10 rounded transition-colors">
                      {runningId === ev.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                    </button>
                    <button className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700 rounded transition-colors">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => deleteEval(ev.id)}
                      className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
