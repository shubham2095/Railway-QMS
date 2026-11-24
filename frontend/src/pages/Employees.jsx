import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useHeader } from '../components/Layout.jsx';
import { Async, Card, EmptyRow, Pagination, useFilters } from '../components/ui.jsx';
import { fmtDate } from '../lib/format.js';
import { useApi } from '../lib/hooks.js';

export default function Employees() {
  useHeader('Employees', 'Employee details as entered by the employees');
  const filters = useFilters();
  const navigate = useNavigate();
  const q = useApi('/employees', Object.fromEntries(filters.params));
  const [term, setTerm] = useState(filters.get('q'));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div />
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
                      <th className="th">Designation</th><th className="th">Station</th><th className="th">Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.length === 0 && <EmptyRow cols={6}>No employees found.</EmptyRow>}
                    {data.map((p) => (
                      <tr key={p.id} onClick={() => navigate(`/employees/${p.id}`)} className="cursor-pointer border-b border-edge last:border-0 hover:bg-canvas">
                        <td className="td"><div className="font-medium text-ink">{p.name}</div><div className="text-[11px] text-slate-400">{p.email}</div></td>
                        <td className="td"><span className="mono text-slate-600">{p.employee_id}</span></td>
                        <td className="td"><span className="mono text-slate-600">{p.pf_number}</span></td>
                        <td className="td text-slate-600">{p.designation}</td>
                        <td className="td text-slate-600">{p.station}</td>
                        <td className="td text-slate-600">{fmtDate(p.updated_at)}</td>
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
