import { Router } from 'express';
import { query } from '../db.js';
import { requireRole } from '../middleware/auth.js';
import { like, paginate } from '../utils/paginate.js';

const router = Router();
router.use(requireRole('quarter_clerk', 'estate_officer', 'admin', 'super_admin'));

// GET /api/legacy-waiting-list?list=Type-II&category=essential&q=kumar&page=2
// Requests made before this system, in line order within each list (staff lists: earliest request first;
// gazetted lists: the order of the official priority sheet).
router.get('/', async (req, res) => {
  const where = [];
  const params = [];
  if (req.query.list) { where.push('w.list_name = ?'); params.push(String(req.query.list)); }
  if (['essential', 'non_essential'].includes(String(req.query.category))) { where.push('w.category = ?'); params.push(String(req.query.category)); }
  if (req.query.q) {
    where.push('(w.name LIKE ? OR w.pf_number LIKE ? OR w.request_no LIKE ? OR w.designation LIKE ? OR w.contact_no LIKE ?)');
    const v = like(req.query.q);
    params.push(v, v, v, v, v);
  }

  const result = await paginate(req, {
    perPage: 25,
    select: `w.*, (SELECT COUNT(*) + 1 FROM legacy_waiting_list w2
                    WHERE w2.list_name = w.list_name
                      AND (COALESCE(w2.list_order, 0) < COALESCE(w.list_order, 0)
                        OR (COALESCE(w2.list_order, 0) = COALESCE(w.list_order, 0)
                            AND (w2.request_date < w.request_date OR (w2.request_date = w.request_date AND w2.id < w.id))))) AS line_position`,
    from: 'legacy_waiting_list w',
    where,
    params,
    orderBy: 'w.list_name, COALESCE(w.list_order, 0), w.request_date, w.id',
  });
  const lists = await query(
    `SELECT list_name, staff_kind, COUNT(*) AS total FROM legacy_waiting_list GROUP BY list_name, staff_kind
      ORDER BY staff_kind DESC, list_name`,
  );
  res.json({ ...result, lists });
});

export default router;
