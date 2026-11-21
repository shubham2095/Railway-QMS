import { Link, useSearchParams } from 'react-router-dom';
import { titleCase } from '../lib/format.js';

// ---------------------------------------------------------------- icons
const ICONS = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h6"/>',
  key: '<circle cx="7.5" cy="15.5" r="3.5"/><path d="M10 13l9-9M16 5l2 2M14 7l2 2"/>',
  exit: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>',
  seal: '<circle cx="12" cy="9" r="6"/><path d="M9 14l-1 7 4-2 4 2-1-7"/>',
  bell: '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  building: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 8h.01M15 8h.01M9 12h.01M15 12h.01M9 16h6"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 14l3-3 3 3 5-6"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20a7 7 0 0 1 14 0"/><path d="M16 5a3.5 3.5 0 0 1 0 7M22 20a7 7 0 0 0-5-6.7"/>',
  shield: '<path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z"/><path d="M9 12l2 2 4-4"/>',
  dot: '<circle cx="12" cy="12" r="3"/>',
  check: '<path d="M5 13l4 4L19 7"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
};

export function Icon({ name = 'dot', className = 'h-5 w-5', strokeWidth = 1.8 }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      viewBox="0 0 24 24"
      dangerouslySetInnerHTML={{ __html: ICONS[name] ?? ICONS.dot }}
    />
  );
}

// ---------------------------------------------------------------- card / stat / pill
export function Card({ title, subtitle, actions, flush = false, className = '', children }) {
  return (
    <section className={`rounded-xl border border-edge bg-paper shadow-sm ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 border-b border-edge px-5 py-3.5">
          <div>
            {title && <h2 className="font-display text-sm font-semibold text-ink">{title}</h2>}
            {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={flush ? '' : 'p-5'}>{children}</div>
    </section>
  );
}

const BAR = { rail: 'bg-rail', signal: 'bg-signal', emerald: 'bg-emerald-500', amber: 'bg-amber-500', sky: 'bg-sky-500', rose: 'bg-rose-500' };
export function Stat({ label, value, tone = 'rail', hint }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-edge bg-paper p-4 shadow-sm">
      <span className={`absolute inset-y-0 left-0 w-1 ${BAR[tone] ?? BAR.rail}`} />
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold text-ink">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

const TONES = {
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  amber: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  rose: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  sky: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  slate: 'bg-slate-100 text-slate-600 ring-slate-500/20',
};
const toneOf = (s) => {
  if (['vacant', 'approved', 'accepted', 'eligible', 'sent', 'cleared', 'possession_taken', 'completed', 'active'].includes(s)) return 'emerald';
  if (['pending', 'submitted', 'verified', 'waitlisted', 'offered', 'in_clearance', 'notice', 'queued', 'vacation_pending', 'reserved', 'expiring'].includes(s)) return 'amber';
  if (['rejected', 'ineligible', 'failed', 'overstaying', 'withdrawn', 'inactive', 'changes_requested'].includes(s)) return 'rose';
  if (['occupied', 'allotted', 'retained'].includes(s)) return 'sky';
  return 'slate';
};
export function Pill({ status, children, className = '' }) {
  const s = String(status ?? '').toLowerCase();
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[toneOf(s)]} ${className}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {children ?? titleCase(s)}
    </span>
  );
}

const VERIFICATION_LABELS = { pending: 'Awaiting verification', verified: 'Verified', changes_requested: 'Changes requested' };
/** Clerk verification state of an employee profile. */
export const VerificationPill = ({ status }) => <Pill status={status}>{VERIFICATION_LABELS[status] ?? status}</Pill>;

// ---------------------------------------------------------------- feedback
export function Spinner({ className = 'h-5 w-5' }) {
  return (
    <svg className={`animate-spin text-rail ${className}`} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity=".2" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export const Loading = () => (
  <div className="flex items-center justify-center py-20"><Spinner className="h-7 w-7" /></div>
);

export function ErrorBanner({ error }) {
  if (!error) return null;
  const messages = error.errors ? Object.values(error.errors).flat() : [error.message];
  return (
    <div className="mb-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">
      <p className="font-semibold">Please review the following:</p>
      <ul className="mt-1 list-disc pl-5">
        {[...new Set(messages)].map((m, i) => <li key={i}>{m}</li>)}
      </ul>
    </div>
  );
}

/** Renders loading / error / content for a useApi() result. */
export function Async({ q, children }) {
  if (q.loading && !q.data) return <Loading />;
  if (q.error) {
    const forbidden = q.error.status === 403;
    return (
      <Card>
        <div className="py-8 text-center">
          <h3 className="font-display text-base font-semibold text-ink">
            {forbidden ? 'Access denied' : q.error.status === 404 ? 'Not found' : 'Something went wrong'}
          </h3>
          <p className="mt-1 text-sm text-slate-500">{q.error.message}</p>
          <Link to="/dashboard" className="btn-primary mt-4 inline-block">Back to dashboard</Link>
        </div>
      </Card>
    );
  }
  return q.data ? children(q.data) : null;
}

// ---------------------------------------------------------------- tables
export const EmptyRow = ({ cols, children }) => (
  <tr><td colSpan={cols} className="px-5 py-10 text-center text-sm text-slate-400">{children}</td></tr>
);

export function Pagination({ meta }) {
  const [params, setParams] = useSearchParams();
  if (!meta || meta.last_page <= 1) return null;
  const go = (page) => {
    const next = new URLSearchParams(params);
    next.set('page', page);
    setParams(next);
    window.scrollTo({ top: 0 });
  };
  const from = (meta.page - 1) * meta.per_page + 1;
  const to = Math.min(meta.page * meta.per_page, meta.total);
  return (
    <div className="flex items-center justify-between text-sm text-slate-500">
      <span>Showing {from}–{to} of {meta.total}</span>
      <div className="flex items-center gap-1">
        <button className="btn-ghost btn-xs" disabled={meta.page <= 1} onClick={() => go(meta.page - 1)}>Previous</button>
        <span className="px-2 text-xs">Page {meta.page} / {meta.last_page}</span>
        <button className="btn-ghost btn-xs" disabled={meta.page >= meta.last_page} onClick={() => go(meta.page + 1)}>Next</button>
      </div>
    </div>
  );
}

/** Definition-list cell used on detail pages. */
export const Dl = ({ label, children, className = '', mono = false }) => (
  <div className={className}>
    <dt className="text-[11px] uppercase tracking-wide text-slate-400">{label}</dt>
    <dd className={`mt-0.5 text-ink ${mono ? 'mono' : ''}`}>{children ?? '—'}</dd>
  </div>
);

export const Required = () => <span className="text-signal"> *</span>;

/** Filter-bar helper: reads/writes the URL query string, resetting the page. */
export function useFilters() {
  const [params, setParams] = useSearchParams();
  const get = (k) => params.get(k) ?? '';
  const set = (patch) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) (v === '' || v == null ? next.delete(k) : next.set(k, v));
    next.delete('page');
    setParams(next);
  };
  const clear = () => setParams(new URLSearchParams());
  return { params, get, set, clear, any: (...keys) => keys.some((k) => params.get(k)) };
}
