import { Router } from 'express';
import { z } from 'zod';
import { find, insert, isDuplicateKey, query, update } from '../db.js';
import { QUARTER_STATUSES, QUARTER_TYPES } from '../domain.js';
import { requirePermission, requireRole } from '../middleware/auth.js';
import { audit, subject } from '../services/audit.js';
import { suggestionsFor } from '../services/allotments.js';
import { choiceFor } from '../services/colonyPreferences.js';
import { DomainError, HttpError, idParam, optStr, reqEnum, reqStr, validate } from '../utils/http.js';
import { like, paginate } from '../utils/paginate.js';

const router = Router();
const staff = requireRole('quarter_clerk', 'estate_officer', 'admin', 'super_admin');

const schema = z.object({
  quarter_number: reqStr('quarter number', 50),
  quarter_type: reqEnum('quarter type', QUARTER_TYPES),
  colony_name: optStr('colony name'),
  address: optStr('address', 500),
  railway_zone: optStr('railway zone', 100),
  division: optStr('division', 100),
  station: optStr('station', 100),
  block: optStr('block', 50),
  floor: optStr('floor', 50),
  status: reqEnum('status', QUARTER_STATUSES),
});

const fields = (d) => ({
  quarter_number: d.quarter_number,
  quarter_type: d.quarter_type,
  colony_name: d.colony_name ?? null,
  address: d.address ?? null,
  railway_zone: d.railway_zone ?? null,
  division: d.division ?? null,
  station: d.station ?? null,
  block: d.block ?? null,
  floor: d.floor ?? null,
  status: d.status,
});

const duplicate = () =>
  new DomainError('A quarter with this number already exists in the same colony and station.', 'quarter_number');

// GET /api/quarters
router.get('/', staff, async (req, res) => {
  const where = [];
  const params = [];
  if (req.query.type) { where.push('q.quarter_type = ?'); params.push(String(req.query.type)); }
  if (req.query.status) { where.push('q.status = ?'); params.push(String(req.query.status)); }
  if (req.query.station) { where.push('q.station LIKE ?'); params.push(like(req.query.station)); }
  if (req.query.colony) { where.push('q.colony_name = ?'); params.push(String(req.query.colony)); }
  if (req.query.q) { where.push('q.quarter_number LIKE ?'); params.push(like(req.query.q)); }

  const result = await paginate(req, {
    perPage: 15,
    select: 'q.*, u.name AS occupant_name',
    from: `quarters q
           LEFT JOIN employee_profiles p ON p.id = q.current_occupant_id
           LEFT JOIN users u ON u.id = p.user_id`,
    where,
    params,
    orderBy: 'q.station, q.colony_name, q.quarter_number',
  });
  res.json({ ...result, types: QUARTER_TYPES, statuses: QUARTER_STATUSES });
});

// POST /api/quarters
router.post('/', requirePermission('quarter.manage'), async (req, res) => {
  const data = validate(schema, req.body);
  let id;
  try {
    id = await insert('quarters', fields(data));
  } catch (err) {
    if (isDuplicateKey(err)) throw duplicate();
    throw err;
  }
  await audit('quarter.create', subject('quarter', id), `Quarter ${data.quarter_number} created`);
  res.status(201).json({ id, message: 'Quarter created.' });
});

// GET /api/quarters/:id
router.get('/:id', staff, async (req, res) => {
  const quarter = await find('quarters', idParam(req.params.id));
  if (!quarter) throw new HttpError(404, 'Not found.');

  const occupant = quarter.current_occupant_id
    ? (await query('SELECT u.name FROM employee_profiles p JOIN users u ON u.id = p.user_id WHERE p.id = ?', [quarter.current_occupant_id]))[0]
    : null;

  const occupancies = await query(
    `SELECT o.id, o.start_date, o.end_date, o.is_current, u.name AS employee_name
       FROM occupancies o JOIN employee_profiles p ON p.id = o.employee_profile_id JOIN users u ON u.id = p.user_id
      WHERE o.quarter_id = ? ORDER BY o.start_date DESC, o.id DESC`,
    [quarter.id],
  );
  const allotments = await query(
    `SELECT al.id, al.allotment_order_no, al.status, al.offered_at, u.name AS employee_name
       FROM allotments al JOIN employee_profiles p ON p.id = al.employee_profile_id JOIN users u ON u.id = p.user_id
      WHERE al.quarter_id = ? ORDER BY al.offered_at DESC, al.id DESC`,
    [quarter.id],
  );

  // Module 6 - top of the matching waiting-list queue when vacant.
  // For each applicant: which of their (up to 5) colony choices is this quarter's colony, if any.
  const suggestions = (await suggestionsFor(quarter)).map((e) => ({
    ...e,
    colony_choice: choiceFor(e.application.colony_preferences, quarter.colony_name),
  }));

  res.json({
    quarter: { ...quarter, occupant_name: occupant?.name ?? null },
    occupancies: occupancies.map((o) => ({ ...o, is_current: !!o.is_current })),
    allotments,
    suggestions,
  });
});

// PUT /api/quarters/:id
router.put('/:id', requirePermission('quarter.manage'), async (req, res) => {
  const quarter = await find('quarters', idParam(req.params.id));
  if (!quarter) throw new HttpError(404, 'Not found.');
  const data = validate(schema, req.body);
  try {
    await update('quarters', quarter.id, fields(data));
  } catch (err) {
    if (isDuplicateKey(err)) throw duplicate();
    throw err;
  }
  await audit('quarter.update', subject('quarter', quarter.id), `Quarter ${data.quarter_number} updated`);
  res.json({ message: 'Quarter updated.' });
});

export default router;
