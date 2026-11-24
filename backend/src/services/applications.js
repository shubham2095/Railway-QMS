import { find, first, insert, query, transaction, update } from '../db.js';
import { DomainError } from '../utils/http.js';
import { compactDate, randomUpper } from '../utils/helpers.js';
import { nowStr } from '../utils/dates.js';
import { audit, subject } from './audit.js';
import { notify } from './notifications.js';
import { evaluateEligibility } from './eligibility.js';
import { calculatePriority } from './priority.js';
import { savePreferences } from './colonyPreferences.js';
import * as waitingList from './waitingList.js';

const userOfProfile = (profileId) =>
  first(
    `SELECT u.id, u.name, u.email, u.mobile FROM employee_profiles p JOIN users u ON u.id = p.user_id WHERE p.id = ?`,
    [profileId],
  );

/** Module 3 - an employee submits an application. */
export async function submitApplication(profile, user, data) {
  // One application at a time: an employee joins the line once, not once per quarter type / colony.
  const open = await first(
    `SELECT a.reference_no, a.status FROM quarter_applications a
      WHERE a.employee_profile_id = ?
        AND (a.status IN ('submitted', 'verified', 'eligible', 'waitlisted', 'forwarded', 'approved')
             OR EXISTS (SELECT 1 FROM allotments al WHERE al.quarter_application_id = a.id AND al.status IN ('offered', 'accepted')))
      LIMIT 1`,
    [profile.id],
  );
  if (open) {
    throw new DomainError(
      `You already have an application in progress (${open.reference_no}). You can apply again only after it is rejected, withdrawn or completed.`,
      'application',
    );
  }
  const id = await insert('quarter_applications', {
    reference_no: `APP-${compactDate()}-${randomUpper(5)}`,
    employee_profile_id: profile.id,
    preferred_quarter_type: data.preferred_quarter_type,
    preferred_colony: data.colonies?.[0] ?? null, // first choice, kept on the application for quick display
    station: data.station ?? profile.station ?? null,
    division: data.division ?? profile.division ?? null,
    service_type: profile.service_type,
    category: profile.category,
    family_size: data.family_size ?? 1,
    medical_ground: data.medical_ground ? 1 : 0,
    special_grounds: data.special_grounds ?? null,
    status: 'submitted',
    applied_at: nowStr(),
  });
  await savePreferences(id, data.colonies ?? []);
  const application = await find('quarter_applications', id);

  await audit('application.submit', subject('application', id), 'Application submitted by employee');
  await notify(
    user,
    'application_submitted',
    `Your quarter application ${application.reference_no} has been received.`,
    'Application Submitted',
    ['email', 'sms'],
  );
  return application;
}

/** Quarter Clerk verifies the documents/details, then the engine runs. */
export async function verifyApplication(application, clerk) {
  await update('quarter_applications', application.id, {
    status: 'verified',
    verified_by: clerk.id,
    verified_at: nowStr(),
  });
  await runEngine(application.id);
  await audit('application.verify', subject('application', application.id), 'Clerk verified application');
  return find('quarter_applications', application.id);
}

/** Run eligibility + priority engines and place on the waiting list if eligible. */
export async function runEngine(applicationId) {
  return transaction(async () => {
    const application = await find('quarter_applications', applicationId);
    const profile = await find('employee_profiles', application.employee_profile_id);
    const eligibility = evaluateEligibility(application, profile);

    if (!eligibility.eligible) {
      await update('quarter_applications', application.id, {
        status: 'ineligible',
        eligibility_result: JSON.stringify(eligibility),
      });
      await notify(
        await userOfProfile(profile.id),
        'application_ineligible',
        `Application ${application.reference_no} did not meet eligibility criteria.`,
        'Application Update',
        ['email'],
      );
      return find('quarter_applications', application.id);
    }

    const priority = calculatePriority(application, profile);
    await update('quarter_applications', application.id, {
      status: 'waitlisted',
      eligibility_result: JSON.stringify(eligibility),
      priority_score: priority.score,
      priority_breakdown: JSON.stringify(priority.breakdown),
    });
    await waitingList.place(await find('quarter_applications', application.id));
    return find('quarter_applications', application.id);
  });
}

/** Everyone who may approve applications (holds application.decide): admins, in practice. */
const approvers = () =>
  query(
    `SELECT DISTINCT u.id, u.name, u.email, u.mobile
       FROM users u
       JOIN role_user ru ON ru.user_id = u.id
       JOIN permission_role pr ON pr.role_id = ru.role_id
       JOIN permissions pm ON pm.id = pr.permission_id
      WHERE pm.slug = 'application.decide' AND u.is_active = 1`,
  );

/** The clerk has verified the application and its details: pass it on to the admin for approval. */
export async function forwardApplication(application, clerk, remarks = null) {
  await update('quarter_applications', application.id, {
    status: 'forwarded',
    forwarded_by: clerk.id,
    forwarded_at: nowStr(),
    forward_remarks: remarks,
  });
  await waitingList.reRank(application.preferred_quarter_type); // joins the admin's line
  await audit('application.forward', subject('application', application.id), 'Clerk forwarded the application to the admin', { remarks });

  const owner = await userOfProfile(application.employee_profile_id);
  for (const admin of await approvers()) {
    await notify(admin, 'application_forwarded', `Application ${application.reference_no} (${owner?.name ?? 'employee'}) was verified by the clerk and is waiting for your approval.`, 'Application Awaiting Approval', ['email']);
  }
  await notify(owner, 'application_forwarded_employee', `Your application ${application.reference_no} has been verified and forwarded to the admin for approval.`, 'Application Forwarded', ['email']);
  return find('quarter_applications', application.id);
}

/** The clerk's check failed: the application stops here and the employee is told why. */
export async function rejectApplication(application, clerk, remarks) {
  await update('quarter_applications', application.id, {
    status: 'rejected',
    decided_by: clerk.id,
    decided_at: nowStr(),
    remarks,
  });
  await audit('application.reject', subject('application', application.id), 'Clerk rejected the application', { remarks });
  await notify(
    await userOfProfile(application.employee_profile_id),
    'application_rejected',
    `Application ${application.reference_no} was rejected: ${remarks}`,
    'Application Rejected',
    ['email'],
  );
  return find('quarter_applications', application.id);
}

/** Estate Officer's final decision. */
export async function decideApplication(application, officer, approved, remarks = null) {
  await update('quarter_applications', application.id, {
    status: approved ? 'approved' : 'rejected',
    decided_by: officer.id,
    decided_at: nowStr(),
    remarks,
  });
  if (!approved) await waitingList.remove(application);
  else await waitingList.reRank(application.preferred_quarter_type); // leaves the line: those behind move up

  await audit(
    'application.decide',
    subject('application', application.id),
    approved ? 'Approved' : 'Rejected',
    { remarks },
  );
  await notify(
    await userOfProfile(application.employee_profile_id),
    approved ? 'application_approved' : 'application_rejected',
    approved
      ? `Your application ${application.reference_no} has been approved.`
      : `Your application ${application.reference_no} was rejected${remarks ? `: ${remarks}` : '.'}`,
    approved ? 'Application Approved' : 'Application Rejected',
    ['email'],
  );
  return find('quarter_applications', application.id);
}

/**
 * The admin approves several applications of the line in one go (e.g. the top 10% / 20%).
 * Everything is applied or nothing is: every id must still be waiting for approval.
 */
export function approveBatch(ids, officer, remarks = null) {
  return transaction(async () => {
    const approved = [];
    for (const id of ids) {
      const application = await first('SELECT * FROM quarter_applications WHERE id = ? FOR UPDATE', [id]);
      if (!application) throw new DomainError(`Application #${id} does not exist.`, 'application_ids');
      if (application.status !== 'forwarded') {
        throw new DomainError(`Application ${application.reference_no} is no longer waiting for approval (${application.status}).`, 'application_ids');
      }
      approved.push(await decideApplication(application, officer, true, remarks));
    }
    return approved;
  });
}
