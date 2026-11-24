import { useState } from 'react';
import { useHeader } from '../components/Layout.jsx';
import { Async, Card, EmptyRow, Pagination, Pill, useFilters } from '../components/ui.jsx';
import { QUARTER_TYPES, quarterTypeLabel } from '../lib/constants.js';
import { fmtDate } from '../lib/format.js';
import { useApi } from '../lib/hooks.js';

const CAT = { essential: 'Essential', non_essential: 'Non-essential' };

export default function LegacyWaitingList() {
  useHeader('Pending Requests (old list)', 'Quarter requests made before this system — in line order, earliest first');
  const filters = useFilters();
  const q = useApi('/legacy-waiting-list', Object.fromEntries(filters.params));
  const [draft, setDraft] = useState({ q: filters.get('q'), type: filters.get('type'), category: filters.get('category') });
  const d = (k) => (e) => setDraft((s) => ({ ...s, [k]: e.target.value }));

  return (
    <div className="space-y-5">
      <Async q={q}>
        {({ counts }) => (
          <div className="flex flex-wrap gap-2">
            {counts.map((c) => (
              <button key={c.quarter_type} onClick={() => filters.set({ ...draft, type: c.quarter_type })}
                className={`rounded-lg px-3 py-2 text-sm font-medium ring-1 ring-edge ${filters.get('type') === c.quarter_type ? 'bg-rail text-white' : 'bg-paper text-rail hover:bg-canvas'}`}>
                {quarterTypeLabel(c.quarter_type)} <span className="ml-1 font-semibold">{c.total}</span>
              </button>
            ))}
          </div>
        )}
      </Async>

      <form onSubmit={(e) => { e.preventDefault(); filters.set(draft); }} className="flex flex-wrap items-end gap-2">
        <div><label className="lbl-up">Search</label><input value={draft.q} onChange={d('q')} placeholder="Name, PF no., request no." className="input-sm mt-1 w-56" /></div>
        <div>
          <label className="lbl-up">Type</label>
          <select value={draft.type} onChange={d('type')} className="input-sm mt-1"><option value="">All</option>{QUARTER_TYPES.map((t) => <option key={t} value={t}>{quarterTypeLabel(t)}</option>)}</select>
        </div>
        <div>
          <label className="lbl-up">Category</label>
          <select value={draft.category} onChange={d('category')} className="input-sm mt-1"><option value="">All</option><option value="essential">Essential</option><option value="non_essential">Non-essential</option></select>
        </div>
        <button className="btn-primary py-1.5">Filter</button>
        {filters.any('q', 'type', 'category') && <button type="button" onClick={() => { setDraft({ q: '', type: '', category: '' }); filters.clear(); }} className="text-xs font-medium text-slate-500 hover:underline">Clear</button>}
      </form>

      <Async q={q}>
        {({ data, meta }) => (
          <>
            <Card flush>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-edge text-left text-[11px] uppercase tracking-wide text-slate-400">
                      <th className="th">Line</th><th className="th">Name</th><th className="th">PF no.</th><th className="th">Designation</th><th className="th">Type</th><th className="th">Category</th><th className="th">Pay scale</th><th className="th">Waiting since</th><th className="th">Request no.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.length === 0 ? <EmptyRow cols={9}>No requests match.</EmptyRow> : data.map((r) => (
                      <tr key={r.id} className="border-b border-edge last:border-0 hover:bg-canvas">
                        <td className="td"><span className="font-display font-bold text-rail">#{r.line_position}</span></td>
                        <td className="td font-medium text-ink">{r.name ?? <span className="text-slate-300">—</span>}</td>
                        <td className="td mono text-xs text-slate-600">{r.pf_number ?? '—'}</td>
                        <td className="td text-slate-600">{r.designation ?? '—'}</td>
                        <td className="td text-slate-600">{quarterTypeLabel(r.quarter_type)}</td>
                        <td className="td">{r.category ? <Pill status={r.category === 'essential' ? 'approved' : 'neutral'}>{CAT[r.category]}</Pill> : <span className="text-slate-300">—</span>}</td>
                        <td className="td text-slate-600">{r.pay_scale ?? '—'}</td>
                        <td className="td text-slate-600">{fmtDate(r.request_date)}</td>
                        <td className="td mono text-[11px] text-slate-400">{r.request_no}</td>
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
