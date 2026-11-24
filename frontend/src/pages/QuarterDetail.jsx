import { Link, useNavigate, useParams } from 'react-router-dom';
import { useHeader } from '../components/Layout.jsx';
import { Async, Card, Dl, ErrorBanner, Pill } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { quarterTypeLabel } from '../lib/constants.js';
import { fmtDate, titleCase } from '../lib/format.js';
import { useAction, useApi } from '../lib/hooks.js';

export default function QuarterDetail() {
  const { id } = useParams();
  const q = useApi(`/quarters/${id}`);
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const offer = useAction();
  useHeader(q.data ? `Quarter ${q.data.quarter.quarter_number}` : 'Quarter', q.data?.quarter.colony_name ?? '');

  const doOffer = async (entry) => {
    if (!window.confirm(`Offer this quarter to ${entry.application.employee_name}?`)) return;
    const res = await offer.run(() => api.post(`/quarters/${id}/offer`, { waiting_list_entry_id: entry.id }));
    if (res) navigate(`/allotments/${res.id}`, { state: { flash: res.message } });
  };

  return (
    <Async q={q}>
      {({ quarter, occupancies, allotments, suggestions }) => {
        const canApprove = hasPermission('allotment.approve');
        return (
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="mono text-lg font-semibold text-ink">{quarter.quarter_number}</p>
                    <p className="mt-1 text-sm text-slate-500">{quarterTypeLabel(quarter.quarter_type)} · {quarter.colony_name ?? '—'} · {quarter.station ?? '—'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Pill status={quarter.status} />
                    {hasPermission('quarter.manage') && <Link to={`/quarters/${id}/edit`} className="btn-ghost btn-xs">Edit</Link>}
                  </div>
                </div>
                <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-edge pt-4 text-sm sm:grid-cols-3">
                  <Dl label="Railway Zone">{quarter.railway_zone}</Dl>
                  <Dl label="Division">{quarter.division}</Dl>
                  <Dl label="Block">{quarter.block}</Dl>
                  <Dl label="Floor">{quarter.floor}</Dl>
                  <Dl label="Pool">{quarter.pool}</Dl>
                  <Dl label="Address" className="col-span-2">{quarter.address}</Dl>
                  <Dl label="Current Occupant">{quarter.occupant_name}</Dl>
                  <Dl label="Remarks (master data)" className="col-span-2">{quarter.remarks}</Dl>
                </dl>
              </Card>

              <Card title="Allotment history" subtitle="Module 6">
                {allotments.length === 0 ? <p className="text-sm text-slate-400">No allotments recorded.</p> : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="text-left text-[11px] uppercase tracking-wide text-slate-400"><th className="pb-2 font-medium">Order No.</th><th className="pb-2 font-medium">Allottee</th><th className="pb-2 font-medium">Offered</th><th className="pb-2 font-medium">Status</th></tr></thead>
                      <tbody>
                        {allotments.map((al) => (
                          <tr key={al.id} onClick={() => navigate(`/allotments/${al.id}`)} className="cursor-pointer border-t border-edge hover:bg-canvas">
                            <td className="py-2.5"><span className="mono text-ink">{al.allotment_order_no}</span></td>
                            <td className="py-2.5 text-slate-600">{al.employee_name ?? '—'}</td>
                            <td className="py-2.5 text-slate-600">{fmtDate(al.offered_at)}</td>
                            <td className="py-2.5"><Pill status={al.status} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>

              <Card title="Occupancy history" subtitle="Module 7">
                {occupancies.length === 0 ? <p className="text-sm text-slate-400">No occupancy history.</p> : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="text-left text-[11px] uppercase tracking-wide text-slate-400"><th className="pb-2 font-medium">Occupant</th><th className="pb-2 font-medium">From</th><th className="pb-2 font-medium">To</th><th className="pb-2 font-medium">Current</th></tr></thead>
                      <tbody>
                        {occupancies.map((o) => (
                          <tr key={o.id} className="border-t border-edge">
                            <td className="py-2.5 text-ink">{o.employee_name ?? '—'}</td>
                            <td className="py-2.5 text-slate-600">{fmtDate(o.start_date)}</td>
                            <td className="py-2.5 text-slate-600">{fmtDate(o.end_date)}</td>
                            <td className="py-2.5">{o.is_current ? <Pill status="active">Current</Pill> : <span className="text-slate-400">—</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </div>

            <div className="space-y-6">
              <Card title="Allotment suggestions" subtitle="Admin-approved applicants, best priority first">
                <ErrorBanner error={offer.error} />
                {quarter.status !== 'vacant' ? (
                  <div className="rounded-lg bg-canvas px-4 py-3 text-sm text-slate-500">
                    This quarter is <span className="font-medium">{titleCase(quarter.status)}</span>. Suggestions appear when it is vacant.
                  </div>
                ) : suggestions.length === 0 ? (
                  <p className="text-sm text-slate-400">No admin-approved applicants are waiting for {quarterTypeLabel(quarter.quarter_type)}. The admin approves applicants from the Approval Queue.</p>
                ) : (
                  <div className="space-y-3">
                    {suggestions.map((e) => (
                      <div key={e.id} className="rounded-lg border border-edge p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-ink">{e.application.employee_name ?? '—'}</p>
                            <p className="text-[11px] text-slate-400">Rank #{e.rank} · {e.priority_score} pts · since {fmtDate(e.waiting_since)}</p>
                          </div>
                          <Pill status="neutral">{e.application.category}</Pill>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                          <span className={`rounded-full px-2 py-0.5 font-medium ring-1 ring-inset ${
                            e.application.status === 'approved' ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
                            : e.application.status === 'forwarded' ? 'bg-amber-50 text-amber-700 ring-amber-600/20'
                            : 'bg-slate-100 text-slate-500 ring-slate-500/20'}`}>
                            {e.application.status === 'approved' ? 'Approved by admin' : e.application.status === 'forwarded' ? 'Awaiting admin approval' : 'Not yet forwarded to admin'}
                          </span>
                        </div>
                        <div className="mt-2 text-[11px]">
                          {e.colony_choice ? (
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                              {quarter.colony_name} is their choice #{e.colony_choice}
                            </span>
                          ) : (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-500 ring-1 ring-inset ring-slate-500/20">
                              {quarter.colony_name ?? 'This colony'} is not on their list
                            </span>
                          )}
                          {e.application.colony_preferences?.length > 0 && (
                            <p className="mt-1 text-slate-400">
                              Wants: {e.application.colony_preferences.map((p) => `${p.priority}. ${p.colony_name}`).join('  ·  ')}
                            </p>
                          )}
                        </div>
                        {canApprove && <button className="btn-primary mt-3 w-full px-3 py-1.5 text-xs" disabled={offer.busy} onClick={() => doOffer(e)}>Offer quarter</button>}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </div>
        );
      }}
    </Async>
  );
}
