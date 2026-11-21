import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useHeader } from '../components/Layout.jsx';
import { Async, Card, ErrorBanner, Required } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { useAction, useApi } from '../lib/hooks.js';

// Roles in active use for now; the department roles stay available but tucked away.
const IN_USE = ['employee', 'quarter_clerk', 'admin', 'super_admin'];

function RoleOption({ r, f, toggle }) {
  return (
    <label className="flex items-center gap-2 rounded-lg border border-edge px-3 py-2 text-sm hover:bg-canvas">
      <input type="checkbox" checked={f.roles.includes(r.id)} onChange={() => toggle(r.id)} className="rounded border-edge text-rail focus:ring-rail" />
      <span className="text-ink">{r.name}</span>
    </label>
  );
}

export default function AdminUserForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  useHeader(editing ? 'Edit User' : 'Add User', 'Administration — account and role assignment');
  const rolesQ = useApi('/admin/roles');
  const userQ = useApi(`/admin/users/${id}`, undefined, { enabled: editing });
  const navigate = useNavigate();
  const save = useAction();
  const [f, setF] = useState({ name: '', email: '', mobile: '', password: '', is_active: true, roles: [] });
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const toggleRole = (rid) => setF((s) => ({ ...s, roles: s.roles.includes(rid) ? s.roles.filter((x) => x !== rid) : [...s.roles, rid] }));

  useEffect(() => {
    const u = userQ.data?.user;
    if (u) setF({ name: u.name, email: u.email, mobile: u.mobile ?? '', password: '', is_active: u.is_active, roles: u.roles.map((r) => r.id) });
  }, [userQ.data]);

  const submit = async (e) => {
    e.preventDefault();
    const res = await save.run(() => (editing ? api.put(`/admin/users/${id}`, f) : api.post('/admin/users', f)));
    if (res) navigate('/admin/users', { state: { flash: res.message } });
  };

  return (
    <Async q={rolesQ}>
      {({ roles }) => (
        <Async q={editing ? userQ : { data: {}, loading: false }}>
          {() => (
            <form onSubmit={submit} className="mx-auto grid max-w-4xl gap-6 lg:grid-cols-3">
              <div className="lg:col-span-3"><ErrorBanner error={save.error} /></div>
              <Card title="Account" className="lg:col-span-2">
                <div className="space-y-4">
                  <div><label className="lbl">Name<Required /></label><input className="input" required value={f.name} onChange={set('name')} /></div>
                  <div><label className="lbl">Email<Required /></label><input type="email" className="input" required value={f.email} onChange={set('email')} /></div>
                  <div><label className="lbl">Mobile</label><input className="input" value={f.mobile} onChange={set('mobile')} /></div>
                  <div>
                    <label className="lbl">Password{editing ? '' : <Required />}</label>
                    <input type="password" className="input" minLength={editing ? undefined : 8} required={!editing} autoComplete="new-password" value={f.password} onChange={set('password')} placeholder={editing ? 'Leave blank to keep current' : 'At least 8 characters'} />
                  </div>
                  <label className="flex items-center gap-2 text-sm text-rail">
                    <input type="checkbox" checked={f.is_active} onChange={set('is_active')} className="rounded border-edge text-rail focus:ring-rail" /> Account is active
                  </label>
                </div>
              </Card>
              <Card title="Roles">
                <div className="space-y-2">
                  {roles.filter((r) => IN_USE.includes(r.slug)).map((r) => <RoleOption key={r.id} r={r} f={f} toggle={toggleRole} />)}
                </div>
                {/* Department roles exist for the later clearance workflow but are not used yet. */}
                <details className="mt-4 text-sm" open={roles.some((r) => !IN_USE.includes(r.slug) && f.roles.includes(r.id))}>
                  <summary className="cursor-pointer text-xs font-medium text-slate-500">More roles (not in use yet)</summary>
                  <div className="mt-2 space-y-2">
                    {roles.filter((r) => !IN_USE.includes(r.slug)).map((r) => <RoleOption key={r.id} r={r} f={f} toggle={toggleRole} />)}
                  </div>
                </details>
              </Card>
              <div className="flex justify-end gap-2 lg:col-span-3">
                <Link to="/admin/users" className="btn-ghost">Cancel</Link>
                <button className="btn-signal px-6" disabled={save.busy}>{editing ? 'Save user' : 'Create user'}</button>
              </div>
            </form>
          )}
        </Async>
      )}
    </Async>
  );
}
