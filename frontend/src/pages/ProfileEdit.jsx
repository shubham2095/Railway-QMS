import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useHeader } from '../components/Layout.jsx';
import { Async, Card, ErrorBanner, Required } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { CATEGORIES, SERVICE_TYPES } from '../lib/constants.js';
import { useAction, useApi } from '../lib/hooks.js';

const EMPTY = {
  employee_id: '', mobile: '', designation: '', department: '', station: '', division: '', railway_zone: '',
  category: 'GENERAL', service_type: 'non_essential', grade_pay: '', pay_level: '', date_of_joining: '', retirement_date: '',
};

export default function ProfileEdit() {
  useHeader('Edit Profile', 'Update your service particulars');
  const q = useApi('/profile');
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const save = useAction();
  const [f, setF] = useState(EMPTY);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  useEffect(() => {
    if (!q.data) return;
    const { profile: p, user } = q.data;
    setF({ ...EMPTY, ...Object.fromEntries(Object.entries(p ?? {}).filter(([k]) => k in EMPTY).map(([k, v]) => [k, v ?? ''])), mobile: user.mobile ?? '' });
  }, [q.data]);

  const submit = async (e) => {
    e.preventDefault();
    const ok = await save.run(() => api.put('/profile', f));
    if (ok) {
      await refresh();
      navigate('/profile', { state: { flash: 'Profile saved.' } });
    }
  };

  return (
    <Async q={q}>
      {() => (
        <form onSubmit={submit} className="mx-auto max-w-3xl">
          <ErrorBanner error={save.error} />
          <Card title="Employee profile" subtitle="Module 1 — fields used by the eligibility & priority engine">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div><label className="lbl">Employee ID<Required /></label><input className="input mono" required value={f.employee_id} onChange={set('employee_id')} /></div>
              <div><label className="lbl">Mobile</label><input className="input" value={f.mobile} onChange={set('mobile')} /></div>
              <div><label className="lbl">Designation</label><input className="input" value={f.designation} onChange={set('designation')} /></div>
              <div><label className="lbl">Department</label><input className="input" value={f.department} onChange={set('department')} /></div>
              <div><label className="lbl">Station</label><input className="input" value={f.station} onChange={set('station')} /></div>
              <div><label className="lbl">Division</label><input className="input" value={f.division} onChange={set('division')} /></div>
              <div><label className="lbl">Railway Zone</label><input className="input" value={f.railway_zone} onChange={set('railway_zone')} /></div>
              <div>
                <label className="lbl">Category<Required /></label>
                <select className="input" required value={f.category} onChange={set('category')}>
                  {Object.entries(CATEGORIES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="lbl">Service Type<Required /></label>
                <select className="input" required value={f.service_type} onChange={set('service_type')}>
                  {Object.entries(SERVICE_TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div><label className="lbl">Grade Pay</label><input type="number" min="0" className="input" value={f.grade_pay} onChange={set('grade_pay')} /></div>
              <div><label className="lbl">Pay Level</label><input className="input" value={f.pay_level} onChange={set('pay_level')} /></div>
              <div><label className="lbl">Date of Joining</label><input type="date" className="input" value={f.date_of_joining} onChange={set('date_of_joining')} /></div>
              <div><label className="lbl">Retirement Date</label><input type="date" className="input" value={f.retirement_date} onChange={set('retirement_date')} /></div>
            </div>
            <div className="mt-5 flex justify-end gap-2 border-t border-edge pt-4">
              <Link to="/profile" className="btn-ghost">Cancel</Link>
              <button className="btn-signal px-6" disabled={save.busy}>Save profile</button>
            </div>
          </Card>
        </form>
      )}
    </Async>
  );
}
