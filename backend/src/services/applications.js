import { find, first, insert, transaction, update } from '../db.js';
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

/** Estate Officer's final decision. */
export async function decideApplication(application, officer, approved, remarks = null) {
  await update('quarter_applications', application.id, {
    status: approved ? 'approved' : 'rejected',
    decided_by: officer.id,
    decided_at: nowStr(),
    remarks,
  });
  if (!approved) await waitingList.remove(application);

  await audit(
    'application.decide',
    subject('application', application.id),
    approved ? 'Estate Officer approved' : 'Estate Officer rejected',
    { remarks },
  );
  return find('quarter_applications', application.id);
}
