import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import CertificateList from '../components/CertificateList.jsx';
import { useHeader } from '../components/Layout.jsx';
import { Async, Card, ErrorBanner, Icon, Pill } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useFlash } from '../lib/flash.jsx';
import { fmtDate, fmtDateTime, inr, titleCase } from '../lib/format.js';
import { useAction, useApi } from '../lib/hooks.js';

export default function VacationDetail() {
  const { id } = useParams();
  const q = useApi(`/vacations/${id}`);
  const { hasPermission, refresh } = useAuth();
  const flash = useFlash();
  const act = useAction();
  const [form, setForm] = useState({ meter_reading: '', dues_amount: '0', has_damage: false, remarks: '' });
  const set = (k) => (e) => setForm((s) => ({ ...s, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  useHeader(q.data ? `Vacation ${q.data.vacation.reference_no}` : 'Vacation', q.data ? `Quarter ${q.data.quarter.quarter_number} · Module 9 clearance` : '');

  const decide = (step, decision) => async () => {
    const res = await act.run(() => api.post(`/vacations/${id}/act`, { step, decision, ...form }));
    if (res) {
      flash.success(res.message);
      setForm({ meter_reading: '', dues_amount: '0', has_damage: false, remarks: '' });
      q.reload();
      refresh(); // sidebar "awaiting me" badge
    }
  };

  return (
    <Async q={q}>
      {({ vacation: v, quarter, allotment, clearances, certificates }) => {
        const current = v.current_step;
        const canAct = v.status === 'in_clearance' && current && hasPermission(`vacation.${current}`);
        return (
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="mono text-lg font-semibold text-ink">{v.reference_no}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      Quarter <Link to={`/quarters/${quarter.id}`} className="mono text-rail hover:underline">{quarter.quarter_number}</Link>
                      {' '}· {titleCase(v.trigger)} · vacate by {fmtDate(v.requested_vacation_date)}
                    </p>
                  </div>
                  <Pill status={v.status} />
                </div>
                {v.reason && (
                  <div className="mt-4 rounded-lg bg-canvas px-4 py-3 text-sm text-rail">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Remarks</span>
                    <p className="mt-1">{v.reason}</p>
                  </div>
                )}
              </Card>

              <Card title="Clearance workflow" subtitle="Module 9 — multi-level departmental clearance">
                <ol className="space-y-3">
                  {clearances.map((c) => {
                    const isCurrent = current === c.step && v.status === 'in_clearance';
                    const dot = c.status === 'approved' ? 'bg-emerald-500' : c.status === 'rejected' ? 'bg-rose-500' : isCurrent ? 'bg-amber-500' : 'bg-slate-300';
                    const text = c.status === 'approved' ? 'text-emerald-700' : c.status === 'rejected' ? 'text-rose-700' : 'text-amber-700';
                    return (
                      <li key={c.id} className={`rounded-lg border p-4 ${isCurrent ? 'border-amber-300 bg-amber-50/50' : 'border-edge'}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-canvas font-display text-xs font-bold text-rail ring-1 ring-edge">{c.sequence}</span>
                            <div>
                              <p className="text-sm font-semibold text-ink">{c.label}</p>
                              <p className="text-[11px] text-slate-400">
                                {c.acted_at ? `${c.handler_name ?? ''} · ${fmtDateTime(c.acted_at)}` : `Awaiting ${titleCase(c.authorised_role)}`}
                              </p>
                            </div>
                          </div>
                          <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${text}`}>
                            <span className={`h-2 w-2 rounded-full ${dot}`} />{titleCase(c.status)}
                          </span>
                        </div>
                        {(c.meter_reading || c.dues_amount || c.has_damage || c.remarks) && (
                          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-edge pt-3 text-xs text-slate-600 sm:grid-cols-4">
                            {c.meter_reading ? <div><span className="text-slate-400">Meter:</span> {c.meter_reading}</div> : null}
                            {c.dues_amount ? <div><span className="text-slate-400">Dues:</span> {inr(c.dues_amount, 2)}</div> : null}
                            {c.has_damage ? <div className="text-rose-600">Damage noted</div> : null}
                            {c.remarks && <div className="col-span-2 sm:col-span-4"><span className="text-slate-400">Remarks:</span> {c.remarks}</div>}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </Card>

              {certificates.length > 0 && (
                <Card title="Certificates" subtitle="Module 11"><CertificateList certificates={certificates} /></Card>
              )}
            </div>

            <div className="space-y-6">
              {canAct ? (
                <Card title={`Act on: ${v.current_step_label}`}>
                  <ErrorBanner error={act.error} />
                  <div className="space-y-3">
                    {['electrical', 'water'].includes(current) && (
                      <div><label className="lbl">Final meter reading</label><input type="number" step="0.01" min="0" className="input" value={form.meter_reading} onChange={set('meter_reading')} /></div>
                    )}
                    {current === 'accounts' && (
                      <div><label className="lbl">Outstanding dues (₹)</label><input type="number" step="0.01" min="0" className="input" value={form.dues_amount} onChange={set('dues_amount')} /></div>
                    )}
                    {current === 'clerk_inspection' && (
                      <label className="flex items-center gap-2 text-sm text-rail">
                        <input type="checkbox" checked={form.has_damage} onChange={set('has_damage')} className="rounded border-edge text-rail focus:ring-rail" /> Damage to quarter noted
                      </label>
                    )}
                    <div><label className="lbl">Remarks</label><textarea rows="2" className="input" value={form.remarks} onChange={set('remarks')} /></div>
                    <div className="flex gap-2 pt-1">
                      <button className="btn-ok flex-1" disabled={act.busy} onClick={decide(current, 'approve')}>Approve</button>
                      <button className="btn-signal flex-1" disabled={act.busy} onClick={decide(current, 'reject')}>Reject</button>
                    </div>
                  </div>
                </Card>
              ) : v.status === 'completed' ? (
                <Card title="Workflow complete">
                  <div className="flex items-center gap-3 text-sm text-emerald-700">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 ring-1 ring-emerald-200"><Icon name="check" className="h-4 w-4" strokeWidth={2.5} /></span>
                    <div><p className="font-medium text-ink">Quarter handed over</p><p className="text-[11px] text-slate-400">Completed {fmtDate(v.completed_at)}</p></div>
                  </div>
                </Card>
              ) : null}

              <Card title="Summary">
                <dl className="space-y-3 text-sm">
                  <div className="flex justify-between"><dt className="text-slate-400">Allottee</dt><dd className="text-ink">{v.employee_name}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-400">Allotment</dt><dd>{allotment ? <Link to={`/allotments/${allotment.id}`} className="mono text-rail hover:underline">{allotment.allotment_order_no}</Link> : '—'}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-400">Current step</dt><dd className="text-ink">{v.current_step_label ?? '—'}</dd></div>
                </dl>
              </Card>
            </div>
          </div>
        );
      }}
    </Async>
  );
}
