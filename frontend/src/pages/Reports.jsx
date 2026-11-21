import { useHeader } from '../components/Layout.jsx';
import { Async, Card } from '../components/ui.jsx';
import { STATUS_TONES, quarterTypeLabel } from '../lib/constants.js';
import { titleCase } from '../lib/format.js';
import { useApi } from '../lib/hooks.js';

function Bars({ map }) {
  const entries = Object.entries(map ?? {});
  if (entries.length === 0) return <p className="text-sm text-slate-400">No data.</p>;
  const max = Math.max(...entries.map(([, c]) => c), 1);
  return (
    <div className="space-y-3">
      {entries.map(([status, count]) => (
        <div key={status}>
          <div className="mb-1 flex items-center justify-between text-xs"><span className="text-rail">{titleCase(status)}</span><span className="text-slate-400">{count}</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-canvas"><div className="h-full rounded-full bg-rail" style={{ width: `${(count / max) * 100}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

function Stacked({ groups, label }) {
  const entries = Object.entries(groups ?? {});
  if (entries.length === 0) return <p className="text-sm text-slate-400">No data.</p>;
  return (
    <div className="space-y-3">
      {entries.map(([key, rows]) => {
        const total = rows.reduce((a, r) => a + r.total, 0);
        return (
          <div key={key}>
            <div className="mb-1 flex items-center justify-between text-xs"><span className="font-semibold text-ink">{label(key)}</span><span className="text-slate-400">{total} quarter(s)</span></div>
            <div className="flex h-3 overflow-hidden rounded-full bg-canvas">
              {rows.map((r) => <div key={r.status} className={STATUS_TONES.quarter[r.status] ?? 'bg-slate-300'} style={{ width: `${total ? Math.round((r.total / total) * 100) : 0}%` }} title={`${r.status}: ${r.total}`} />)}
            </div>
            <p className="mt-1 text-[11px] text-slate-400">{rows.map((r) => `${titleCase(r.status)} ${r.total}`).join(' · ')}</p>
          </div>
        );
      })}
    </div>
  );
}

export default function Reports() {
  useHeader('Reports & MIS', 'Module 13 — management information snapshots');
  const q = useApi('/reports');
  return (
    <Async q={q}>
      {(d) => (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Quarters — type-wise occupancy" subtitle="Module 2 / 13"><Stacked groups={d.type_wise} label={quarterTypeLabel} /></Card>
          <Card title="Quarters — station-wise" subtitle="Module 2 / 13"><Stacked groups={d.station_wise} label={(s) => s || '—'} /></Card>
          <Card title="Applications by status" subtitle="Module 3 / 13"><Bars map={d.application_status} /></Card>
          <Card title="Allotments by status" subtitle="Module 6 / 13"><Bars map={d.allotment_status} /></Card>
          <Card title="Vacations by status" subtitle="Module 8 / 13"><Bars map={d.vacation_status} /></Card>
          <Card title="Retirement / retention" subtitle="Module 10 / 13"><Bars map={d.retirement_status} /></Card>
        </div>
      )}
    </Async>
  );
}
