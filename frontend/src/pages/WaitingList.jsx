import { Fragment, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useHeader } from '../components/Layout.jsx';
import { Async, Card, ErrorBanner } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { quarterTypeLabel } from '../lib/constants.js';
import { fmtDate } from '../lib/format.js';
import { useAction, useApi } from '../lib/hooks.js';


/** The admin picks a vacant quarter for one approved applicant (their colony choices come first). */
function OfferPanel({ entry, onClose }) {
  const navigate = useNavigate();
  const act = useAction();
  const prefs = entry.application.colony_preferences ?? [];
  const [colony, setColony] = useState(prefs[0]?.colony_name ?? '');
  const quarters = useApi('/quarters', { type: entry.quarter_type, status: 'vacant', ...(colony ? { colony } : {}) });

  const offer = async (qr) => {
    if (!window.confirm(`Offer quarter ${qr.quarter_number} (${qr.colony_name ?? '-'}) to ${entry.application.employee_name}?`)) return;
    const res = await act.run(() => api.post(`/quarters/${qr.id}/offer`, { waiting_list_entry_id: entry.id }));
    if (res) navigate(`/allotments/${res.id}`, { state: { flash: res.message } });
  };

  return (
    <div className="space-y-3 bg-canvas px-5 py-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink">Offer a {quarterTypeLabel(entry.quarter_type)} quarter to {entry.application.employee_name}</p>
          <p className="text-xs text-slate-500">{prefs.length ? `Wants: ${prefs.map((p) => `${p.priority}. ${p.colony_name}`).join('  ·  ')}` : 'No colony preference given.'}</p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label className="lbl-up">Colony</label>
            <select className="input-sm mt-1" value={colony} onChange={(e) => setColony(e.target.value)}>
              {prefs.map((p) => <option key={p.colony_name} value={p.colony_name}>{p.priority}. {p.colony_name}</option>)}
              <option value="">Any colony</option>
            </select>
          </div>
          <button className="btn-ghost btn-xs" onClick={onClose}>Close</button>
        </div>
      </div>
      <ErrorBanner error={act.error} />
      {quarters.loading && <p className="text-sm text-slate-400">Loading vacant quarters...</p>}
      {quarters.data && (
        quarters.data.data.length === 0 ? <p className="text-sm text-slate-500">No vacant {quarterTypeLabel(entry.quarter_type)} quarter{colony ? ` in ${colony}` : ''}. Try another colony.</p> : (
          <>
            <p className="text-xs text-slate-500">{quarters.data.meta.total} vacant — showing the first {quarters.data.data.length}</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {quarters.data.data.map((qr) => (
                <div key={qr.id} className="flex items-center justify-between rounded-lg border border-edge bg-paper px-3 py-2">
                  <div>
                    <p className="mono text-sm font-medium text-ink">{qr.quarter_number}</p>
                    <p className="text-[11px] text-slate-400">{qr.colony_name ?? '—'}{qr.pool ? ` · ${qr.pool}` : ''}</p>
                  </div>
                  <button className="btn-primary px-3 py-1 text-xs" disabled={act.busy} onClick={() => offer(qr)}>Offer</button>
                </div>
              ))}
            </div>
          </>
        )
      )}
    </div>
  );
}

export default function WaitingList() {
  useHeader('Approved Applicants', 'Approved by the admin — waiting for a quarter to be offered');
  const [params] = useSearchParams();
  const q = useApi('/waiting-list', Object.fromEntries(params));
  const { hasPermission } = useAuth();
  const [open, setOpen] = useState(null);

  return (
    <Async q={q}>
      {({ queues, entries, selected_type: type }) => (
        <div className="grid gap-6 lg:grid-cols-4">
          <Card title="Quarter types" className="lg:col-span-1">
            {queues.length === 0 ? <p className="text-sm text-slate-400">Nobody is approved and waiting for a quarter.</p> : (
              <div className="space-y-1">
                {queues.map((qu) => (
                  <Link key={qu.quarter_type} to={`/waiting-list?type=${qu.quarter_type}`}
                    className={`flex items-center justify-between rounded-lg px-3 py-2.5 text-sm transition ${qu.quarter_type === type ? 'bg-rail text-white' : 'text-rail hover:bg-canvas'}`}>
                    <span className="font-medium">{quarterTypeLabel(qu.quarter_type)}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${qu.quarter_type === type ? 'bg-white/20' : 'bg-canvas text-rail ring-1 ring-edge'}`}>{qu.total}</span>
                  </Link>
                ))}
              </div>
            )}
          </Card>

          <Card flush className="lg:col-span-3" title={type ? `${quarterTypeLabel(type)} — approved, best priority first` : 'Select a quarter type'}
            subtitle={hasPermission('allotment.approve') ? 'Pick an applicant and offer a vacant quarter from the list.' : 'The admin offers quarters from this list.'}>
            {entries.length === 0 ? <div className="p-5 text-sm text-slate-400">No approved applicants for this type.</div> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-edge text-left text-[11px] uppercase tracking-wide text-slate-400">
                      <th className="th">#</th><th className="th">Employee</th><th className="th">Category</th><th className="th">Priority</th><th className="th">Colony preference</th><th className="th">Approved</th><th className="th">Application</th><th className="th" />
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e, i) => (
                      <Fragment key={e.id}>
                      <tr className="border-b border-edge last:border-0 hover:bg-canvas">
                        <td className="td"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-canvas font-display text-sm font-bold text-rail ring-1 ring-edge">{i + 1}</span></td>
                        <td className="td">
                          <div className="font-medium text-ink">{e.application.employee_name ?? '—'}</div>
                          <div className="mono text-[11px] text-slate-400">{e.application.employee_id}</div>
                        </td>
                        <td className="td text-slate-600">{e.application.category ?? '—'}</td>
                        <td className="td font-semibold text-ink">{e.priority_score} <span className="font-normal text-slate-400">pts</span></td>
                        <td className="td">
                          {e.application.colony_preferences?.length ? (
                            <ol className="space-y-0.5 text-xs text-slate-600">
                              {e.application.colony_preferences.map((p) => <li key={p.priority}><span className="mr-1 font-semibold text-rail">{p.priority}.</span>{p.colony_name}</li>)}
                            </ol>
                          ) : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="td text-slate-600">{fmtDate(e.application.decided_at)}</td>
                        <td className="td"><Link to={`/applications/${e.application.id}`} className="mono text-xs text-rail hover:underline">{e.application.reference_no}</Link></td>
                        <td className="td">{hasPermission('allotment.approve') && <button className="btn-primary px-3 py-1 text-xs" onClick={() => setOpen(open === e.id ? null : e.id)}>{open === e.id ? 'Close' : 'Offer quarter'}</button>}</td>
                      </tr>
                      {open === e.id && <tr><td colSpan={8} className="p-0"><OfferPanel entry={e} onClose={() => setOpen(null)} /></td></tr>}
                      </Fragment>
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
