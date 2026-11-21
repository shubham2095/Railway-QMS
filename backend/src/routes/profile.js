import { Router } from 'express';
import { z } from 'zod';
import { find, first, insert, query, scalar, transaction, update } from '../db.js';
import { CATEGORIES, SERVICE_TYPES } from '../domain.js';
import { audit, subject } from '../services/audit.js';
import { serviceYears } from '../services/eligibility.js';
import { isProfileComplete, missingProfileFields } from '../services/profile.js';
import { todayStr } from '../utils/dates.js';
import { abortUnless, bool, HttpError, idParam, optDate, phoneField, reqDate, reqEnum, reqStr, validate } from '../utils/http.js';

const router = Router();

// Every service field is required (keep in sync with REQUIRED_PROFILE_FIELDS in services/profile.js).
// name / mobile belong to the login account and are pre-filled from signup; the email is read-only.
const profileSchema = z
  .object({
    name: reqStr('name', 120),
    mobile: phoneField(),
    employee_id: reqStr('employee id', 50),
    pf_number: reqStr('PF number', 50),
    father_name: reqStr("father's name", 120),
    date_of_birth: reqDate('date of birth'),
    current_address: reqStr('current address', 500),
    designation: reqStr('designation', 120),
    department: reqStr('department', 120),
    station: reqStr('station', 120),
    division: reqStr('division', 120),
    railway_zone: reqStr('railway zone', 120),
    category: reqEnum('category', Object.keys(CATEGORIES)),
    service_type: reqEnum('service type', Object.keys(SERVICE_TYPES)),
    grade_pay: z.preprocess(
      (v) => (v === '' || v === null ? undefined : v),
      z.coerce.number({ error: 'The grade pay field is required.' }).int('The grade pay must be a whole number.').min(0, 'The grade pay must be at least 0.'),
    ),
    pay_level: reqStr('pay level', 50),
    date_of_joining: reqDate('date of joining'),
    retirement_date: reqDate('retirement date'),
  })
  .refine((d) => d.date_of_birth < todayStr(), { message: 'The date of birth must be in the past.', path: ['date_of_birth'] })
  .refine((d) => d.date_of_joining > d.date_of_birth, { message: 'The date of joining must be after the date of birth.', path: ['date_of_joining'] })
  .refine((d) => d.date_of_joining <= todayStr(), { message: 'The date of joining cannot be in the future.', path: ['date_of_joining'] })
  .refine((d) => d.retirement_date > d.date_of_joining, { message: 'The retirement date must be after the date of joining.', path: ['retirement_date'] });

const familySchema = z.object({
  name: reqStr('name', 120),
  relation: reqStr('relation', 60),
  date_of_birth: optDate('date of birth'),
  is_dependent: bool,
});

const shapeProfile = (p) => p && { ...p, has_active_allotment: !!p.has_active_allotment, service_years: serviceYears(p) };

// GET /api/profile
router.get('/', async (req, res) => {
  const profile = req.user.profile;
  const family = profile
    ? (await query('SELECT * FROM family_members WHERE employee_profile_id = ? ORDER BY id', [profile.id])).map((m) => ({
        ...m,
        is_dependent: !!m.is_dependent,
      }))
    : [];
  res.json({
    user: { id: req.user.id, name: req.user.name, email: req.user.email, mobile: req.user.mobile },
    profile: shapeProfile(profile),
    profile_complete: isProfileComplete(profile),
    missing_profile_fields: missingProfileFields(profile),
    family_members: family,
  });
});

// PUT /api/profile  (create or update own profile + the editable account details)
router.put('/', async (req, res) => {
  const data = validate(profileSchema, req.body);
  const user = req.user;

  const taken = (field, label) =>
    new HttpError(422, `The ${label} has already been taken.`, { [field]: [`The ${label} has already been taken.`] });
  if (await scalar('SELECT COUNT(*) FROM employee_profiles WHERE employee_id = ? AND user_id <> ?', [data.employee_id, user.id])) {
    throw taken('employee_id', 'employee id');
  }
  if (await scalar('SELECT COUNT(*) FROM employee_profiles WHERE pf_number = ? AND user_id <> ?', [data.pf_number, user.id])) {
    throw taken('pf_number', 'PF number');
  }

  const fields = {
    employee_id: data.employee_id,
    pf_number: data.pf_number,
    father_name: data.father_name,
    date_of_birth: data.date_of_birth,
    current_address: data.current_address,
    designation: data.designation,
    department: data.department,
    station: data.station,
    division: data.division,
    railway_zone: data.railway_zone,
    category: data.category,
    service_type: data.service_type,
    grade_pay: data.grade_pay,
    pay_level: data.pay_level,
    date_of_joining: data.date_of_joining,
    retirement_date: data.retirement_date,
  };

  await transaction(async () => {
    // Name and phone come from signup and may be corrected here; the email (login identity) is never changed.
    await update('users', user.id, { name: data.name, mobile: data.mobile });
    const existing = await first('SELECT id FROM employee_profiles WHERE user_id = ?', [user.id]);
    if (existing) await update('employee_profiles', existing.id, fields);
    else await insert('employee_profiles', { user_id: user.id, ...fields });
  });

  await audit('profile.update', subject('user', user.id), 'Employee profile updated');
  res.json({ message: 'Profile saved.' });
});

// POST /api/profile/family
router.post('/family', async (req, res) => {
  const profile = req.user.profile;
  if (!profile) throw new HttpError(422, 'Complete your profile before adding family members.');
  const data = validate(familySchema, req.body);
  const id = await insert('family_members', {
    employee_profile_id: profile.id,
    name: data.name,
    relation: data.relation,
    date_of_birth: data.date_of_birth ?? null,
    is_dependent: data.is_dependent ? 1 : 0,
  });
  res.status(201).json({ id, message: 'Family member added.' });
});

// DELETE /api/profile/family/:id
router.delete('/family/:id', async (req, res) => {
  const member = await find('family_members', idParam(req.params.id));
  if (!member) throw new HttpError(404, 'Not found.');
  abortUnless(member.employee_profile_id === req.user.profile?.id);
  await query('DELETE FROM family_members WHERE id = ?', [member.id]);
  res.json({ message: 'Family member removed.' });
});

export default router;
