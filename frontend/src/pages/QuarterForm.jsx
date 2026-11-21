import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useHeader } from '../components/Layout.jsx';
import { Async, Card, ErrorBanner, Required } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { QUARTER_STATUSES, QUARTER_TYPES, quarterTypeLabel } from '../lib/constants.js';
import { titleCase } from '../lib/format.js';
import { useAction, useApi } from '../lib/hooks.js';

const EMPTY = { quarter_number: '', quarter_type: 'I', colony_name: '', address: '', railway_zone: '', division: '', station: '', block: '', floor: '', status: 'vacant' };

export default function QuarterForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  const q = useApi(`/quarters/${id}`, undefined, { enabled: editing });
  const navigate = useNavigate();
  const save = useAction();
  const [f, setF] = useState(EMPTY);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  useHeader(editing ? `Edit Quarter ${q.data?.quarter.quarter_number ?? ''}` : 'Add Quarter', 'Module 2 — quarter master record');

  useEffect(() => {
    if (q.data) setF(Object.fromEntries(Object.keys(EMPTY).map((k) => [k, q.data.quarter[k] ?? EMPTY[k]])));
  }, [q.data]);

  const submit = async (e) => {
    e.preventDefault();
    const res = await save.run(() => (editing ? api.put(`/quarters/${id}`, f) : api.post('/quarters', f)));
    if (res) navigate(`/quarters/${editing ? id : res.id}`, { state: { flash: res.message } });
  };

  const form = (
    <form onSubmit={submit} className="mx-auto max-w-3xl">
      <ErrorBanner error={save.error} />
      <Card title="Quarter details">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div><label className="lbl">Quarter Number<Required /></label><input className="input mono" required value={f.quarter_number} onChange={set('quarter_number')} /></div>
          <div>
            <label className="lbl">Quarter Type<Required /></label>
            <select className="input" required value={f.quarter_type} onChange={set('quarter_type')}>{QUARTER_TYPES.map((t) => <option key={t} value={t}>{quarterTypeLabel(t)}</option>)}</select>
          </div>
          <div><label className="lbl">Colony Name</label><input className="input" value={f.colony_name} onChange={set('colony_name')} /></div>
          <div>
            <label className="lbl">Status<Required /></label>
            <select className="input" required value={f.status} onChange={set('status')}>{QUARTER_STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</select>
          </div>
          <div className="sm:col-span-2"><label className="lbl">Address</label><input className="input" value={f.address} onChange={set('address')} /></div>
          <div><label className="lbl">Railway Zone</label><input className="input" value={f.railway_zone} onChange={set('railway_zone')} /></div>
          <div><label className="lbl">Division</label><input className="input" value={f.division} onChange={set('division')} /></div>
          <div><label className="lbl">Station</label><input className="input" value={f.station} onChange={set('station')} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="lbl">Block</label><input className="input" value={f.block} onChange={set('block')} /></div>
            <div><label className="lbl">Floor</label><input className="input" value={f.floor} onChange={set('floor')} /></div>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2 border-t border-edge pt-4">
          <Link to={editing ? `/quarters/${id}` : '/quarters'} className="btn-ghost">Cancel</Link>
          <button className="btn-signal px-6" disabled={save.busy}>{editing ? 'Save changes' : 'Create quarter'}</button>
        </div>
      </Card>
    </form>
  );

  return editing ? <Async q={q}>{() => form}</Async> : form;
}
