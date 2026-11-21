import { CERTIFICATE_LABELS } from '../lib/constants.js';
import { titleCase } from '../lib/format.js';
import { Icon } from './ui.jsx';

export const certLabel = (t) => CERTIFICATE_LABELS[t] ?? titleCase(t);

/** View (new tab) + Download buttons; the browser sends the session cookie. */
export function CertActions({ id }) {
  return (
    <div className="flex gap-2">
      <a href={`/api/certificates/${id}/view`} target="_blank" rel="noreferrer" className="btn-ghost btn-xs">View</a>
      <a href={`/api/certificates/${id}/download`} className="btn-xs bg-rail text-white hover:bg-ink">Download</a>
    </div>
  );
}

export default function CertificateList({ certificates }) {
  return (
    <div className="divide-y divide-edge">
      {certificates.map((c) => (
        <div key={c.id} className="flex items-center justify-between py-2.5 text-sm">
          <div className="flex items-center gap-3">
            <Icon name="seal" className="h-4 w-4 text-slate-400" />
            <div>
              <p className="font-medium text-ink">{certLabel(c.type)}</p>
              <p className="mono text-[11px] text-slate-400">{c.number}</p>
            </div>
          </div>
          <CertActions id={c.id} />
        </div>
      ))}
    </div>
  );
}
