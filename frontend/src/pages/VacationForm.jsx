import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useHeader } from '../components/Layout.jsx';
import { Async, Card, ErrorBanner, Required } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { VACATION_TRIGGERS } from '../lib/constants.js';
import { titleCase, todayIso } from '../lib/format.js';
import { useAction, useApi } from '../lib/hooks.js';

export default function VacationForm() {
  useHeader('New Vacation Request', 'Module 8 — initiate the clearance workflow');
  const q = useApi('/vacations/options');
  const navigate = useNavigate();
  const save = useAction();
  const [f, setF] = useState({ allotment_id: '', trigger: 'transfer', requested_vacation_date: todayIso(), reason: '' });
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  useEffect(() => {
    if (q.data?.allotments[0]) setF((s) => ({ ...s, allotment_id: s.allotment_id || q.data.allotments[0].id }));
  }, [q.data]);

  const submit = async (e) => {
    e.preventDefault();
    const res = await save.run(() => api.post('/vacations', f));
    if (res) navigate(`/vacations/${res.id}`, { state: { flash: res.message } });
  };

  return (
    <Async q={q}>
      {({ allotments }) => {
        if (allotments.length === 0) {
          return <Navigate to="/vacations" replace state={{ flash: 'You have no active allotment that can be vacated.' }} />;
        }
        return (
          <form onSubmit={submit} className="mx-auto max-w-2xl">
            <ErrorBanner error={save.error} />
            <Card title="Vacation details">
              <div className="space-y-4">
                <div>
                  <label className="lbl">Quarter to vacate<Required /></label>
                  <select className="input" required value={f.allotment_id} onChange={set('allotment_id')}>
                    {allotments.map((al) => <option key={al.id} value={al.id}>{al.quarter_number} — {al.colony_name} ({al.allotment_order_no})</option>)}
                  </select>
                </div>
                <div>
                  <label className="lbl">Reason / trigger<Required /></label>
                  <select className="input" required value={f.trigger} onChange={set('trigger')}>
                    {VACATION_TRIGGERS.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}
                  </select>
                </div>
                <div><label className="lbl">Requested vacation date<Required /></label><input type="date" className="input" required value={f.requested_vacation_date} onChange={set('requested_vacation_date')} /></div>
                <div><label className="lbl">Remarks</label><textarea rows="3" className="input" value={f.reason} onChange={set('reason')} /></div>
              </div>
              <div className="mt-4 rounded-lg bg-canvas px-4 py-3 text-xs text-rail">
                On submission, a multi-level clearance will be created: Quarter Clerk inspection → Electrical → Water → Accounts → Estate Officer approval.
              </div>
              <div className="mt-5 flex justify-end gap-2 border-t border-edge pt-4">
                <Link to="/vacations" className="btn-ghost">Cancel</Link>
                <button className="btn-signal px-6" disabled={save.busy}>Start clearance</button>
              </div>
            </Card>
          </form>
        );
      }}
    </Async>
  );
}
