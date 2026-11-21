import { CertActions, certLabel } from '../components/CertificateList.jsx';
import { useHeader } from '../components/Layout.jsx';
import { Async, Card, EmptyRow, Pagination, Pill, useFilters } from '../components/ui.jsx';
import { fmtDate } from '../lib/format.js';
import { useApi } from '../lib/hooks.js';

export default function Certificates() {
  useHeader('Certificates', 'Module 11 — NOCs, clearances and orders');
  const filters = useFilters();
  const q = useApi('/certificates', Object.fromEntries(filters.params));

  return (
    <div className="space-y-5">
      {q.data && (
        <div className="flex items-center gap-2">
          <select value={filters.get('type')} onChange={(e) => filters.set({ type: e.target.value })} className="input-sm">
            <option value="">All types</option>
            {q.data.types.map((t) => <option key={t} value={t}>{certLabel(t)}</option>)}
          </select>
          {filters.any('type') && <button onClick={filters.clear} className="text-xs font-medium text-slate-500 hover:underline">Clear</button>}
        </div>
      )}
      <Async q={q}>
        {({ data, meta }) => (
          <>
            <Card flush>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-edge text-left text-[11px] uppercase tracking-wide text-slate-400">
                      <th className="th">Number</th><th className="th">Type</th><th className="th">Issued</th><th className="th">Issued By</th><th className="th">Signed</th><th className="th text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.length === 0 && <EmptyRow cols={6}>No certificates found.</EmptyRow>}
                    {data.map((c) => (
                      <tr key={c.id} className="border-b border-edge last:border-0 hover:bg-canvas">
                        <td className="td"><span className="mono font-medium text-ink">{c.number}</span></td>
                        <td className="td text-slate-600">{certLabel(c.type)}</td>
                        <td className="td text-slate-600">{fmtDate(c.issued_at)}</td>
                        <td className="td text-slate-600">{c.issuer_name ?? '—'}</td>
                        <td className="td">{c.is_signed ? <Pill status="approved">Signed</Pill> : <span className="text-slate-400">Draft</span>}</td>
                        <td className="td"><div className="flex justify-end"><CertActions id={c.id} /></div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
            <Pagination meta={meta} />
          </>
        )}
      </Async>
    </div>
  );
}
