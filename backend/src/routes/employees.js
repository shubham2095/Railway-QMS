import { Router } from 'express';
import { find, first, query } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { serviceYears } from '../services/eligibility.js';
import { completeProfileSql } from '../services/profile.js';
import { HttpError, idParam } from '../utils/http.js';
import { like, paginate } from '../utils/paginate.js';

/**
 * Employee profiles as seen by the estate office (read-only directory). The clerk does not verify profiles:
 * the clerk checks the application itself (see routes/applications.js).
 */
const router = Router();
router.use(requireRole('quarter_clerk', 'estate_officer', 'admin', 'super_admin'));

// GET /api/employees?q=
router.get('/', async (req, res) => {
  const where = [];
  const params = [];
  if (req.query.q) {
    where.push('(u.name LIKE ? OR u.email LIKE ? OR p.employee_id LIKE ? OR p.pf_number LIKE ?)');
    params.push(like(req.query.q), like(req.query.q), like(req.query.q), like(req.query.q));
  }

  const result = await paginate(req, {
    perPage: 15,
    select: `p.id, p.employee_id, p.pf_number, p.designation, p.station, p.updated_at,
             u.name, u.email, u.mobile`,
    from: `employee_profiles p JOIN users u ON u.id = p.user_id`,
    where: [
      completeProfileSql('p'),
      "EXISTS (SELECT 1 FROM role_user ru JOIN roles r ON r.id = ru.role_id WHERE ru.user_id = u.id AND r.slug = 'employee')",
      ...where,
    ],
    params,
    orderBy: 'u.name, p.id',
  });

  res.json(result);
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
  });
});

export default router;
