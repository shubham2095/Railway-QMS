import { Router } from 'express';
import { z } from 'zod';
import { find, first, insert, query, scalar, update } from '../db.js';
import { CATEGORIES, SERVICE_TYPES } from '../domain.js';
import { audit, subject } from '../services/audit.js';
import { serviceYears } from '../services/eligibility.js';
import { abortUnless, bool, HttpError, idParam, optDate, optInt, optStr, reqEnum, reqStr, validate } from '../utils/http.js';

const router = Router();

const profileSchema = z.object({
  employee_id: reqStr('employee id', 50),
  designation: optStr('designation', 120),
  department: optStr('department', 120),
  station: optStr('station', 120),
  division: optStr('division', 120),
  railway_zone: optStr('railway zone', 120),
  category: reqEnum('category', Object.keys(CATEGORIES)),
  service_type: reqEnum('service type', Object.keys(SERVICE_TYPES)),
  grade_pay: optInt('grade pay', { min: 0 }),
  pay_level: optStr('pay level', 50),
  date_of_joining: optDate('date of joining'),
  retirement_date: optDate('retirement date'),
  mobile: optStr('mobile', 20),
});

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
    family_members: family,
  });
});

// PUT /api/profile  (create or update own profile)
router.put('/', async (req, res) => {
  const data = validate(profileSchema, req.body);
  const user = req.user;

  const clash = await scalar('SELECT COUNT(*) FROM employee_profiles WHERE employee_id = ? AND user_id <> ?', [data.employee_id, user.id]);
  if (clash) {
    throw new HttpError(422, 'The employee id has already been taken.', { employee_id: ['The employee id has already been taken.'] });
  }

  // A blank mobile keeps the existing number (same as the Laravel version).
  await update('users', user.id, { mobile: data.mobile ?? user.mobile });

  const fields = {
    employee_id: data.employee_id,
    designation: data.designation ?? null,
    department: data.department ?? null,
    station: data.station ?? null,
    division: data.division ?? null,
    railway_zone: data.railway_zone ?? null,
    category: data.category,
    service_type: data.service_type,
    grade_pay: data.grade_pay ?? null,
    pay_level: data.pay_level ?? null,
    date_of_joining: data.date_of_joining ?? null,
    retirement_date: data.retirement_date ?? null,
  };
  const existing = await first('SELECT id FROM employee_profiles WHERE user_id = ?', [user.id]);
  if (existing) await update('employee_profiles', existing.id, fields);
  else await insert('employee_profiles', { user_id: user.id, ...fields });

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
