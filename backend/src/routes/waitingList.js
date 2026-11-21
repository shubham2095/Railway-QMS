import { Router } from 'express';
import { query } from '../db.js';
import { QUARTER_TYPES } from '../domain.js';
import { requireRole } from '../middleware/auth.js';
import * as waitingList from '../services/waitingList.js';

const router = Router();
router.use(requireRole('quarter_clerk', 'estate_officer', 'admin', 'super_admin'));

// GET /api/waiting-list?type=III&station=NDLS
router.get('/', async (req, res) => {
  // Distinct active queues keyed by (quarter_type, station).
  const queues = await query(
    `SELECT quarter_type, station, COUNT(*) AS total, MAX(priority_score) AS top_score
       FROM waiting_list_entries WHERE is_active = 1
      GROUP BY quarter_type, station ORDER BY quarter_type, station`,
  );

  const selectedType = req.query.type ? String(req.query.type) : (queues[0]?.quarter_type ?? null);
  // `station` present in the query string (even empty) selects that queue; otherwise default to the first.
  const selectedStation = 'station' in req.query ? (String(req.query.station) || null) : (queues[0]?.station ?? null);

  const entries = selectedType ? await waitingList.queue(selectedType, selectedStation) : [];
  res.json({ queues, entries, selected_type: selectedType, selected_station: selectedStation, types: QUARTER_TYPES });
});

export default router;
