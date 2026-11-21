import { Link, useParams } from 'react-router-dom';
import CertificateList from '../components/CertificateList.jsx';
import { useHeader } from '../components/Layout.jsx';
import { Async, Card, Dl, ErrorBanner, Pill } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { quarterTypeLabel } from '../lib/constants.js';
import { useFlash } from '../lib/flash.jsx';
import { fmtDate } from '../lib/format.js';
import { useAction, useApi } from '../lib/hooks.js';

export default function AllotmentDetail() {
  const { id } = useParams();
  const q = useApi(`/allotments/${id}`);
  const { hasPermission, refresh } = useAuth();
  const flash = useFlash();
  const act = useAction();
  useHeader(q.data ? `Allotment ${q.data.allotment.allotment_order_no}` : 'Allotment', q.data ? `Quarter ${q.data.quarter.quarter_number}` : '');

  const run = (fn, message) => async () => {
    const ok = await act.run(fn);
    if (ok) { flash.success(message); q.reload(); refresh(); }
  };

  return (
    <Async q={q}>
      {({ allotment: a, quarter, application, occupancy, certificates, vacation_request: vac, is_owner: isOwner }) => (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <ErrorBanner error={act.error} />
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="mono text-lg font-semibold text-ink">{a.allotment_order_no}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    Quarter <Link to={`/quarters/${quarter.id}`} className="mono text-rail hover:underline">{quarter.quarter_number}</Link>
                    {' '}· {quarterTypeLabel(quarter.quarter_type)} · {quarter.colony_name}
                  </p>
                </div>
                <Pill status={a.status} />
              </div>
              <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-edge pt-4 text-sm sm:grid-cols-3">
                <Dl label="Allottee">{a.employee_name}</Dl>
                <Dl label="Employee ID" mono>{a.employee_id}</Dl>
                <Dl label="Station">{quarter.station}</Dl>
                <Dl label="Offered">{fmtDate(a.offered_at)}</Dl>
                <Dl label="Responded">{fmtDate(a.responded_at)}</Dl>
                <Dl label="Possession">{fmtDate(a.possession_date)}</Dl>
                {application && <Dl label="Application"><Link to={`/applications/${application.id}`} className="mono text-rail hover:underline">{application.reference_no}</Link></Dl>}
              </dl>
            </Card>

            {occupancy && (
              <Card title="Occupancy" subtitle="Module 7">
                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
                  <Dl label="Start date">{fmtDate(occupancy.start_date)}</Dl>
                  <Dl label="End date">{fmtDate(occupancy.end_date)}</Dl>
                  <Dl label="Current">{occupancy.is_current ? <Pill status="active">Yes</Pill> : <span className="text-slate-400">No</span>}</Dl>
                </dl>
              </Card>
            )}

            <Card title="Certificates" subtitle="Module 11 — generated documents">
              {certificates.length === 0 ? <p className="text-sm text-slate-400">No certificates issued yet.</p> : <CertificateList certificates={certificates} />}
            </Card>
          </div>

          <div className="space-y-6">
            {isOwner && a.status === 'offered' && (
              <Card title="Respond to offer">
                <p className="mb-3 text-sm text-slate-500">A quarter has been offered to you. Accept to proceed to possession, or reject to release it back to the queue.</p>
                <div className="flex gap-2">
                  <button className="btn-ok flex-1" disabled={act.busy} onClick={run(() => api.post(`/allotments/${id}/respond`, { decision: 'accept' }), 'Response recorded.')}>Accept</button>
                  <button className="btn-signal flex-1" disabled={act.busy} onClick={run(() => api.post(`/allotments/${id}/respond`, { decision: 'reject' }), 'Response recorded.')}>Reject</button>
                </div>
              </Card>
            )}
            {hasPermission('allotment.possession') && a.status === 'accepted' && (
              <Card title="Record possession">
                <p className="mb-3 text-sm text-slate-500">Mark that the allottee has taken physical possession. This starts the occupancy and issues the possession &amp; occupancy certificates.</p>
                <button className="btn-primary w-full" disabled={act.busy} onClick={run(() => api.post(`/allotments/${id}/possession`), 'Possession recorded; occupancy started.')}>Record possession</button>
              </Card>
            )}
            <Card title="Vacation">
              {vac ? (
                <Link to={`/vacations/${vac.id}`} className="flex items-center justify-between rounded-lg border border-edge px-3 py-2.5 text-sm hover:bg-canvas">
                  <div><span className="mono font-medium text-ink">{vac.reference_no}</span><p className="text-xs text-slate-500">Vacation request</p></div>
                  <Pill status={vac.status} />
                </Link>
              ) : isOwner && ['possession_taken', 'accepted'].includes(a.status) ? (
                <>
                  <p className="mb-3 text-sm text-slate-500">Vacating this quarter? Start the clearance workflow.</p>
                  <Link to="/vacations/new" className="btn-ghost block text-center">Apply for vacation</Link>
                </>
              ) : <p className="text-sm text-slate-400">No vacation request.</p>}
            </Card>
          </div>
        </div>
      )}
    </Async>
  );
}
