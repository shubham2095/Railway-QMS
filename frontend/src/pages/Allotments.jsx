import { useNavigate } from 'react-router-dom';
import { useHeader } from '../components/Layout.jsx';
import { Async, Card, EmptyRow, Pagination, Pill, useFilters } from '../components/ui.jsx';
import { quarterTypeLabel } from '../lib/constants.js';
import { fmtDate, titleCase } from '../lib/format.js';
import { useApi } from '../lib/hooks.js';
import { useAuth } from '../lib/auth.jsx';

export default function Allotments() {
  const filters = useFilters();
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const staff = hasRole('quarter_clerk', 'estate_officer', 'admin', 'super_admin');
  useHeader('Allotments', staff ? 'Module 6 & 7 — quarter allotments and occupancy' : 'Quarters allotted to you');
  const q = useApi('/allotments', Object.fromEntries(filters.params));

  return (
    <div className="space-y-5">
      {staff && q.data && (
        <div className="flex items-center gap-2">
          <select value={filters.get('status')} onChange={(e) => filters.set({ status: e.target.value })} className="input-sm">
            <option value="">All statuses</option>
            {q.data.statuses.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
          </select>
          {filters.any('status') && <button onClick={filters.clear} className="text-xs font-medium text-slate-500 hover:underline">Clear</button>}
        </div>
      )}
      <Async q={q}>
        {({ data, meta, is_staff: isStaff }) => (
          <>
            <Card flush>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-edge text-left text-[11px] uppercase tracking-wide text-slate-400">
                      <th className="th">Order No.</th><th className="th">Quarter</th>{isStaff && <th className="th">Allottee</th>}
                      <th className="th">Offered</th><th className="th">Possession</th><th className="th">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.length === 0 && <EmptyRow cols={6}>No allotments found.</EmptyRow>}
                    {data.map((al) => (
                      <tr key={al.id} onClick={() => navigate(`/allotments/${al.id}`)} className="cursor-pointer border-b border-edge last:border-0 hover:bg-canvas">
                        <td className="td"><span className="mono font-medium text-ink">{al.allotment_order_no}</span></td>
                        <td className="td"><span className="mono text-slate-600">{al.quarter_number}</span><span className="text-slate-400"> · {quarterTypeLabel(al.quarter_type)}</span></td>
                        {isStaff && <td className="td text-slate-600">{al.employee_name ?? '—'}</td>}
                        <td className="td text-slate-600">{fmtDate(al.offered_at)}</td>
                        <td className="td text-slate-600">{fmtDate(al.possession_date)}</td>
                        <td className="td"><Pill status={al.status} /></td>
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
