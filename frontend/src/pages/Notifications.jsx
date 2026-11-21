import { useHeader } from '../components/Layout.jsx';
import { Async, Card, Icon, Pagination, Pill, useFilters } from '../components/ui.jsx';
import { fmtDateTime, titleCase } from '../lib/format.js';
import { useApi } from '../lib/hooks.js';

export default function Notifications() {
  useHeader('Notifications', 'Module 12 — alerts across email, SMS and WhatsApp');
  const filters = useFilters();
  const q = useApi('/notifications', Object.fromEntries(filters.params));

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <select value={filters.get('channel')} onChange={(e) => filters.set({ channel: e.target.value })} className="input-sm">
          <option value="">All channels</option>
          {['email', 'sms', 'whatsapp'].map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}
        </select>
        {filters.any('channel') && <button onClick={filters.clear} className="text-xs font-medium text-slate-500 hover:underline">Clear</button>}
      </div>
      <Async q={q}>
        {({ data, meta, is_admin: isAdmin }) => (
          <>
            <Card flush>
              {data.length === 0 ? <p className="px-5 py-10 text-center text-sm text-slate-400">No notifications.</p> : (
                <ul className="divide-y divide-edge">
                  {data.map((n) => (
                    <li key={n.id} className="flex items-start gap-3 px-5 py-4">
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-canvas text-rail ring-1 ring-edge"><Icon name="bell" className="h-4 w-4" /></span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-ink">{n.title ?? titleCase(n.event)}</p>
                          <Pill status="neutral">{titleCase(n.channel)}</Pill>
                          {isAdmin && <span className="text-[11px] text-slate-400">→ {n.user_name}</span>}
                        </div>
                        <p className="mt-0.5 text-sm text-slate-600">{n.message}</p>
                        <p className="mt-1 text-[11px] text-slate-400">{fmtDateTime(n.sent_at ?? n.created_at)} · {titleCase(n.status ?? 'queued')}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Pagination meta={meta} />
          </>
        )}
      </Async>
    </div>
  );
}
