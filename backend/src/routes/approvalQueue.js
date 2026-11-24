import { Router } from 'express';
import { z } from 'zod';
import { scalar } from '../db.js';
import { QUARTER_TYPES } from '../domain.js';
import { requirePermission } from '../middleware/auth.js';
import { approveBatch } from '../services/applications.js';
import * as waitingList from '../services/waitingList.js';
import { optStr, validate } from '../utils/http.js';

const router = Router();
router.use(requirePermission('application.decide'));

// GET /api/approval-queue?type=I
// The line of applications the clerk has verified, ranked by priority, for the admin to approve in bulk.
router.get('/', async (req, res) => {
  const summary = await waitingList.summary();
  const byType = Object.fromEntries(summary.map((r) => [r.quarter_type, r]));
  const type = QUARTER_TYPES.includes(String(req.query.type))
    ? String(req.query.type)
    : (summary.find((r) => Number(r.pending) > 0)?.quarter_type ?? QUARTER_TYPES[0]);

  const entries = await waitingList.queue(type, 'pending');
  const vacant = await scalar("SELECT COUNT(*) FROM quarters WHERE quarter_type = ? AND status = 'vacant'", [type]);
  res.json({
    type,
    types: QUARTER_TYPES.map((t) => ({ type: t, pending: Number(byType[t]?.pending ?? 0), approved: Number(byType[t]?.approved ?? 0) })),
    entries,
    vacant_quarters: Number(vacant),
    approved_waiting: Number(byType[type]?.approved ?? 0),
  });
});

// POST /api/approval-queue/approve   { application_ids: [..], remarks? }
router.post('/approve', async (req, res) => {
  const data = validate(
    z.object({
      application_ids: z.array(z.coerce.number().int().positive()).min(1, 'Select at least one applicant.').max(1000),
      remarks: optStr('remarks', 1000),
    }),
    req.body,
  );
  const ids = [...new Set(data.application_ids)];
  const approved = await approveBatch(ids, req.user, data.remarks ?? null);
  res.json({ approved: approved.length, message: `${approved.length} application${approved.length === 1 ? '' : 's'} approved. The line has moved up.` });
});

export default router;
