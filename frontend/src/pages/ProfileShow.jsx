import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useHeader } from '../components/Layout.jsx';
import { Async, Card, ErrorBanner, Icon, Pill, Required } from '../components/ui.jsx';
import { useAuth } from '../lib/auth.jsx';
import { useFlash } from '../lib/flash.jsx';
import { api } from '../lib/api.js';
import { CATEGORIES, SERVICE_TYPES } from '../lib/constants.js';
import { fmtDate, inr } from '../lib/format.js';
import { useAction, useApi } from '../lib/hooks.js';

export default function ProfileShow() {
  useHeader('My Profile', 'Employee details and family particulars');
  const q = useApi('/profile');
  const { hasRole, user: me } = useAuth();
  const flash = useFlash();
  const add = useAction();
  const [form, setForm] = useState({ name: '', relation: '', date_of_birth: '', is_dependent: true });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const addMember = async (e) => {
    e.preventDefault();
    const ok = await add.run(() => api.post('/profile/family', form));
    if (ok) {
      setForm({ name: '', relation: '', date_of_birth: '', is_dependent: true });
      flash.success('Family member added.');
      q.reload();
    }
  };
  const remove = async (id) => {
    if (!window.confirm('Remove this family member?')) return;
    await api.del(`/profile/family/${id}`);
    flash.success('Family member removed.');
    q.reload();
  };

  return (
    <Async q={q}>
      {({ user, profile, family_members: family }) => {
        if (!profile && !hasRole('employee', 'admin')) {
          // Estate-office staff (clerk / admin / super admin) have an account, not an employee profile.
          return (
            <Card title="My account">
              <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
                <div><dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Name</dt><dd className="mt-0.5 text-ink">{user.name}</dd></div>
                <div><dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Email ID</dt><dd className="mt-0.5 text-ink">{user.email}</dd></div>
                <div><dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Phone number</dt><dd className="mt-0.5 text-ink">{user.mobile || '—'}</dd></div>
                <div><dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Role</dt><dd className="mt-0.5 text-ink">{(me.roles ?? []).map((r) => r.replace(/_/g, ' ')).join(', ')}</dd></div>
              </dl>
              <p className="mt-4 text-xs text-slate-400">An employee profile is only needed for employees who apply for a quarter.</p>
            </Card>
          );
        }
        if (!profile) {
          return (
            <Card>
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600 ring-1 ring-amber-200"><Icon name="user" className="h-6 w-6" /></div>
                <div>
                  <h3 className="font-display text-base font-semibold text-ink">Your profile is incomplete</h3>
                  <p className="mt-1 text-sm text-slate-500">Add your service particulars before applying for a quarter.</p>
                </div>
                <Link to="/profile/edit" className="btn-primary mt-2">Complete profile</Link>
              </div>
            </Card>
          );
        }
        const rows = [
          ['Employee ID', <span className="mono">{profile.employee_id}</span>],
          ['PF Number', profile.pf_number ? <span className="mono">{profile.pf_number}</span> : '—'],
          ['Name', user.name],
          ["Father's Name", profile.father_name || '—'],
          ['Date of Birth', fmtDate(profile.date_of_birth)],
          ['Phone number', user.mobile || '—'],
          ['Email ID', user.email],
          ['Current Address', profile.current_address || '—', 'col-span-2 sm:col-span-3 whitespace-pre-line'],
          ['Designation', profile.designation || '—'],
          ['Department', profile.department || '—'],
          ['Station', profile.station || '—'],
          ['Division', profile.division || '—'],
          ['Railway Zone', profile.railway_zone || '—'],
          ['Category', CATEGORIES[profile.category] ?? '—'],
          ['Service Type', SERVICE_TYPES[profile.service_type] ?? '—'],
          ['Grade Pay', profile.grade_pay ? inr(profile.grade_pay) : '—'],
          ['Pay Level', profile.pay_level || '—'],
          ['Date of Joining', fmtDate(profile.date_of_joining)],
          ['Retirement Date', fmtDate(profile.retirement_date)],
          ['Service Years', `${profile.service_years} yr`],
        ];
        return (
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <Card title="Service particulars" subtitle="Module 1 — Employee profile" actions={<Link to="/profile/edit" className="btn-ghost btn-xs">Edit</Link>}>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
                  {rows.map(([label, value, cls = '']) => (
                    <div key={label} className={cls}>
                      <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</dt>
                      <dd className="mt-0.5 break-words text-ink">{value}</dd>
                    </div>
                  ))}
                </dl>
                {profile.has_active_allotment && (
                  <div className="mt-4 inline-flex items-center gap-2 rounded-lg bg-sky-50 px-3 py-1.5 text-xs text-sky-700 ring-1 ring-sky-200">
                    <Icon name="key" className="h-4 w-4" /> Currently holds an active quarter allotment
                  </div>
                )}
              </Card>

              <Card title="Family details" subtitle="Module 1 — dependants recorded for allotment">
                {family.length === 0 ? (
                  <p className="text-sm text-slate-400">No family members recorded.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
                          <th className="pb-2 font-medium">Name</th><th className="pb-2 font-medium">Relation</th>
                          <th className="pb-2 font-medium">Date of Birth</th><th className="pb-2 font-medium">Dependent</th><th className="pb-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {family.map((m) => (
                          <tr key={m.id} className="border-t border-edge">
                            <td className="py-2.5 font-medium text-ink">{m.name}</td>
                            <td className="py-2.5 text-slate-600">{m.relation}</td>
                            <td className="py-2.5 text-slate-600">{fmtDate(m.date_of_birth)}</td>
                            <td className="py-2.5">{m.is_dependent ? <Pill status="active">Dependent</Pill> : <span className="text-slate-400">No</span>}</td>
                            <td className="py-2.5 text-right"><button onClick={() => remove(m.id)} className="text-xs font-medium text-signal hover:underline">Remove</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </div>

            <Card title="Add family member">
              <ErrorBanner error={add.error} />
              <form onSubmit={addMember} className="space-y-3">
                <div><label className="lbl">Name<Required /></label><input className="input" required value={form.name} onChange={(e) => set('name', e.target.value)} /></div>
                <div><label className="lbl">Relation<Required /></label><input className="input" required placeholder="Spouse / Son / Daughter…" value={form.relation} onChange={(e) => set('relation', e.target.value)} /></div>
                <div><label className="lbl">Date of birth</label><input type="date" className="input" value={form.date_of_birth} onChange={(e) => set('date_of_birth', e.target.value)} /></div>
                <label className="flex items-center gap-2 text-sm text-rail">
                  <input type="checkbox" checked={form.is_dependent} onChange={(e) => set('is_dependent', e.target.checked)} className="rounded border-edge text-rail focus:ring-rail" /> Dependent
                </label>
                <button className="btn-primary w-full" disabled={add.busy}>Add member</button>
              </form>
            </Card>
          </div>
        );
      }}
    </Async>
  );
}
