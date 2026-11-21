import { Link } from 'react-router-dom';
import { useHeader } from '../components/Layout.jsx';
import { Async, Card } from '../components/ui.jsx';
import { quarterTypeLabel } from '../lib/constants.js';
import { fmtDate } from '../lib/format.js';
import { useApi } from '../lib/hooks.js';
import { useSearchParams } from 'react-router-dom';

export default function WaitingList() {
  useHeader('Waiting List', 'Module 5 — dynamic priority queues');
  const [params] = useSearchParams();
  const q = useApi('/waiting-list', Object.fromEntries(params));

  return (
    <Async q={q}>
      {({ queues, entries, selected_type: type, selected_station: station }) => (
        <div className="grid gap-6 lg:grid-cols-4">
          <Card title="Queues" className="lg:col-span-1">
            {queues.length === 0 ? <p className="text-sm text-slate-400">No active waiting-list queues.</p> : (
              <div className="space-y-1">
                {queues.map((qu) => {
                  const active = qu.quarter_type === type && (qu.station ?? null) === (station ?? null);
                  return (
                    <Link key={`${qu.quarter_type}-${qu.station}`} to={`/waiting-list?type=${qu.quarter_type}&station=${encodeURIComponent(qu.station ?? '')}`}
                      className={`flex items-center justify-between rounded-lg px-3 py-2.5 text-sm transition ${active ? 'bg-rail text-white' : 'text-rail hover:bg-canvas'}`}>
                      <div>
                        <span className="font-medium">Type-{qu.quarter_type}</span>
                        <span className={active ? 'text-slate-300' : 'text-slate-400'}> · {qu.station ?? '—'}</span>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${active ? 'bg-white/20' : 'bg-canvas text-rail ring-1 ring-edge'}`}>{qu.total}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </Card>

          <Card flush className="lg:col-span-3" title={type ? `${quarterTypeLabel(type)} · ${station ?? 'All stations'}` : 'Select a queue'}>
            {entries.length === 0 ? <div className="p-5 text-sm text-slate-400">No applicants in this queue.</div> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-edge text-left text-[11px] uppercase tracking-wide text-slate-400">
                      <th className="th">Rank</th><th className="th">Employee</th><th className="th">Category</th><th className="th">Priority</th><th className="th">Colony preference</th><th className="th">Waiting Since</th><th className="th">Application</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e) => (
                      <tr key={e.id} className="border-b border-edge last:border-0 hover:bg-canvas">
                        <td className="td"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-canvas font-display text-sm font-bold text-rail ring-1 ring-edge">{e.rank}</span></td>
                        <td className="td">
                          <div className="font-medium text-ink">{e.application.employee_name ?? '—'}</div>
                          <div className="mono text-[11px] text-slate-400">{e.application.employee_id}</div>
                        </td>
                        <td className="td text-slate-600">{e.application.category ?? '—'}</td>
                        <td className="td font-semibold text-ink">{e.priority_score} <span className="font-normal text-slate-400">pts</span></td>
                        <td className="td">
                          {e.application.colony_preferences?.length ? (
                            <ol className="space-y-0.5 text-xs text-slate-600">
                              {e.application.colony_preferences.map((p) => (
                                <li key={p.priority}><span className="mr-1 font-semibold text-rail">{p.priority}.</span>{p.colony_name}</li>
                              ))}
                            </ol>
                          ) : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="td text-slate-600">{fmtDate(e.waiting_since)}</td>
                        <td className="td"><Link to={`/applications/${e.application.id}`} className="mono text-xs text-rail hover:underline">{e.application.reference_no}</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}
    </Async>
  );
}
