import { Router } from 'express';
import { z } from 'zod';
import { find, first, query } from '../db.js';
import { ALL_STAFF_ROLES, CLEARANCE_STEPS, STEP_FOR_ROLE, VACATION_TRIGGERS, stepLabel } from '../domain.js';
import { initiateVacation, actOnClearance } from '../services/vacations.js';
import { DomainError, HttpError, abortUnless, bool, idParam, optNum, optStr, reqDate, reqEnum, validate } from '../utils/http.js';
import { paginate } from '../utils/paginate.js';

const router = Router();

const myStepOf = (u) => Object.entries(STEP_FOR_ROLE).find(([role]) => u.hasRole(role))?.[1] ?? null;

const createSchema = z.object({
  allotment_id: z.coerce.number({ error: 'The allotment id field is required.' }).int().min(1),
  trigger: reqEnum('trigger', VACATION_TRIGGERS),
  requested_vacation_date: reqDate('requested vacation date'),
  reason: optStr('reason', 1000),
});

const actSchema = z.object({
  step: reqEnum('step', Object.keys(CLEARANCE_STEPS)),
  decision: reqEnum('decision', ['approve', 'reject']),
  meter_reading: optNum('meter reading', { min: 0 }),
  dues_amount: optNum('dues amount', { min: 0 }),
  has_damage: bool,
  remarks: optStr('remarks', 1000),
});

const loadVacation = async (id) => {
  const v = await find('vacation_requests', idParam(id));
  if (!v) throw new HttpError(404, 'Not found.');
  return v;
};

// GET /api/vacations?mine_to_action=1
router.get('/', async (req, res) => {
  const user = req.user;
  const myStep = myStepOf(user);
  const isStaff = user.hasRole(...ALL_STAFF_ROLES);
  const where = [];
  const params = [];
  if (!isStaff) { where.push('v.employee_profile_id = ?'); params.push(user.profile?.id ?? 0); }
  if (['1', 'true'].includes(String(req.query.mine_to_action)) && myStep) {
    where.push("v.status = 'in_clearance'", 'v.current_step = ?');
    params.push(myStep);
  }

  const result = await paginate(req, {
    perPage: 15,
    select: `v.id, v.reference_no, v.trigger, v.requested_vacation_date, v.status, v.current_step,
             q.quarter_number, u.name AS employee_name`,
    from: `vacation_requests v
           JOIN quarters q ON q.id = v.quarter_id
           JOIN employee_profiles p ON p.id = v.employee_profile_id
           JOIN users u ON u.id = p.user_id`,
    where,
    params,
    orderBy: 'v.id DESC',
    map: (r) => ({ ...r, current_step_label: r.current_step ? stepLabel(r.current_step) : null }),
  });
  res.json({ ...result, is_staff: isStaff, my_step: myStep });
});

// GET /api/vacations/options  - allotments the employee may vacate + trigger list
router.get('/options', async (req, res) => {
  const profile = req.user.profile;
  const allotments = profile
    ? await query(
        `SELECT al.id, al.allotment_order_no, q.quarter_number, q.colony_name
           FROM allotments al JOIN quarters q ON q.id = al.quarter_id
          WHERE al.employee_profile_id = ? AND al.status IN ('possession_taken','accepted')
            AND NOT EXISTS (SELECT 1 FROM vacation_requests v WHERE v.allotment_id = al.id)
          ORDER BY al.id`,
        [profile.id],
      )
    : [];
  res.json({ allotments, triggers: VACATION_TRIGGERS });
});

// POST /api/vacations
router.post('/', async (req, res) => {
  const profile = req.user.profile;
  const data = validate(createSchema, req.body);

  const allotment = await find('allotments', data.allotment_id);
  if (!allotment) throw new DomainError('The selected allotment is invalid.', 'allotment_id');
  abortUnless(allotment.employee_profile_id === profile?.id);
  if (!['possession_taken', 'accepted'].includes(allotment.status)) {
    throw new DomainError('This allotment cannot be vacated.', 'allotment_id');
  }
  if (await first('SELECT id FROM vacation_requests WHERE allotment_id = ?', [allotment.id])) {
    throw new DomainError('A vacation request already exists for this allotment.', 'allotment_id');
  }

  const vacation = await initiateVacation(allotment, data);
  res.status(201).json({
    id: vacation.id,
    message: `Vacation request ${vacation.reference_no} started. Clearance workflow initiated.`,
  });
});

// GET /api/vacations/:id
router.get('/:id', async (req, res) => {
  const v = await loadVacation(req.params.id);
  const isOwner = v.employee_profile_id === req.user.profile?.id;
  abortUnless(isOwner || req.user.hasRole(...ALL_STAFF_ROLES));

  const quarter = await find('quarters', v.quarter_id);
  const owner = await first('SELECT u.name FROM employee_profiles p JOIN users u ON u.id = p.user_id WHERE p.id = ?', [v.employee_profile_id]);
  const allotment = await first('SELECT id, allotment_order_no FROM allotments WHERE id = ?', [v.allotment_id]);
  const clearances = await query(
    `SELECT c.*, u.name AS handler_name FROM vacation_clearances c
       LEFT JOIN users u ON u.id = c.handled_by WHERE c.vacation_request_id = ? ORDER BY c.sequence`,
    [v.id],
  );
  const certificates = await query(
    `SELECT id, type, number, issued_at, is_signed FROM certificates
      WHERE certifiable_type = 'vacation_request' AND certifiable_id = ? ORDER BY id`,
    [v.id],
  );

  res.json({
    vacation: {
      ...v,
      employee_name: owner?.name ?? null,
      current_step_label: v.current_step ? stepLabel(v.current_step) : null,
    },
    quarter: quarter && { id: quarter.id, quarter_number: quarter.quarter_number },
    allotment,
    clearances: clearances.map((c) => ({
      ...c,
      has_damage: c.has_damage === null ? null : !!c.has_damage,
      label: stepLabel(c.step),
      authorised_role: CLEARANCE_STEPS[c.step].role,
    })),
    certificates: certificates.map((c) => ({ ...c, is_signed: !!c.is_signed })),
  });
});

// POST /api/vacations/:id/act  - act on a clearance step (department users)
router.post('/:id/act', async (req, res) => {
  const v = await loadVacation(req.params.id);
  const data = validate(actSchema, req.body);

  // The user must hold the permission mapped to this step.
  abortUnless(
    req.user.hasPermission(`vacation.${data.step}`),
    403,
    `You are not authorised to act on the ${stepLabel(data.step)} step.`,
  );

  await actOnClearance(v, data.step, req.user, data.decision === 'approve', {
    meter_reading: data.meter_reading ?? null,
    dues_amount: data.dues_amount ?? null,
    has_damage: data.has_damage,
    remarks: data.remarks ?? null,
  });
  res.json({ message: `${stepLabel(data.step)} ${data.decision === 'approve' ? 'approved.' : 'rejected.'}` });
});

export default router;
