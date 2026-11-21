import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useHeader } from '../components/Layout.jsx';
import { Async, Card, EmptyRow, Pagination, Pill, useFilters } from '../components/ui.jsx';
import { useApi } from '../lib/hooks.js';

export default function AdminUsers() {
  useHeader('Users & Roles', 'Administration — manage accounts and access');
  const filters = useFilters();
  const q = useApi('/admin/users', Object.fromEntries(filters.params));
  const [term, setTerm] = useState(filters.get('q'));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <form onSubmit={(e) => { e.preventDefault(); filters.set({ q: term }); }} className="flex items-center gap-2">
          <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search name or email" className="input-sm w-64" />
          <button className="btn-primary py-1.5">Search</button>
          {filters.any('q') && <button type="button" onClick={() => { setTerm(''); filters.clear(); }} className="text-xs font-medium text-slate-500 hover:underline">Clear</button>}
        </form>
        <Link to="/admin/users/new" className="btn-signal">Add user</Link>
      </div>

      <Async q={q}>
        {({ data, meta }) => (
          <>
            <Card flush>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-edge text-left text-[11px] uppercase tracking-wide text-slate-400">
                      <th className="th">Name</th><th className="th">Email</th><th className="th">Mobile</th><th className="th">Roles</th><th className="th">Status</th><th className="th text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.length === 0 && <EmptyRow cols={6}>No users found.</EmptyRow>}
                    {data.map((u) => (
                      <tr key={u.id} className="border-b border-edge last:border-0 hover:bg-canvas">
                        <td className="td font-medium text-ink">{u.name}</td>
                        <td className="td text-slate-600">{u.email}</td>
                        <td className="td text-slate-600">{u.mobile ?? '—'}</td>
                        <td className="td">
                          <div className="flex flex-wrap gap-1">
                            {u.roles.map((r) => <span key={r.id} className="rounded-full bg-canvas px-2 py-0.5 text-[11px] font-medium text-rail ring-1 ring-edge">{r.name}</span>)}
                          </div>
                        </td>
                        <td className="td">{u.is_active ? <Pill status="active">Active</Pill> : <Pill status="inactive">Inactive</Pill>}</td>
                        <td className="td text-right"><Link to={`/admin/users/${u.id}/edit`} className="btn-ghost btn-xs">Edit</Link></td>
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
