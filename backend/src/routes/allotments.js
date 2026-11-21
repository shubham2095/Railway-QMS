import { Router } from 'express';
import { z } from 'zod';
import { find, first, query } from '../db.js';
import { ALLOTMENT_STATUSES } from '../domain.js';
import { requirePermission } from '../middleware/auth.js';
import { offerQuarter, respondToOffer, takePossession } from '../services/allotments.js';
import { DomainError, HttpError, abortUnless, idParam, optInt, reqEnum, validate } from '../utils/http.js';
import { paginate } from '../utils/paginate.js';

const router = Router();
const isStaff = (u) => u.hasRole('quarter_clerk', 'estate_officer', 'admin', 'super_admin');

const loadAllotment = async (id) => {
  const a = await find('allotments', idParam(id));
  if (!a) throw new HttpError(404, 'Not found.');
  return a;
};

// GET /api/allotments
router.get('/allotments', async (req, res) => {
  const staff = isStaff(req.user);
  const where = [];
  const params = [];
  if (!staff) { where.push('al.employee_profile_id = ?'); params.push(req.user.profile?.id ?? 0); }
  if (req.query.status) { where.push('al.status = ?'); params.push(String(req.query.status)); }

  const result = await paginate(req, {
    perPage: 15,
    select: `al.id, al.allotment_order_no, al.status, al.offered_at, al.possession_date,
             q.quarter_number, q.quarter_type, u.name AS employee_name`,
    from: `allotments al
           JOIN quarters q ON q.id = al.quarter_id
           JOIN employee_profiles p ON p.id = al.employee_profile_id
           JOIN users u ON u.id = p.user_id`,
    where,
    params,
    orderBy: 'al.id DESC',
  });
  res.json({ ...result, is_staff: staff, statuses: ALLOTMENT_STATUSES });
});

// GET /api/allotments/:id
router.get('/allotments/:id', async (req, res) => {
  const a = await loadAllotment(req.params.id);
  const isOwner = a.employee_profile_id === req.user.profile?.id;
  abortUnless(isOwner || isStaff(req.user));

  const quarter = await find('quarters', a.quarter_id);
  const owner = await first(
    'SELECT u.name, p.employee_id FROM employee_profiles p JOIN users u ON u.id = p.user_id WHERE p.id = ?',
    [a.employee_profile_id],
  );
  const application = a.quarter_application_id
    ? await first('SELECT id, reference_no FROM quarter_applications WHERE id = ?', [a.quarter_application_id])
    : null;
  const occupancy = await first('SELECT * FROM occupancies WHERE allotment_id = ?', [a.id]);
  const certificates = await query(
    `SELECT id, type, number, issued_at, is_signed FROM certificates
      WHERE certifiable_type = 'allotment' AND certifiable_id = ? ORDER BY id`,
    [a.id],
  );
  const vacation = await first('SELECT id, reference_no, status FROM vacation_requests WHERE allotment_id = ?', [a.id]);

  res.json({
    allotment: { ...a, employee_name: owner?.name ?? null, employee_id: owner?.employee_id ?? null },
    quarter,
    application,
    occupancy: occupancy && { ...occupancy, is_current: !!occupancy.is_current },
    certificates: certificates.map((c) => ({ ...c, is_signed: !!c.is_signed })),
    vacation_request: vacation,
    is_owner: isOwner,
  });
});

// POST /api/quarters/:id/offer  - offer a vacant quarter to a waiting-list entry
router.post('/quarters/:id/offer', requirePermission('allotment.approve'), async (req, res) => {
  const quarterId = idParam(req.params.id);
  const data = validate(
    z.object({ waiting_list_entry_id: optInt('waiting list entry id', { min: 1 }).refine((v) => v !== undefined, 'The waiting list entry id field is required.') }),
    req.body,
  );
  const allotment = await offerQuarter(quarterId, data.waiting_list_entry_id, req.user);
  res.status(201).json({ id: allotment.id, message: `Allotment ${allotment.allotment_order_no} issued.` });
});

// POST /api/allotments/:id/respond  - employee accepts / rejects an offer
router.post('/allotments/:id/respond', async (req, res) => {
  const a = await loadAllotment(req.params.id);
  abortUnless(a.employee_profile_id === req.user.profile?.id);
  const data = validate(z.object({ decision: reqEnum('decision', ['accept', 'reject']) }), req.body);
  if (a.status !== 'offered') throw new DomainError('This offer has already been answered.', 'allotment');
  await respondToOffer(a, data.decision === 'accept');
  res.json({ message: 'Response recorded.' });
});

// POST /api/allotments/:id/possession
router.post('/allotments/:id/possession', requirePermission('allotment.possession'), async (req, res) => {
  const a = await loadAllotment(req.params.id);
  if (a.status !== 'accepted') throw new DomainError('Possession can only be recorded after the offer is accepted.', 'allotment');
  await takePossession(a, req.user);
  res.json({ message: 'Possession recorded; occupancy started.' });
});

export default router;
