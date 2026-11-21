import { useHeader } from '../components/Layout.jsx';
import { Async, Card, EmptyRow, ErrorBanner, Pagination, Pill } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useFlash } from '../lib/flash.jsx';
import { fmtDate, inr } from '../lib/format.js';
import { useAction, useApi } from '../lib/hooks.js';
import { useSearchParams } from 'react-router-dom';
import { useState } from 'react';

export default function Retirements() {
  useHeader('Retirement', 'Module 10 — retention & overstay management');
  const [params] = useSearchParams();
  const q = useApi('/retirements', Object.fromEntries(params));
  const { hasRole } = useAuth();
  const flash = useFlash();
  const act = useAction();
  const [retention, setRetention] = useState({}); // profile id -> boolean (default true)

  const runCycle = async () => {
    if (!window.confirm('Run the daily retention/overstay evaluation now?')) return;
    const res = await act.run(() => api.post('/retirements/run-cycle'));
    if (res) { flash.success(res.message); q.reload(); }
  };
  const record = (p) => async () => {
    const res = await act.run(() => api.post('/retirements', { employee_profile_id: p.id, grant_retention: retention[p.id] ?? true }));
    if (res) { flash.success('Retirement recorded.'); q.reload(); }
  };

  return (
    <Async q={q}>
      {({ data, meta, upcoming }) => (
        <div className="space-y-6">
          <ErrorBanner error={act.error} />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-500">Track retention periods, expiry alerts and overstay penalties.</p>
            {hasRole('admin', 'super_admin', 'estate_officer') && <button onClick={runCycle} disabled={act.busy} className="btn-primary">Run retention cycle</button>}
          </div>

          <Card title="Upcoming retirements" subtitle="Within the next 6 months · not yet recorded">
            {upcoming.length === 0 ? <p className="text-sm text-slate-400">No upcoming retirements pending a record.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-[11px] uppercase tracking-wide text-slate-400"><th className="pb-2 font-medium">Employee</th><th className="pb-2 font-medium">Designation</th><th className="pb-2 font-medium">Retirement Date</th><th className="pb-2 font-medium">In</th><th className="pb-2" /></tr></thead>
                  <tbody>
                    {upcoming.map((p) => (
                      <tr key={p.id} className="border-t border-edge">
                        <td className="py-2.5"><div className="font-medium text-ink">{p.name}</div><div className="mono text-[11px] text-slate-400">{p.employee_id}</div></td>
                        <td className="py-2.5 text-slate-600">{p.designation ?? '—'}</td>
                        <td className="py-2.5 text-slate-600">{fmtDate(p.retirement_date)}</td>
                        <td className="py-2.5 text-slate-600">{p.days_until} d</td>
                        <td className="py-2.5 text-right">
                          <span className="inline-flex items-center gap-2">
                            <label className="flex items-center gap-1 text-[11px] text-slate-500">
                              <input type="checkbox" checked={retention[p.id] ?? true} onChange={(e) => setRetention((s) => ({ ...s, [p.id]: e.target.checked }))} className="rounded border-edge text-rail focus:ring-rail" /> retention
                            </label>
                            <button onClick={record(p)} disabled={act.busy} className="btn-xs bg-rail text-white hover:bg-ink">Record</button>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card flush title="Retirement records">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-edge text-left text-[11px] uppercase tracking-wide text-slate-400">
                    <th className="th">Employee</th><th className="th">Quarter</th><th className="th">Retired</th><th className="th">Retention Expiry</th><th className="th">Overstay</th><th className="th">Penalty</th><th className="th">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.length === 0 && <EmptyRow cols={7}>No retirement records yet.</EmptyRow>}
                  {data.map((r) => (
                    <tr key={r.id} className="border-b border-edge last:border-0 hover:bg-canvas">
                      <td className="td"><div className="font-medium text-ink">{r.employee_name ?? '—'}</div><div className="mono text-[11px] text-slate-400">{r.employee_id}</div></td>
                      <td className="td"><span className="mono text-slate-600">{r.quarter_number ?? '—'}</span></td>
                      <td className="td text-slate-600">{fmtDate(r.retirement_date)}</td>
                      <td className="td text-slate-600">{fmtDate(r.retention_expiry_date)}</td>
                      <td className={`td ${r.overstay_days > 0 ? 'font-semibold text-rose-600' : 'text-slate-400'}`}>{r.overstay_days ? `${r.overstay_days} d` : '—'}</td>
                      <td className={`td ${r.penalty_amount > 0 ? 'font-semibold text-rose-600' : 'text-slate-400'}`}>{r.penalty_amount > 0 ? inr(r.penalty_amount) : '—'}</td>
                      <td className="td"><Pill status={r.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Pagination meta={meta} />
        </div>
      )}
    </Async>
  );
}
