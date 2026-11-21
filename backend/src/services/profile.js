/**
 * What makes an employee profile "complete".
 *
 * This is the single place that decides it. It drives:
 *   - the first-login gate (employees must finish their profile before using the app),
 *   - the "can apply for a quarter" check, and
 *   - the eligibility engine's profile_complete check.
 * To add or remove a required profile field, change REQUIRED_PROFILE_FIELDS (and the matching
 * validation in routes/profile.js + the form in frontend/src/pages/ProfileEdit.jsx).
 */
export const REQUIRED_PROFILE_FIELDS = {
  employee_id: 'Employee ID',
  pf_number: 'PF number',
  father_name: "Father's name",
  date_of_birth: 'Date of birth',
  current_address: 'Current address',
  designation: 'Designation',
  department: 'Department',
  station: 'Station',
  division: 'Division',
  railway_zone: 'Railway zone',
  category: 'Category',
  service_type: 'Service type',
  grade_pay: 'Grade pay',
  pay_level: 'Pay level',
  date_of_joining: 'Date of joining',
  retirement_date: 'Retirement date',
};

const filled = (v) => v !== null && v !== undefined && String(v).trim() !== '';

/** Labels of the required fields that are still empty (all of them when there is no profile yet). */
export const missingProfileFields = (profile) =>
  Object.entries(REQUIRED_PROFILE_FIELDS)
    .filter(([key]) => !profile || !filled(profile[key]))
    .map(([, label]) => label);

/** SQL condition: every required field of the profile aliased `alias` is filled in (used by the clerk's queue). */
export const completeProfileSql = (alias = 'p') =>
  Object.keys(REQUIRED_PROFILE_FIELDS)
    .map((k) => `(${alias}.${k} IS NOT NULL AND TRIM(CAST(${alias}.${k} AS CHAR)) <> '')`)
    .join(' AND ');

export const VERIFICATION_STATUSES = ['pending', 'verified', 'changes_requested'];

export const isProfileComplete = (profile) => missingProfileFields(profile).length === 0;
