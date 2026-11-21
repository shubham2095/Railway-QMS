import { Router } from 'express';
import { z } from 'zod';
import { find, first, query } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { processDailyRetentionCycle, recordRetirement } from '../services/retirements.js';
import { addMonths, diffInDays, todayStr } from '../utils/dates.js';
import { DomainError, abortUnless, validate } from '../utils/http.js';
import { paginate } from '../utils/paginate.js';

const router = Router();
router.use(requireRole('quarter_clerk', 'estate_officer', 'admin', 'super_admin'));

// GET /api/retirements
router.get('/', async (req, res) => {
  const result = await paginate(req, {
    perPage: 15,
    select: `r.*, u.name AS employee_name, p.employee_id, q.quarter_number`,
    from: `retirement_records r
           JOIN employee_profiles p ON p.id = r.employee_profile_id
           JOIN users u ON u.id = p.user_id
           LEFT JOIN allotments al ON al.id = r.allotment_id
           LEFT JOIN quarters q ON q.id = al.quarter_id`,
    orderBy: "FIELD(r.status,'overstaying','expiring','retained','notice','cleared'), r.retention_expiry_date",
    map: (r) => ({ ...r, retention_granted: !!r.retention_granted }),
  });

  // Employees retiring within the next 6 months who don't yet have a retirement record.
  const today = todayStr();
  const upcoming = (
    await query(
      `SELECT p.id, p.employee_id, p.designation, p.retirement_date, u.name
         FROM employee_profiles p JOIN users u ON u.id = p.user_id
        WHERE p.retirement_date >= ? AND p.retirement_date <= ?
          AND NOT EXISTS (SELECT 1 FROM retirement_records r WHERE r.employee_profile_id = p.id)
        ORDER BY p.retirement_date`,
      [today, addMonths(today, 6)],
    )
  ).map((p) => ({ ...p, days_until: diffInDays(today, p.retirement_date) }));

  res.json({ ...result, upcoming });
});

// POST /api/retirements
router.post('/', async (req, res) => {
  const data = validate(
    z.object({
      employee_profile_id: z.coerce.number({ error: 'The employee profile id field is required.' }).int().min(1),
      grant_retention: z.preprocess((v) => (v === undefined ? true : v === true || v === 'true' || v === '1' || v === 1 || v === 'on'), z.boolean()),
    }),
    req.body,
  );
  const profile = await find('employee_profiles', data.employee_profile_id);
  if (!profile) throw new DomainError('The selected employee profile is invalid.', 'employee_profile_id');

  const allotment = await first(
    `SELECT * FROM allotments WHERE employee_profile_id = ? AND status IN ('possession_taken','accepted') ORDER BY id DESC LIMIT 1`,
    [profile.id],
  );
  await recordRetirement(profile, allotment, data.grant_retention);
  res.status(201).json({ message: 'Retirement recorded.' });
});

// POST /api/retirements/run-cycle
router.post('/run-cycle', async (req, res) => {
  abortUnless(req.user.hasRole('admin', 'super_admin', 'estate_officer'));
  const count = await processDailyRetentionCycle();
  res.json({ message: `Retention cycle processed ${count} record(s).` });
});

export default router;
