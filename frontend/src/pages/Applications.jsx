import { Link, useNavigate } from 'react-router-dom';
import { useHeader } from '../components/Layout.jsx';
import { Async, Card, EmptyRow, Pagination, Pill, useFilters } from '../components/ui.jsx';
import { quarterTypeLabel } from '../lib/constants.js';
import { fmtDate, titleCase } from '../lib/format.js';
import { useApi } from '../lib/hooks.js';
import { useAuth } from '../lib/auth.jsx';

export default function Applications() {
  const filters = useFilters();
  const navigate = useNavigate();
  const q = useApi('/applications', Object.fromEntries(filters.params));
  const { hasPermission, hasRole } = useAuth();
  const staff = hasPermission('application.verify') || hasPermission('application.decide') || hasRole('admin', 'super_admin');
  useHeader('Applications', staff ? 'Verify, run the engine and decide on quarter applications' : 'Your quarter applications');

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {staff && q.data ? (
          <div className="flex flex-wrap items-center gap-2">
            <select value={filters.get('status')} onChange={(e) => filters.set({ status: e.target.value })} className="input-sm">
              <option value="">All statuses</option>
              {q.data.statuses.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
            </select>
            <select value={filters.get('type')} onChange={(e) => filters.set({ type: e.target.value })} className="input-sm">
              <option value="">All types</option>
              {q.data.types.map((t) => <option key={t} value={t}>{quarterTypeLabel(t)}</option>)}
            </select>
            {filters.any('status', 'type') && <button onClick={filters.clear} className="text-xs font-medium text-slate-500 hover:underline">Clear</button>}
          </div>
        ) : <div />}
        <Link to="/applications/new" className="btn-signal">New application</Link>
      </div>

      <Async q={q}>
        {(d) => (
          <>
            <Card flush>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-edge text-left text-[11px] uppercase tracking-wide text-slate-400">
                      <th className="th">Reference</th>
                      {d.is_staff && <th className="th">Employee</th>}
                      <th className="th">Type</th><th className="th">Station</th><th className="th">Applied</th><th className="th">Priority</th><th className="th">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.data.length === 0 && <EmptyRow cols={7}>No applications found.</EmptyRow>}
                    {d.data.map((a) => (
                      <tr key={a.id} onClick={() => navigate(`/applications/${a.id}`)} className="cursor-pointer border-b border-edge last:border-0 hover:bg-canvas">
                        <td className="td"><span className="mono font-medium text-ink">{a.reference_no}</span></td>
                        {d.is_staff && (
                          <td className="td">
                            <div className="font-medium text-ink">{a.employee_name ?? '—'}</div>
                            <div className="mono text-[11px] text-slate-400">{a.employee_id}</div>
                          </td>
                        )}
                        <td className="td text-slate-600">{quarterTypeLabel(a.preferred_quarter_type)}</td>
                        <td className="td text-slate-600">{a.station ?? '—'}</td>
                        <td className="td text-slate-600">{fmtDate(a.applied_at)}</td>
                        <td className="td">
                          {a.rank ? (<><span className="text-ink">#{a.rank}</span><span className="text-slate-400"> · {a.priority_score} pts</span></>) : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="td"><Pill status={a.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
            <Pagination meta={d.meta} />
          </>
        )}
      </Async>
    </div>
  );
}
