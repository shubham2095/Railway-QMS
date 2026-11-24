import { Router } from 'express';
import { QUARTER_TYPES } from '../domain.js';
import { requireRole } from '../middleware/auth.js';
import * as waitingList from '../services/waitingList.js';

const router = Router();
router.use(requireRole('quarter_clerk', 'estate_officer', 'admin', 'super_admin'));

// GET /api/waiting-list?type=III
// Applicants the admin has approved, waiting for a quarter to be offered (best priority first).
router.get('/', async (req, res) => {
  const queues = (await waitingList.summary()).filter((r) => Number(r.approved) > 0)
    .map((r) => ({ quarter_type: r.quarter_type, total: Number(r.approved) }));
  const selectedType = QUARTER_TYPES.includes(String(req.query.type)) ? String(req.query.type) : (queues[0]?.quarter_type ?? null);
  const entries = selectedType ? await waitingList.queue(selectedType, 'approved') : [];
  res.json({ queues, entries, selected_type: selectedType, types: QUARTER_TYPES });
});

export default router;
