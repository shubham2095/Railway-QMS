import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useHeader } from '../components/Layout.jsx';
import ColonyPreferences, { colonyProblem } from '../components/ColonyPreferences.jsx';
import { Card, ErrorBanner, Required } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { CATEGORIES, DOC_CATEGORIES, QUARTER_TYPES, SERVICE_TYPES, quarterTypeLabel } from '../lib/constants.js';
import { useAction } from '../lib/hooks.js';

export default function ApplicationForm() {
  useHeader('New Application', 'Module 3 — apply for a quarter allotment');
  const { user } = useAuth();
  const navigate = useNavigate();
  const submit = useAction();
  const profile = user.profile;

  const [f, setF] = useState({
    preferred_quarter_type: 'I', station: profile?.station ?? '', division: profile?.division ?? '',
    family_size: 1, medical_ground: false, special_grounds: '',
  });
  const [colonies, setColonies] = useState(['', '', '']); // up to 3, in order of priority
  const [localError, setLocalError] = useState('');
  const [docs, setDocs] = useState([{ category: 'service_certificate', file: null }]);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const setDoc = (i, patch) => setDocs((d) => d.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  if (!user.profile_complete) return <Navigate to="/profile/edit" replace state={{ flash: 'Please complete your profile before applying.' }} />;

  const onSubmit = async (e) => {
    e.preventDefault();
    const problem = colonyProblem(colonies);
    if (problem) {
      setLocalError(problem);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setLocalError('');
    const fd = new FormData();
    Object.entries(f).forEach(([k, v]) => fd.append(k, typeof v === 'boolean' ? String(v) : v));
    colonies.forEach((c, i) => c.trim() && fd.append(`colony_${i + 1}`, c.trim()));
    docs.filter((d) => d.file).forEach((d) => {
      fd.append('document_categories', d.category);
      fd.append('documents', d.file);
    });
    const res = await submit.run(() => api.upload('/applications', fd));
    if (res) navigate(`/applications/${res.id}`, { state: { flash: res.message } });
  };

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-3xl space-y-6">
      <ErrorBanner error={submit.error ?? (localError ? { message: localError } : null)} />
      <Card title="Application details">
        <div className="mb-4 rounded-lg bg-canvas px-4 py-3 text-xs text-rail">
          Applying as <span className="font-semibold">{user.name}</span> (<span className="mono">{profile.employee_id}</span>) ·{' '}
          {CATEGORIES[profile.category]} · {SERVICE_TYPES[profile.service_type]} · These drive your eligibility &amp; priority score.
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="lbl">Preferred Quarter Type<Required /></label>
            <select className="input" required value={f.preferred_quarter_type} onChange={set('preferred_quarter_type')}>
              {QUARTER_TYPES.map((t) => <option key={t} value={t}>{quarterTypeLabel(t)}</option>)}
            </select>
          </div>
          <div><label className="lbl">Station</label><input className="input" value={f.station} onChange={set('station')} /></div>
          <div><label className="lbl">Division</label><input className="input" value={f.division} onChange={set('division')} /></div>
          <div><label className="lbl">Family Size</label><input type="number" min="1" max="30" className="input" value={f.family_size} onChange={set('family_size')} /></div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm text-rail">
              <input type="checkbox" checked={f.medical_ground} onChange={set('medical_ground')} className="rounded border-edge text-rail focus:ring-rail" /> Applying on medical grounds
            </label>
          </div>
          <ColonyPreferences value={colonies} onChange={setColonies} quarterType={f.preferred_quarter_type} station={f.station} />
          <div className="sm:col-span-2"><label className="lbl">Special Grounds / Remarks</label><textarea rows="3" className="input" value={f.special_grounds} onChange={set('special_grounds')} /></div>
        </div>
      </Card>

      <Card title="Supporting documents" subtitle="Module 15 — PDF/JPG/PNG up to 5 MB each">
        <div className="space-y-3">
          {docs.map((d, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <select className="input-sm" value={d.category} onChange={(e) => setDoc(i, { category: e.target.value })}>
                {Object.entries(DOC_CATEGORIES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setDoc(i, { file: e.target.files[0] ?? null })}
                className="w-full min-w-0 text-sm text-slate-600 sm:w-auto sm:flex-1 file:mr-3 file:rounded-md file:border-0 file:bg-rail file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-ink" />
              {docs.length > 1 && <button type="button" onClick={() => setDocs((x) => x.filter((_, j) => j !== i))} className="text-xs font-medium text-signal hover:underline">Remove</button>}
            </div>
          ))}
          <button type="button" onClick={() => setDocs((x) => [...x, { category: 'supporting_document', file: null }])} className="btn-ghost btn-xs">+ Add document</button>
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <Link to="/applications" className="btn-ghost">Cancel</Link>
        <button className="btn-signal px-6" disabled={submit.busy}>{submit.busy ? 'Submitting…' : 'Submit application'}</button>
      </div>
    </form>
  );
}
