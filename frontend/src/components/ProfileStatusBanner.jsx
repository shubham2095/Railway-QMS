import { Link } from 'react-router-dom';
import { fmtDateTime } from '../lib/format.js';
import { Icon } from './ui.jsx';

/**
 * Tells an employee where their profile stands with the clerk.
 * `profile` carries verification_status / verification_remarks / verified_at.
 * With `onlyWhenAction`, a verified profile shows nothing (used where space matters).
 */
export default function ProfileStatusBanner({ profile, showEditLink = true, onlyWhenAction = false }) {
  if (!profile) return null;
  const status = profile.verification_status ?? profile.status;
  const remarks = profile.verification_remarks ?? profile.remarks;
  const when = profile.verified_at;

  if (status === 'verified') {
    if (onlyWhenAction) return null;
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
        <Icon name="check" className="h-4 w-4 shrink-0" strokeWidth={2.5} />
        <span>Your profile is <b>verified</b>{when ? ` (${fmtDateTime(when)})` : ''}. If you change any detail, the clerk will verify it again.</span>
      </div>
    );
  }
  if (status === 'changes_requested') {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800" role="status">
        <p className="font-semibold">The clerk has asked you to correct your profile.</p>
        {remarks && <p className="mt-1 whitespace-pre-line">“{remarks}”</p>}
        {showEditLink && <Link to="/profile/edit" className="mt-2 inline-block font-semibold underline">Update my profile</Link>}
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800" role="status">
      <p className="font-semibold">Your profile is awaiting verification.</p>
      <p className="mt-0.5">The Quarter Clerk will check your details first, and then your applications. You will get a notification when it is done.</p>
    </div>
  );
}
