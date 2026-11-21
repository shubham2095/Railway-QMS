import { useState } from 'react';
import { useHeader } from '../components/Layout.jsx';
import { Async, Card, EmptyRow, Pagination, useFilters } from '../components/ui.jsx';
import { fmtDateTime, titleCase } from '../lib/format.js';
import { useApi } from '../lib/hooks.js';

export default function Audit() {
  useHeader('Audit Trail', 'Module 14 — immutable activity log');
  const filters = useFilters();
  const q = useApi('/audit', Object.fromEntries(filters.params));
  const [userId, setUserId] = useState(filters.get('user_id'));

  return (
    <div className="space-y-5">
      <form onSubmit={(e) => { e.preventDefault(); filters.set({ user_id: userId }); }} className="flex flex-wrap items-end gap-2">
        <div>
          <label className="lbl-up">Action</label>
          <select value={filters.get('action')} onChange={(e) => filters.set({ action: e.target.value })} className="input-sm mt-1">
            <option value="">All actions</option>
            {(q.data?.actions ?? []).map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div><label className="lbl-up">User ID</label><input value={userId} onChange={(e) => setUserId(e.target.value)} className="input-sm mt-1 w-24" /></div>
        <button className="btn-primary py-1.5">Filter</button>
        {filters.any('action', 'user_id') && <button type="button" onClick={() => { setUserId(''); filters.clear(); }} className="text-xs font-medium text-slate-500 hover:underline">Clear</button>}
      </form>

      <Async q={q}>
        {({ data, meta }) => (
          <>
            <Card flush>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-edge text-left text-[11px] uppercase tracking-wide text-slate-400">
                      <th className="th">Time</th><th className="th">User</th><th className="th">Action</th><th className="th">Description</th><th className="th">Subject</th><th className="th">IP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.length === 0 && <EmptyRow cols={6}>No audit entries match.</EmptyRow>}
                    {data.map((l) => (
                      <tr key={l.id} className="border-b border-edge align-top last:border-0 hover:bg-canvas">
                        <td className="td whitespace-nowrap text-slate-600">{fmtDateTime(l.created_at)}</td>
                        <td className="td text-slate-600">{l.user_name ?? '—'}{l.user_id ? <span className="mono text-[11px] text-slate-400"> #{l.user_id}</span> : null}</td>
                        <td className="td"><span className="mono text-xs text-ink">{l.action}</span></td>
                        <td className="td text-slate-600">{l.description ?? '—'}</td>
                        <td className="td text-slate-600">{l.auditable_type ? `${titleCase(l.auditable_type)} #${l.auditable_id}` : '—'}</td>
                        <td className="td mono text-[11px] text-slate-400">{l.ip_address ?? '—'}</td>
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
