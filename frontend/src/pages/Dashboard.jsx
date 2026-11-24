import { Link } from 'react-router-dom';
import { useHeader } from '../components/Layout.jsx';
import { Async, Card, Pill, Stat } from '../components/ui.jsx';
import { useAuth } from '../lib/auth.jsx';
import { STATUS_TONES, quarterTypeLabel } from '../lib/constants.js';
import { fmtDate, titleCase } from '../lib/format.js';
import { useApi } from '../lib/hooks.js';

function Badge({ n }) {
  return n > 0 ? <span className="rounded-full bg-signal px-2 py-0.5 text-[10px] font-semibold text-white">{n}</span> : null;
}

export default function Dashboard() {
  useHeader('Dashboard', 'Estate overview and your quarter status');
  const { badges } = useAuth();
  const q = useApi('/dashboard');

  return (
    <Async q={q}>
      {(d) => {
        const s = d.stats;
        const review = (badges.applications_to_verify ?? 0) + (badges.applications_to_decide ?? 0);
        return (
          <div className="space-y-6">
            {d.is_staff && s && (
              <>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
                  <Stat label="Total Quarters" value={s.total_quarters} tone="rail" />
                  <Stat label="Occupied" value={s.occupied} tone="sky" />
                  <Stat label="Vacant" value={s.vacant} tone="emerald" />
                  <Stat label="Maintenance" value={s.maintenance} tone="amber" />
                  <Stat label="Pending Apps" value={s.pending_apps} tone="amber" />
                  <Stat label="On Waiting List" value={s.waitlist} tone="rail" />
                  <Stat label="Active Allotments" value={s.active_allotments} tone="sky" />
                  <Stat label="In Clearance" value={s.vacations_clearing} tone="amber" />
                  <Stat label="Retiring ≤60d" value={s.retiring_60d} tone="signal" />
                </div>

                <div className="grid gap-6 lg:grid-cols-3">
                  <Card title="Occupancy by quarter type" className="lg:col-span-2">
                    <div className="space-y-3">
                      {Object.entries(d.occupancy_by_type).length === 0 && <p className="text-sm text-slate-400">No quarters in the inventory yet.</p>}
                      {Object.entries(d.occupancy_by_type).map(([type, rows]) => {
                        const total = rows.reduce((a, r) => a + r.total, 0);
                        return (
                          <div key={type}>
                            <div className="mb-1 flex items-center justify-between text-xs">
                              <span className="font-semibold text-ink">{quarterTypeLabel(type)}</span>
                              <span className="text-slate-400">{total} quarter(s)</span>
                            </div>
                            <div className="flex h-3 overflow-hidden rounded-full bg-canvas">
                              {rows.map((r) => (
                                <div key={r.status} className={STATUS_TONES.quarter[r.status] ?? 'bg-slate-300'}
                                  style={{ width: `${total ? Math.round((r.total / total) * 100) : 0}%` }} title={`${r.status}: ${r.total}`} />
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
                      {Object.entries(STATUS_TONES.quarter).map(([k, c]) => (
                        <span key={k} className="inline-flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${c}`} />{titleCase(k)}</span>
                      ))}
                    </div>
                  </Card>

                  <Card title="Quick actions">
                    <div className="space-y-2 text-sm">
                      <Link to="/applications" className="flex items-center justify-between rounded-lg border border-edge px-3 py-2.5 hover:bg-canvas">
                        <span>Review applications</span><Badge n={review} />
                      </Link>
                      <Link to="/quarters" className="block rounded-lg border border-edge px-3 py-2.5 hover:bg-canvas">Quarter inventory</Link>
                      <Link to="/waiting-list" className="block rounded-lg border border-edge px-3 py-2.5 hover:bg-canvas">Approved applicants</Link>
                      <Link to="/vacations?mine_to_action=1" className="flex items-center justify-between rounded-lg border border-edge px-3 py-2.5 hover:bg-canvas">
                        <span>Clearances for me</span><Badge n={badges.clearances_for_me ?? 0} />
                      </Link>
                    </div>
                  </Card>
                </div>
              </>
            )}

            <div className="grid gap-6 lg:grid-cols-2">
              <Card title="My applications" actions={<Link to="/applications/new" className="rounded-md bg-rail px-3 py-1.5 text-xs font-semibold text-white hover:bg-ink">New application</Link>}>
                {d.my_applications.length === 0 && <p className="text-sm text-slate-400">You have not submitted any applications yet.</p>}
                {d.my_applications.map((a) => (
                  <Link key={a.id} to={`/applications/${a.id}`} className="-mx-2 flex items-center justify-between rounded-lg px-2 py-2.5 hover:bg-canvas">
                    <div>
                      <span className="mono text-sm font-medium text-ink">{a.reference_no}</span>
                      <p className="text-xs text-slate-500">Type-{a.preferred_quarter_type} · {a.station} · {fmtDate(a.applied_at, '')}</p>
                    </div>
                    <div className="text-right">
                      <Pill status={a.status} />
                      {a.rank && <p className="mt-1 text-[11px] text-slate-400">Rank #{a.rank} · {a.priority_score} pts</p>}
                    </div>
                  </Link>
                ))}
              </Card>

              <Card title="My quarters">
                {d.my_allotments.length === 0 && <p className="text-sm text-slate-400">No quarter is currently allotted to you.</p>}
                {d.my_allotments.map((al) => (
                  <Link key={al.id} to={`/allotments/${al.id}`} className="-mx-2 flex items-center justify-between rounded-lg px-2 py-2.5 hover:bg-canvas">
                    <div>
                      <span className="mono text-sm font-medium text-ink">{al.quarter_number}</span>
                      <p className="text-xs text-slate-500">{al.colony_name} · {al.allotment_order_no}</p>
                    </div>
                    <Pill status={al.status} />
                  </Link>
                ))}
                {!d.has_profile && (
                  <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    Complete your <Link to="/profile/edit" className="font-semibold underline">employee profile</Link> to apply for a quarter.
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
