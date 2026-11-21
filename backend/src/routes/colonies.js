import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

// GET /api/colonies?type=III&station=NDLS
// Colony names from the quarter master, offered to employees as choices on the application form.
// Only names and simple counts are exposed (no occupant or allotment details).
router.get('/', async (req, res) => {
  const where = ["colony_name IS NOT NULL", "colony_name <> ''"];
  const params = [];
  if (req.query.type) { where.push('quarter_type = ?'); params.push(String(req.query.type)); }
  if (req.query.station) { where.push('station = ?'); params.push(String(req.query.station)); }

  const rows = await query(
    `SELECT colony_name, COUNT(*) AS quarters, SUM(status = 'vacant') AS vacant
       FROM quarters WHERE ${where.join(' AND ')}
      GROUP BY colony_name ORDER BY colony_name`,
    params,
  );
  res.json({ data: rows.map((r) => ({ colony_name: r.colony_name, quarters: Number(r.quarters), vacant: Number(r.vacant) })) });
});

export default router;
