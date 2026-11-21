import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useHeader } from '../components/Layout.jsx';
import { Async, Card, Dl, ErrorBanner, Icon, Pill } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { SERVICE_TYPES, quarterTypeLabel } from '../lib/constants.js';
import { useFlash } from '../lib/flash.jsx';
import { fmtDate, fmtDateTime, kb, titleCase } from '../lib/format.js';
import { useAction, useApi } from '../lib/hooks.js';

const BREAK_LABELS = {
  essential_service: 'Essential service', medical_ground: 'Medical ground', category: 'Category',
  seniority: 'Seniority', application_age: 'Application age',
};

export default function ApplicationDetail() {
  const { id } = useParams();
  const q = useApi(`/applications/${id}`);
  const { hasPermission, refresh } = useAuth();
  const flash = useFlash();
  const act = useAction();
  const [remarks, setRemarks] = useState('');
  useHeader(q.data ? `Application ${q.data.application.reference_no}` : 'Application', 'Module 3, 4 & 5 — eligibility, priority and decision');

  const run = (fn, message) => async () => {
    const ok = await act.run(fn);
    if (ok) { flash.success(message); q.reload(); refresh(); }
  };

  return (
    <Async q={q}>
      {({ application: a, documents, allotment }) => {
        const canVerify = hasPermission('application.verify');
        const canDecide = hasPermission('application.decide');
        const elig = a.eligibility_result;
        const brk = a.priority_breakdown;
        return (
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <ErrorBanner error={act.error} />
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="mono text-lg font-semibold text-ink">{a.reference_no}</p>
                    <p className="mt-1 text-sm text-slate-500">{quarterTypeLabel(a.preferred_quarter_type)} · {a.station ?? '—'} · applied {fmtDate(a.applied_at)}</p>
                  </div>
                  <Pill status={a.status} />
                </div>
                <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-edge pt-4 text-sm sm:grid-cols-3">
                  <Dl label="Applicant">{a.employee_name}</Dl>
                  <Dl label="Employee ID" mono>{a.employee_id}</Dl>
                  <Dl label="Category">{a.category}</Dl>
                  <Dl label="Service">{SERVICE_TYPES[a.service_type]}</Dl>
                  <Dl label="Family Size">{a.family_size}</Dl>
                  <Dl label="Medical Ground">{a.medical_ground ? 'Yes' : 'No'}</Dl>
                </dl>
                {a.colony_preferences?.length > 0 && (
                  <div className="mt-4 border-t border-edge pt-4">
                    <p className="text-[11px] uppercase tracking-wide text-slate-400">Preferred colonies (in order of priority)</p>
                    <ol className="mt-2 space-y-1.5 text-sm">
                      {a.colony_preferences.map((p) => (
                        <li key={p.priority} className="flex items-center gap-2.5">
                          <span className={`flex h-6 w-6 items-center justify-center rounded-full font-display text-xs font-bold ring-1 ${p.priority === 1 ? 'bg-rail text-white ring-rail' : 'bg-canvas text-rail ring-edge'}`}>{p.priority}</span>
                          <span className="text-ink">{p.colony_name}</span>
                          {p.priority === 1 && <span className="text-[11px] text-slate-400">1st choice</span>}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
                {a.special_grounds && (
                  <div className="mt-4 rounded-lg bg-canvas px-4 py-3 text-sm text-rail">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Special grounds</span>
                    <p className="mt-1">{a.special_grounds}</p>
                  </div>
                )}
                {a.remarks && (
                  <div className="mt-3 rounded-lg border border-edge px-4 py-3 text-sm text-rail">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Decision remarks</span>
                    <p className="mt-1">{a.remarks}</p>
                  </div>
                )}
              </Card>

              {elig && (
                <Card title="Eligibility check" subtitle="Module 4 — automatic verification">
                  <div className="mb-3">{elig.eligible ? <Pill status="eligible">Eligible</Pill> : <Pill status="ineligible">Not eligible</Pill>}</div>
                  <div className="space-y-2">
                    {Object.entries(elig.checks ?? {}).map(([name, passed]) => (
                      <div key={name} className="flex items-center gap-2 text-sm">
                        <span className={`flex h-5 w-5 items-center justify-center rounded-full ring-1 ${passed ? 'bg-emerald-50 text-emerald-600 ring-emerald-200' : 'bg-rose-50 text-rose-600 ring-rose-200'}`}>
                          <Icon name={passed ? 'check' : 'x'} className="h-3 w-3" strokeWidth={3} />
                        </span>
                        <span className="text-rail">{titleCase(name)}</span>
                      </div>
                    ))}
                  </div>
                  {elig.reasons?.length > 0 && (
                    <ul className="mt-4 list-disc space-y-1 rounded-lg bg-rose-50 px-5 py-3 text-sm text-rose-700">
                      {elig.reasons.map((r) => <li key={r}>{r}</li>)}
                    </ul>
                  )}
                </Card>
              )}

              {brk && (
                <Card title="Priority score" subtitle="Module 4 — priority matrix">
                  <div className="mb-3 flex items-baseline gap-2">
                    <span className="font-display text-3xl font-bold text-ink">{a.priority_score}</span>
                    <span className="text-sm text-slate-400">total points</span>
                    {a.rank && <span className="ml-auto rounded-full bg-canvas px-3 py-1 text-xs font-semibold text-rail ring-1 ring-edge">Waiting rank #{a.rank}</span>}
                  </div>
                  <table className="w-full text-sm">
                    <tbody>
                      {Object.entries(brk).map(([k, v]) => (
                        <tr key={k} className="border-t border-edge first:border-0">
                          <td className="py-2 text-rail">{BREAK_LABELS[k] ?? titleCase(k)}</td>
                          <td className="py-2 text-right font-medium text-ink">{v}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              )}

              <Card title="Documents" subtitle="Module 15">
                {documents.length === 0 ? <p className="text-sm text-slate-400">No documents uploaded.</p> : (
                  <div className="divide-y divide-edge">
                    {documents.map((doc) => (
                      <div key={doc.id} className="flex items-center justify-between py-2.5 text-sm">
                        <div className="flex items-center gap-3">
                          <Icon name="doc" className="h-4 w-4 text-slate-400" />
                          <div>
                            <p className="font-medium text-ink">{doc.title ?? doc.original_name}</p>
                            <p className="text-[11px] text-slate-400">{titleCase(doc.category)} · {kb(doc.size)}</p>
                          </div>
                        </div>
                        <a href={`/api/documents/${doc.id}`} className="btn-ghost btn-xs">Download</a>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>

            <div className="space-y-6">
              {canVerify && a.status === 'submitted' && (
                <Card title="Clerk verification">
                  <p className="mb-3 text-sm text-slate-500">Verify the submitted documents to run the eligibility &amp; priority engine.</p>
                  <button className="btn-primary w-full" disabled={act.busy} onClick={run(() => api.post(`/applications/${id}/verify`), 'Verified. Eligibility & priority engine has run.')}>Verify &amp; run engine</button>
                </Card>
              )}
              {canVerify && ['verified', 'eligible', 'ineligible', 'waitlisted'].includes(a.status) && (
                <Card title="Re-run engine">
                  <p className="mb-3 text-sm text-slate-500">Re-evaluate eligibility and priority after a data correction.</p>
                  <button className="btn-ghost w-full" disabled={act.busy} onClick={run(() => api.post(`/applications/${id}/run-engine`), 'Engine re-evaluated.')}>Re-evaluate</button>
                </Card>
              )}
              {canDecide && ['verified', 'eligible', 'waitlisted'].includes(a.status) && (
                <Card title="Estate Officer decision">
                  <div className="space-y-3">
                    <textarea rows="3" placeholder="Remarks (optional)" className="input mt-0" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
                    <div className="flex gap-2">
                      <button className="btn-ok flex-1" disabled={act.busy} onClick={run(() => api.post(`/applications/${id}/decide`, { decision: 'approve', remarks }), 'Decision recorded.')}>Approve</button>
                      <button className="btn-signal flex-1" disabled={act.busy} onClick={run(() => api.post(`/applications/${id}/decide`, { decision: 'reject', remarks }), 'Decision recorded.')}>Reject</button>
                    </div>
                  </div>
                </Card>
              )}
              {allotment && (
                <Card title="Allotment">
                  <Link to={`/allotments/${allotment.id}`} className="flex items-center justify-between rounded-lg border border-edge px-3 py-2.5 text-sm hover:bg-canvas">
                    <div>
                      <span className="mono font-medium text-ink">{allotment.allotment_order_no}</span>
                      <p className="text-xs text-slate-500">Quarter {allotment.quarter_number}</p>
                    </div>
                    <Pill status={allotment.status} />
                  </Link>
                </Card>
              )}
              <Card title="Timeline">
                <ol className="space-y-3 text-sm">
                  <li className="flex gap-3"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-rail" /><div><p className="text-ink">Submitted</p><p className="text-[11px] text-slate-400">{fmtDateTime(a.applied_at)}</p></div></li>
                  {a.verified_at && <li className="flex gap-3"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-rail" /><div><p className="text-ink">Verified by clerk</p><p className="text-[11px] text-slate-400">{fmtDateTime(a.verified_at)}</p></div></li>}
                  {a.decided_at && <li className="flex gap-3"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-signal" /><div><p className="text-ink">Decided by Estate Officer</p><p className="text-[11px] text-slate-400">{fmtDateTime(a.decided_at)}</p></div></li>}
                </ol>
              </Card>
            </div>
          </div>
        );
      }}
    </Async>
  );
}
