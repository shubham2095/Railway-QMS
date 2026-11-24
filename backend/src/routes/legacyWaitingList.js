import { Router } from 'express';
import { query } from '../db.js';
import { QUARTER_TYPES } from '../domain.js';
import { requireRole } from '../middleware/auth.js';
import { like, paginate } from '../utils/paginate.js';

const router = Router();
router.use(requireRole('quarter_clerk', 'estate_officer', 'admin', 'super_admin'));

// GET /api/legacy-waiting-list?type=II&category=essential&q=kumar&page=2
// Requests made before this system, in line order (earliest request first, within each quarter type).
router.get('/', async (req, res) => {
  const where = [];
  const params = [];
  if (QUARTER_TYPES.includes(String(req.query.type))) { where.push('w.quarter_type = ?'); params.push(String(req.query.type)); }
  if (['essential', 'non_essential'].includes(String(req.query.category))) { where.push('w.category = ?'); params.push(String(req.query.category)); }
  if (req.query.q) {
    where.push('(w.name LIKE ? OR w.pf_number LIKE ? OR w.request_no LIKE ? OR w.designation LIKE ?)');
    const v = like(req.query.q);
    params.push(v, v, v, v);
  }

  const result = await paginate(req, {
    perPage: 25,
    select: `w.*, (SELECT COUNT(*) + 1 FROM legacy_waiting_list w2
                    WHERE w2.quarter_type = w.quarter_type
                      AND (w2.request_date < w.request_date OR (w2.request_date = w.request_date AND w2.id < w.id))) AS line_position`,
    from: 'legacy_waiting_list w',
    where,
    params,
    orderBy: 'w.quarter_type, w.request_date, w.id',
  });
  const counts = await query(
    `SELECT quarter_type, COUNT(*) AS total, SUM(category = 'essential') AS essential, SUM(category = 'non_essential') AS non_essential
       FROM legacy_waiting_list GROUP BY quarter_type ORDER BY quarter_type`,
  );
  res.json({ ...result, types: QUARTER_TYPES, counts });
});

export default router;
