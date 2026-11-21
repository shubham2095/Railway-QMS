import { Router } from 'express';
import { z } from 'zod';
import { find, first, query, update } from '../db.js';
import { requirePermission, requireRole } from '../middleware/auth.js';
import { audit, subject } from '../services/audit.js';
import { serviceYears } from '../services/eligibility.js';
import { notify } from '../services/notifications.js';
import { completeProfileSql, VERIFICATION_STATUSES } from '../services/profile.js';
import { nowStr } from '../utils/dates.js';
import { DomainError, HttpError, idParam, reqStr, validate } from '../utils/http.js';
import { like, paginate } from '../utils/paginate.js';

/**
 * Employee profiles as seen by the estate office. The clerk (permission profile.verify) checks the details an
 * employee entered and either verifies the profile or sends it back with remarks.
 */
const router = Router();
router.use(requireRole('quarter_clerk', 'estate_officer', 'admin', 'super_admin'));

// Only complete profiles of employee accounts are queued (an incomplete profile is still being filled in).
const QUEUE = `FROM employee_profiles p
  JOIN users u ON u.id = p.user_id
 WHERE ${completeProfileSql('p')}
   AND EXISTS (SELECT 1 FROM role_user ru JOIN roles r ON r.id = ru.role_id WHERE ru.user_id = u.id AND r.slug = 'employee')`;

const verificationOf = async (p) => ({
  status: p.verification_status,
  remarks: p.verification_remarks,
  verified_at: p.verified_at,
  verified_by_name: p.verified_by ? (await first('SELECT name FROM users WHERE id = ?', [p.verified_by]))?.name ?? null : null,
});

// GET /api/employees?status=pending&q=
router.get('/', async (req, res) => {
  const where = [];
  const params = [];
  if (VERIFICATION_STATUSES.includes(req.query.status)) { where.push('p.verification_status = ?'); params.push(req.query.status); }
  if (req.query.q) {
    where.push('(u.name LIKE ? OR u.email LIKE ? OR p.employee_id LIKE ? OR p.pf_number LIKE ?)');
    params.push(like(req.query.q), like(req.query.q), like(req.query.q), like(req.query.q));
  }

  const result = await paginate(req, {
    perPage: 15,
    select: `p.id, p.employee_id, p.pf_number, p.designation, p.station, p.verification_status, p.verified_at, p.updated_at,
             u.name, u.email, u.mobile`,
    from: `employee_profiles p JOIN users u ON u.id = p.user_id`,
    where: [
      completeProfileSql('p'),
      "EXISTS (SELECT 1 FROM role_user ru JOIN roles r ON r.id = ru.role_id WHERE ru.user_id = u.id AND r.slug = 'employee')",
      ...where,
    ],
    params,
    orderBy: "FIELD(p.verification_status, 'pending', 'changes_requested', 'verified'), p.updated_at DESC",
  });

  const counts = Object.fromEntries(VERIFICATION_STATUSES.map((s) => [s, 0]));
  for (const r of await query(`SELECT p.verification_status AS status, COUNT(*) AS n ${QUEUE} GROUP BY p.verification_status`)) counts[r.status] = r.n;

  res.json({ ...result, counts, statuses: VERIFICATION_STATUSES });
});

const loadProfile = async (id) => {
  const p = await find('employee_profiles', idParam(id));
  if (!p) throw new HttpError(404, 'Not found.');
  return p;
};

// GET /api/employees/:id
router.get('/:id', async (req, res) => {
  const p = await loadProfile(req.params.id);
  const user = await first('SELECT id, name, email, mobile, is_active FROM users WHERE id = ?', [p.user_id]);
  const family = await query('SELECT id, name, relation, date_of_birth, is_dependent FROM family_members WHERE employee_profile_id = ? ORDER BY id', [p.id]);
  const applications = await query(
    `SELECT id, reference_no, preferred_quarter_type, status, applied_at FROM quarter_applications WHERE employee_profile_id = ? ORDER BY id DESC`,
    [p.id],
  );

  res.json({
    profile: { ...p, has_active_allotment: !!p.has_active_allotment, service_years: serviceYears(p) },
    user,
    family_members: family.map((m) => ({ ...m, is_dependent: !!m.is_dependent })),
    applications,
    verification: await verificationOf(p),
  });
});

// POST /api/employees/:id/verify
router.post('/:id/verify', requirePermission('profile.verify'), async (req, res) => {
  const p = await loadProfile(req.params.id);
  const [{ n: complete }] = await query(`SELECT COUNT(*) AS n FROM employee_profiles p WHERE p.id = ? AND ${completeProfileSql('p')}`, [p.id]);
  if (!complete) throw new DomainError('This profile is incomplete, so it cannot be verified yet.', 'profile');
  if (p.verification_status === 'verified') throw new DomainError('This profile is already verified.', 'profile');

  await update('employee_profiles', p.id, {
    verification_status: 'verified',
    verified_by: req.user.id,
    verified_at: nowStr(),
    verification_remarks: null,
  });
  await audit('profile.verify', subject('employee_profile', p.id), 'Clerk verified the employee profile');

  const owner = await first('SELECT id, name, email, mobile FROM users WHERE id = ?', [p.user_id]);
  await notify(owner, 'profile_verified', 'Your employee profile has been verified. You can now apply for a quarter.', 'Profile Verified', ['email']);
  res.json({ message: 'Profile verified.' });
});

// POST /api/employees/:id/request-changes   { remarks }
router.post('/:id/request-changes', requirePermission('profile.verify'), async (req, res) => {
  const p = await loadProfile(req.params.id);
  const { remarks } = validate(z.object({ remarks: reqStr('remarks', 1000) }), req.body);
  if (p.verification_status === 'changes_requested') {
    throw new DomainError('Changes have already been requested. Waiting for the employee to update the profile.', 'profile');
  }

  await update('employee_profiles', p.id, {
    verification_status: 'changes_requested',
    verified_by: req.user.id,
    verified_at: nowStr(),
    verification_remarks: remarks,
  });
  await audit('profile.request_changes', subject('employee_profile', p.id), 'Clerk asked for profile corrections', { remarks });

  const owner = await first('SELECT id, name, email, mobile FROM users WHERE id = ?', [p.user_id]);
  await notify(owner, 'profile_changes_requested', `Please correct your profile: ${remarks}`, 'Profile Needs Changes', ['email']);
  res.json({ message: 'Sent back to the employee for changes.' });
});

export default router;
