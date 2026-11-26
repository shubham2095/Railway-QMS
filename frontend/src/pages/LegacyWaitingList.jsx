import { useState } from 'react';
import { useHeader } from '../components/Layout.jsx';
import { Async, Card, EmptyRow, Pagination, Pill, useFilters } from '../components/ui.jsx';
import { fmtDate } from '../lib/format.js';
import { useApi } from '../lib/hooks.js';

const CAT = { essential: 'Essential', non_essential: 'Non-essential' };

export default function LegacyWaitingList() {
  useHeader('Pending Requests (old list)', 'Quarter requests made before this system — in line order');
  const filters = useFilters();
  const q = useApi('/legacy-waiting-list', Object.fromEntries(filters.params));
  const [draft, setDraft] = useState({ q: filters.get('q'), list: filters.get('list'), category: filters.get('category'), unit: filters.get('unit') });
  const d = (k) => (e) => setDraft((s) => ({ ...s, [k]: e.target.value }));

  return (
    <div className="space-y-5">
      <Async q={q}>
        {({ lists }) => (
          <div className="space-y-2">
            {[['staff', 'Staff'], ['gazetted', 'Gazetted officers']].map(([kind, label]) => (
              <div key={kind} className="flex flex-wrap items-center gap-2">
                <span className="w-32 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
                {lists.filter((l) => l.staff_kind === kind).map((l) => (
                  <button key={l.list_name} onClick={() => { setDraft((s) => ({ ...s, list: l.list_name })); filters.set({ ...draft, list: l.list_name }); }}
                    className={`rounded-lg px-3 py-2 text-sm font-medium ring-1 ring-edge ${filters.get('list') === l.list_name ? 'bg-rail text-white' : 'bg-paper text-rail hover:bg-canvas'}`}>
                    {l.list_name} <span className="ml-1 font-semibold">{l.total}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </Async>

      <form onSubmit={(e) => { e.preventDefault(); filters.set(draft); }} className="flex flex-wrap items-end gap-2">
        <div><label className="lbl-up">Search</label><input value={draft.q} onChange={d('q')} placeholder="Name, PF no., request no., phone" className="input-sm mt-1 w-60" /></div>
        <div>
          <label className="lbl-up">Category</label>
          <select value={draft.category} onChange={d('category')} className="input-sm mt-1"><option value="">All</option><option value="essential">Essential</option><option value="non_essential">Non-essential</option></select>
        </div>
        <Async q={q}>
          {({ units }) => (
            <div>
              <label className="lbl-up">Request no. type</label>
              <select value={draft.unit} onChange={d('unit')} className="input-sm mt-1">
                <option value="">All</option>
                {units.map((u) => <option key={u.unit} value={u.unit}>{u.unit === 'GAZETTED' ? 'Gazetted lists' : `DRM/${u.unit}`} ({u.total})</option>)}
              </select>
            </div>
          )}
        </Async>
        <button className="btn-primary py-1.5">Filter</button>
        {filters.any('q', 'list', 'category', 'unit') && <button type="button" onClick={() => { setDraft({ q: '', list: '', category: '', unit: '' }); filters.clear(); }} className="text-xs font-medium text-slate-500 hover:underline">Clear</button>}
      </form>

      <Async q={q}>
        {({ data, meta }) => (
          <>
            <Card flush>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-edge text-left text-[11px] uppercase tracking-wide text-slate-400">
                      <th className="th">Line</th><th className="th">Name</th><th className="th">PF no.</th><th className="th">Designation</th><th className="th">List</th><th className="th">Category</th><th className="th">Pay scale</th><th className="th">Present flat / wants</th><th className="th">Contact · remarks</th><th className="th">Waiting since</th><th className="th">Request no.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.length === 0 ? <EmptyRow cols={11}>No requests match.</EmptyRow> : data.map((r) => (
                      <tr key={r.id} className="border-b border-edge last:border-0 hover:bg-canvas">
                        <td className="td"><span className="font-display font-bold text-rail">#{r.line_position}</span></td>
                        <td className="td font-medium text-ink">{r.name ?? <span className="text-slate-300">—</span>}</td>
                        <td className="td mono text-xs text-slate-600">{r.pf_number ?? '—'}</td>
                        <td className="td text-slate-600">{r.designation ?? '—'}</td>
                        <td className="td text-slate-600">{r.list_name}</td>
                        <td className="td">{r.category ? <Pill status={r.category === 'essential' ? 'approved' : 'neutral'}>{CAT[r.category]}</Pill> : <span className="text-slate-300">—</span>}</td>
                        <td className="td text-slate-600">{r.pay_scale ?? '—'}</td>
                        <td className="td text-xs text-slate-600">{r.present_accommodation && <div>{r.present_accommodation}</div>}{r.preferred_colonies && <div className="text-slate-400">Wants: {r.preferred_colonies}</div>}{!r.present_accommodation && !r.preferred_colonies && '—'}</td>
                        <td className="td text-xs text-slate-600">{r.contact_no && <div className="mono">{r.contact_no}</div>}{r.remarks && <div className="max-w-xs text-slate-400">{r.remarks}</div>}{!r.contact_no && !r.remarks && '—'}</td>
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
