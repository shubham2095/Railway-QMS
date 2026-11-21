import { Link, useNavigate } from 'react-router-dom';
import { useHeader } from '../components/Layout.jsx';
import { Async, Card, EmptyRow, Pagination, Pill, useFilters } from '../components/ui.jsx';
import { fmtDate, titleCase } from '../lib/format.js';
import { useApi } from '../lib/hooks.js';

export default function Vacations() {
  useHeader('Vacations', 'Module 8 & 9 — vacation requests and clearance workflow');
  const filters = useFilters();
  const navigate = useNavigate();
  const q = useApi('/vacations', Object.fromEntries(filters.params));
  const mine = ['1', 'true'].includes(filters.get('mine_to_action'));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {q.data?.my_step && (
            <>
              <button onClick={() => filters.set({ mine_to_action: '' })} className={`rounded-md px-3 py-1.5 text-sm font-medium ${!mine ? 'bg-rail text-white' : 'text-rail hover:bg-canvas'}`}>All</button>
              <button onClick={() => filters.set({ mine_to_action: '1' })} className={`rounded-md px-3 py-1.5 text-sm font-medium ${mine ? 'bg-rail text-white' : 'text-rail hover:bg-canvas'}`}>Awaiting my clearance</button>
            </>
          )}
        </div>
        <Link to="/vacations/new" className="btn-signal">New vacation request</Link>
      </div>

      <Async q={q}>
        {({ data, meta, is_staff: isStaff }) => (
          <>
            <Card flush>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-edge text-left text-[11px] uppercase tracking-wide text-slate-400">
                      <th className="th">Reference</th><th className="th">Quarter</th>{isStaff && <th className="th">Employee</th>}
                      <th className="th">Trigger</th><th className="th">Vacation Date</th><th className="th">Current Step</th><th className="th">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.length === 0 && <EmptyRow cols={7}>No vacation requests found.</EmptyRow>}
                    {data.map((r) => (
                      <tr key={r.id} onClick={() => navigate(`/vacations/${r.id}`)} className="cursor-pointer border-b border-edge last:border-0 hover:bg-canvas">
                        <td className="td"><span className="mono font-medium text-ink">{r.reference_no}</span></td>
                        <td className="td"><span className="mono text-slate-600">{r.quarter_number}</span></td>
                        {isStaff && <td className="td text-slate-600">{r.employee_name ?? '—'}</td>}
                        <td className="td text-slate-600">{titleCase(r.trigger)}</td>
                        <td className="td text-slate-600">{fmtDate(r.requested_vacation_date)}</td>
                        <td className="td text-slate-600">{r.current_step_label ?? '—'}</td>
                        <td className="td"><Pill status={r.status} /></td>
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
