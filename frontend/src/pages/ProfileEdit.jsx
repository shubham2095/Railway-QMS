import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useHeader } from '../components/Layout.jsx';
import { Async, Card, ErrorBanner, Required } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { CATEGORIES, SERVICE_TYPES } from '../lib/constants.js';
import { todayIso } from '../lib/format.js';
import { useAction, useApi } from '../lib/hooks.js';

// Name, email and phone come from signup (pre-filled); the rest are personal and service particulars.
// Every field is required - keep in sync with REQUIRED_PROFILE_FIELDS in backend/src/services/profile.js.
const EMPTY = {
  name: '', email: '', mobile: '', father_name: '', date_of_birth: '', current_address: '',
  employee_id: '', pf_number: '', designation: '', department: '', station: '', division: '', railway_zone: '',
  category: '', service_type: '', grade_pay: '', pay_level: '', date_of_joining: '', retirement_date: '',
};
// stored on the employee profile (name / email / mobile live on the login account)
const PROFILE_FIELDS = Object.keys(EMPTY).filter((k) => !['name', 'email', 'mobile'].includes(k));

function Text({ label, name, f, set, mono = false, ...rest }) {
  return (
    <div>
      <label className="lbl" htmlFor={name}>{label}<Required /></label>
      <input id={name} name={name} required className={`input ${mono ? 'mono' : ''}`} value={f[name]} onChange={set(name)} {...rest} />
    </div>
  );
}

export default function ProfileEdit() {
  const q = useApi('/profile');
  const navigate = useNavigate();
  const { refresh, user: me } = useAuth();
  const firstTime = !me.profile_complete; // finishing the profile for the first time -> unlocks the app
  useHeader(firstTime ? 'Complete your profile' : 'Edit Profile', firstTime ? 'Step 1 — required before you can use the system' : 'Update your details');
  const save = useAction();
  const [f, setF] = useState(EMPTY);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  useEffect(() => {
    if (!q.data) return;
    const { profile: p, user } = q.data;
    // signup details (name, email, phone) are pre-filled from the account; service fields from the saved profile
    const saved = Object.fromEntries(PROFILE_FIELDS.map((k) => [k, p?.[k] ?? '']));
    setF({ ...EMPTY, ...saved, name: user.name ?? '', email: user.email ?? '', mobile: user.mobile ?? '' });
  }, [q.data]);

  const submit = async (e) => {
    e.preventDefault();
    const { email: _email, ...payload } = f; // the email (login ID) is not editable
    const ok = await save.run(() => api.put('/profile', payload));
    if (ok) {
      await refresh();
      navigate(firstTime ? '/dashboard' : '/profile', {
        state: { flash: firstTime ? 'Profile completed. You can now apply for a quarter.' : 'Profile saved.' },
      });
    }
  };

  return (
    <Async q={q}>
      {() => (
        <form onSubmit={submit} className="mx-auto max-w-3xl space-y-6">
          <ErrorBanner error={save.error} />
          {firstTime && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <p className="font-semibold">Please complete your profile to continue.</p>
              <p className="mt-0.5">Fields marked <span className="text-signal">*</span> are required. The rest of the system opens as soon as you save.</p>
            </div>
          )}

          <Card title="Personal details" subtitle="Name, email and phone are filled in from your sign-up">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Text label="Full name" name="name" f={f} set={set} maxLength={120} autoComplete="name" />
              <div>
                <label className="lbl" htmlFor="email">Email ID</label>
                <input id="email" name="email" className="input cursor-not-allowed bg-canvas text-slate-500" value={f.email} readOnly disabled />
                <p className="mt-1 text-[11px] text-slate-400">This is your login ID and cannot be changed here.</p>
              </div>
              <Text label="Phone number" name="mobile" f={f} set={set} type="tel" maxLength={25} autoComplete="tel" />
              <Text label="Father's Name" name="father_name" f={f} set={set} maxLength={120} />
              <Text label="Date of Birth" name="date_of_birth" f={f} set={set} type="date" max={todayIso()} autoComplete="bday" />
              <div className="sm:col-span-2">
                <label className="lbl" htmlFor="current_address">Current Address<Required /></label>
                <textarea id="current_address" name="current_address" required rows="3" maxLength={500} className="input"
                  placeholder="House / quarter no., street, city, state, PIN code" value={f.current_address} onChange={set('current_address')} />
              </div>
            </div>
          </Card>

          <Card title="Service details" subtitle="Used by the eligibility & priority engine">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Text label="Employee ID" name="employee_id" f={f} set={set} mono maxLength={50} />
              <Text label="PF Number" name="pf_number" f={f} set={set} mono maxLength={50} />
              <Text label="Designation" name="designation" f={f} set={set} maxLength={120} />
              <Text label="Department" name="department" f={f} set={set} maxLength={120} />
              <Text label="Station" name="station" f={f} set={set} maxLength={120} />
              <Text label="Division" name="division" f={f} set={set} maxLength={120} />
              <Text label="Railway Zone" name="railway_zone" f={f} set={set} maxLength={120} />
              <div>
                <label className="lbl" htmlFor="category">Category<Required /></label>
                <select id="category" name="category" required className="input" value={f.category} onChange={set('category')}>
                  <option value="" disabled>Select category…</option>
                  {Object.entries(CATEGORIES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="lbl" htmlFor="service_type">Service Type<Required /></label>
                <select id="service_type" name="service_type" required className="input" value={f.service_type} onChange={set('service_type')}>
                  <option value="" disabled>Select service type…</option>
                  {Object.entries(SERVICE_TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <Text label="Grade Pay (₹)" name="grade_pay" f={f} set={set} type="number" min="0" step="1" inputMode="numeric" />
              <Text label="Pay Level" name="pay_level" f={f} set={set} maxLength={50} placeholder="e.g. Level-6" />
              <Text label="Date of Joining" name="date_of_joining" f={f} set={set} type="date" min={f.date_of_birth || undefined} max={todayIso()} />
              <Text label="Retirement Date" name="retirement_date" f={f} set={set} type="date" min={f.date_of_joining || undefined} />
            </div>
            <div className="mt-5 flex justify-end gap-2 border-t border-edge pt-4">
              {!firstTime && <Link to="/profile" className="btn-ghost">Cancel</Link>}
              <button className="btn-signal px-6" disabled={save.busy}>{save.busy ? 'Saving…' : firstTime ? 'Save & continue' : 'Save profile'}</button>
            </div>
          </Card>
        </form>
      )}
    </Async>
  );
}
