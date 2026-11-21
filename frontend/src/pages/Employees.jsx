import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useHeader } from '../components/Layout.jsx';
import { Async, Card, EmptyRow, Pagination, VerificationPill, useFilters } from '../components/ui.jsx';
import { fmtDate } from '../lib/format.js';
import { useApi } from '../lib/hooks.js';

const TABS = [
  ['', 'All'],
  ['pending', 'Awaiting verification'],
  ['changes_requested', 'Changes requested'],
  ['verified', 'Verified'],
];

export default function Employees() {
  useHeader('Employees', 'Check the details employees entered and verify their profiles');
  const filters = useFilters();
  const navigate = useNavigate();
  const q = useApi('/employees', Object.fromEntries(filters.params));
  const [term, setTerm] = useState(filters.get('q'));
  const status = filters.get('status');
  const counts = q.data?.counts;
  const total = counts ? counts.pending + counts.changes_requested + counts.verified : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {TABS.map(([value, label]) => {
            const n = value === '' ? total : counts?.[value];
            const active = status === value;
            return (
              <button key={value} onClick={() => filters.set({ status: value })}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${active ? 'bg-rail text-white' : 'text-rail hover:bg-white'}`}>
                {label}{n != null && <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] ${active ? 'bg-white/20' : 'bg-canvas ring-1 ring-edge'}`}>{n}</span>}
              </button>
            );
          })}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); filters.set({ q: term }); }} className="flex items-center gap-2">
          <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Name, email, Employee ID or PF no." className="input-sm w-64" />
          <button className="btn-primary py-1.5">Search</button>
          {filters.any('q') && <button type="button" onClick={() => { setTerm(''); filters.set({ q: '' }); }} className="text-xs font-medium text-slate-500 hover:underline">Clear</button>}
        </form>
      </div>

      <Async q={q}>
        {({ data, meta }) => (
          <>
            <Card flush>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-edge text-left text-[11px] uppercase tracking-wide text-slate-400">
                      <th className="th">Employee</th><th className="th">Employee ID</th><th className="th">PF No.</th>
                      <th className="th">Designation</th><th className="th">Station</th><th className="th">Updated</th><th className="th">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.length === 0 && <EmptyRow cols={7}>{status === 'pending' ? 'No profiles are waiting for verification.' : 'No employees found.'}</EmptyRow>}
                    {data.map((p) => (
                      <tr key={p.id} onClick={() => navigate(`/employees/${p.id}`)} className="cursor-pointer border-b border-edge last:border-0 hover:bg-canvas">
                        <td className="td"><div className="font-medium text-ink">{p.name}</div><div className="text-[11px] text-slate-400">{p.email}</div></td>
                        <td className="td"><span className="mono text-slate-600">{p.employee_id}</span></td>
                        <td className="td"><span className="mono text-slate-600">{p.pf_number}</span></td>
                        <td className="td text-slate-600">{p.designation}</td>
                        <td className="td text-slate-600">{p.station}</td>
                        <td className="td text-slate-600">{fmtDate(p.updated_at)}</td>
                        <td className="td"><VerificationPill status={p.verification_status} /></td>
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
