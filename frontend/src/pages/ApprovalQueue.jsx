import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useHeader } from '../components/Layout.jsx';
import { Async, Card, ErrorBanner, Stat } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { quarterTypeLabel } from '../lib/constants.js';
import { useFlash } from '../lib/flash.jsx';
import { fmtDate } from '../lib/format.js';
import { useAction, useApi } from '../lib/hooks.js';

export default function ApprovalQueue() {
  useHeader('Approval Queue', 'Applications verified by the clerk — approve the top of the line in one go');
  const [params, setParams] = useSearchParams();
  const q = useApi('/approval-queue', Object.fromEntries(params));
  return <Async q={q}>{(data) => <Queue key={data.type} data={data} reload={q.reload} setType={(t) => setParams({ type: t })} />}</Async>;
}

function Queue({ data, reload, setType }) {
  const { type, types, entries, vacant_quarters: vacant, approved_waiting: approvedWaiting } = data;
  const { refresh } = useAuth();
  const flash = useFlash();
  const act = useAction();
  const [selected, setSelected] = useState(() => new Set());
  const [count, setCount] = useState('');
  const [remarks, setRemarks] = useState('');
  const total = entries.length;

  // Anything no longer in the line (approved elsewhere) drops out of the selection.
  useEffect(() => {
    setSelected((s) => new Set([...s].filter((id) => entries.some((e) => e.application.id === id))));
  }, [entries]);

  const selectTop = (n) => {
    const k = Math.max(0, Math.min(total, Math.floor(Number(n) || 0)));
    setSelected(new Set(entries.slice(0, k).map((e) => e.application.id)));
  };
  const pct = (p) => Math.max(1, Math.ceil((total * p) / 100));
  const toggle = (id) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allOn = total > 0 && selected.size === total;
  const ranks = useMemo(() => new Map(entries.map((e) => [e.application.id, e.rank])), [entries]);

  const approve = async () => {
    if (selected.size === 0) return;
    if (!window.confirm(`Approve ${selected.size} applicant${selected.size === 1 ? '' : 's'} of ${quarterTypeLabel(type)}? Everyone behind them will move up.`)) return;
    const ids = [...selected].sort((a, b) => ranks.get(a) - ranks.get(b));
    const res = await act.run(() => api.post('/approval-queue/approve', { application_ids: ids, remarks }));
    if (res) { flash.success(res.message); setSelected(new Set()); setRemarks(''); setCount(''); reload(); refresh(); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {types.map((t) => (
          <button key={t.type} onClick={() => setType(t.type)}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition ${t.type === type ? 'bg-rail text-white' : 'bg-paper text-rail ring-1 ring-edge hover:bg-canvas'}`}>
            {quarterTypeLabel(t.type)}
            <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${t.type === type ? 'bg-white/20' : 'bg-canvas ring-1 ring-edge'}`}>{t.pending}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="In the line" value={total} tone="amber" hint="waiting for admin approval" />
        <Stat label="Vacant quarters" value={vacant} tone="emerald" hint={`${quarterTypeLabel(type)} available now`} />
        <Stat label="Approved, waiting for quarter" value={approvedWaiting} tone="sky" hint="clerk will offer them quarters" />
      </div>

      <ErrorBanner error={act.error} />

      <Card flush title={`${quarterTypeLabel(type)} — line by priority`}
        subtitle="Rank 1 is the highest priority. Select how many from the top to approve; the rest move up.">
        {total === 0 ? <div className="p-5 text-sm text-slate-400">Nobody is waiting for approval for this quarter type.</div> : (
          <>
            <div className="flex flex-wrap items-center gap-2 border-b border-edge px-5 py-3 text-sm">
              <span className="text-slate-500">Select from the top:</span>
              <input type="number" min="1" max={total} placeholder="N" className="input mt-0 w-20" value={count}
                onChange={(e) => { setCount(e.target.value); selectTop(e.target.value); }} />
              <button className="btn-ghost btn-xs" onClick={() => { setCount(String(pct(10))); selectTop(pct(10)); }}>Top 10% ({pct(10)})</button>
              <button className="btn-ghost btn-xs" onClick={() => { setCount(String(pct(20))); selectTop(pct(20)); }}>Top 20% ({pct(20)})</button>
              {vacant > 0 && <button className="btn-ghost btn-xs" onClick={() => { setCount(String(Math.min(vacant, total))); selectTop(vacant); }}>As many as vacant quarters ({Math.min(vacant, total)})</button>}
              <button className="btn-ghost btn-xs" onClick={() => { setCount(''); setSelected(new Set()); }}>Clear</button>
              <span className="ml-auto font-medium text-ink">{selected.size} selected</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-edge text-left text-[11px] uppercase tracking-wide text-slate-400">
                    <th className="th w-10"><input type="checkbox" aria-label="Select all" checked={allOn} onChange={() => { setCount(''); setSelected(allOn ? new Set() : new Set(entries.map((e) => e.application.id))); }} /></th>
                    <th className="th">Rank</th><th className="th">Employee</th><th className="th">Category</th><th className="th">Priority</th><th className="th">Colony preference</th><th className="th">Waiting since</th><th className="th">Application</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => {
                    const on = selected.has(e.application.id);
                    return (
                      <tr key={e.id} onClick={() => toggle(e.application.id)} className={`cursor-pointer border-b border-edge last:border-0 ${on ? 'bg-emerald-50' : 'hover:bg-canvas'}`}>
                        <td className="td"><input type="checkbox" aria-label={`Select ${e.application.employee_name}`} checked={on} onChange={() => toggle(e.application.id)} onClick={(ev) => ev.stopPropagation()} /></td>
                        <td className="td"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-canvas font-display text-sm font-bold text-rail ring-1 ring-edge">{e.rank}</span></td>
                        <td className="td">
                          <div className="font-medium text-ink">{e.application.employee_name ?? '—'}</div>
                          <div className="mono text-[11px] text-slate-400">{e.application.employee_id}{e.application.designation ? ` · ${e.application.designation}` : ''}</div>
                        </td>
                        <td className="td text-slate-600">{e.application.category ?? '—'}</td>
                        <td className="td font-semibold text-ink">{e.priority_score} <span className="font-normal text-slate-400">pts</span></td>
                        <td className="td">
                          {e.application.colony_preferences?.length ? (
                            <ol className="space-y-0.5 text-xs text-slate-600">
                              {e.application.colony_preferences.map((p) => <li key={p.priority}><span className="mr-1 font-semibold text-rail">{p.priority}.</span>{p.colony_name}</li>)}
                            </ol>
                          ) : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="td text-slate-600">{fmtDate(e.waiting_since)}</td>
                        <td className="td"><Link to={`/applications/${e.application.id}`} onClick={(ev) => ev.stopPropagation()} className="mono text-xs text-rail hover:underline">{e.application.reference_no}</Link></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center gap-3 border-t border-edge px-5 py-4">
              <input className="input mt-0 min-w-0 flex-1" placeholder="Remarks (optional)" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
              <button className="btn-ok" disabled={act.busy || selected.size === 0} onClick={approve}>Approve {selected.size || ''} selected</button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
