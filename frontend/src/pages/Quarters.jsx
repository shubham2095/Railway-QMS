import { Link, useNavigate } from 'react-router-dom';
import { useHeader } from '../components/Layout.jsx';
import { Async, Card, EmptyRow, Pagination, Pill, useFilters } from '../components/ui.jsx';
import { useAuth } from '../lib/auth.jsx';
import { QUARTER_STATUSES, QUARTER_TYPES, quarterTypeLabel } from '../lib/constants.js';
import { titleCase } from '../lib/format.js';
import { useApi } from '../lib/hooks.js';
import { useState } from 'react';

export default function Quarters() {
  useHeader('Quarter Master', 'Module 2 — quarter inventory');
  const filters = useFilters();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const q = useApi('/quarters', Object.fromEntries(filters.params));
  const [draft, setDraft] = useState({ q: filters.get('q'), station: filters.get('station'), type: filters.get('type'), status: filters.get('status') });
  const d = (k) => (e) => setDraft((s) => ({ ...s, [k]: e.target.value }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <form onSubmit={(e) => { e.preventDefault(); filters.set(draft); }} className="flex flex-wrap items-end gap-2">
          <div><label className="lbl-up">Search no.</label><input value={draft.q} onChange={d('q')} placeholder="Q-101" className="input-sm mt-1 w-32" /></div>
          <div><label className="lbl-up">Station</label><input value={draft.station} onChange={d('station')} className="input-sm mt-1 w-32" /></div>
          <div>
            <label className="lbl-up">Type</label>
            <select value={draft.type} onChange={d('type')} className="input-sm mt-1">
              <option value="">All</option>{QUARTER_TYPES.map((t) => <option key={t} value={t}>{quarterTypeLabel(t)}</option>)}
            </select>
          </div>
          <div>
            <label className="lbl-up">Status</label>
            <select value={draft.status} onChange={d('status')} className="input-sm mt-1">
              <option value="">All</option>{QUARTER_STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
            </select>
          </div>
          <button className="btn-primary py-1.5">Filter</button>
          {filters.any('q', 'station', 'type', 'status') && (
            <button type="button" onClick={() => { setDraft({ q: '', station: '', type: '', status: '' }); filters.clear(); }} className="text-xs font-medium text-slate-500 hover:underline">Clear</button>
          )}
        </form>
        {hasPermission('quarter.manage') && <Link to="/quarters/new" className="btn-signal">Add quarter</Link>}
      </div>

      <Async q={q}>
        {({ data, meta }) => (
          <>
            <Card flush>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-edge text-left text-[11px] uppercase tracking-wide text-slate-400">
                      <th className="th">Number</th><th className="th">Type</th><th className="th">Colony</th><th className="th">Station</th><th className="th">Occupant</th><th className="th">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.length === 0 && <EmptyRow cols={6}>No quarters match your filters.</EmptyRow>}
                    {data.map((x) => (
                      <tr key={x.id} onClick={() => navigate(`/quarters/${x.id}`)} className="cursor-pointer border-b border-edge last:border-0 hover:bg-canvas">
                        <td className="td"><span className="mono font-medium text-ink">{x.quarter_number}</span></td>
                        <td className="td text-slate-600">{quarterTypeLabel(x.quarter_type)}</td>
                        <td className="td text-slate-600">{x.colony_name ?? '—'}</td>
                        <td className="td text-slate-600">{x.station ?? '—'}</td>
                        <td className="td text-slate-600">{x.occupant_name ?? '—'}</td>
                        <td className="td"><Pill status={x.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
            <Pagination meta={meta} />
          </>
        )}
      </Async>
    </div>
  );
}
