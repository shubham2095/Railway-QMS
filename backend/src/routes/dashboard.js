import { Router } from 'express';
import { query, scalar } from '../db.js';
import { ALL_STAFF_ROLES } from '../domain.js';
import { addDays, todayStr } from '../utils/dates.js';

const router = Router();

router.get('/', async (req, res) => {
  const user = req.user;
  const profile = user.profile;
  const isStaff = user.hasRole(...ALL_STAFF_ROLES);

  let stats = null;
  let occupancyByType = {};

  if (isStaff) {
    const count = (sql, params) => scalar(sql, params);
    const today = todayStr();
    stats = {
      total_quarters: await count('SELECT COUNT(*) FROM quarters'),
      occupied: await count("SELECT COUNT(*) FROM quarters WHERE status = 'occupied'"),
      vacant: await count("SELECT COUNT(*) FROM quarters WHERE status = 'vacant'"),
      maintenance: await count("SELECT COUNT(*) FROM quarters WHERE status = 'under_maintenance'"),
      pending_apps: await count("SELECT COUNT(*) FROM quarter_applications WHERE status IN ('submitted','verified','waitlisted','forwarded')"),
      waitlist: await count('SELECT COUNT(*) FROM waiting_list_entries WHERE is_active = 1'),
      active_allotments: await count("SELECT COUNT(*) FROM allotments WHERE status IN ('possession_taken','accepted')"),
      vacations_clearing: await count("SELECT COUNT(*) FROM vacation_requests WHERE status = 'in_clearance'"),
      retiring_60d: await count('SELECT COUNT(*) FROM retirement_records WHERE retirement_date >= ? AND retirement_date <= ?', [today, addDays(today, 60)]),
    };

    const rows = await query(
      'SELECT quarter_type, status, COUNT(*) AS total FROM quarters GROUP BY quarter_type, status ORDER BY quarter_type',
    );
    for (const r of rows) (occupancyByType[r.quarter_type] ??= []).push({ status: r.status, total: r.total });
  }

  // Employee self-service snapshot.
  const myApplications = profile
    ? await query(
        `SELECT a.id, a.reference_no, a.preferred_quarter_type, a.station, a.applied_at, a.status, a.priority_score,
                w.\`rank\` AS \`rank\`
           FROM quarter_applications a
           LEFT JOIN waiting_list_entries w ON w.quarter_application_id = a.id
          WHERE a.employee_profile_id = ?
          ORDER BY a.id DESC`,
        [profile.id],
      )
    : [];

  const myAllotments = profile
    ? await query(
        `SELECT al.id, al.allotment_order_no, al.status, q.quarter_number, q.colony_name
           FROM allotments al JOIN quarters q ON q.id = al.quarter_id
          WHERE al.employee_profile_id = ?
          ORDER BY al.id DESC`,
        [profile.id],
      )
    : [];

  res.json({ is_staff: isStaff, has_profile: !!profile, stats, occupancy_by_type: occupancyByType, my_applications: myApplications, my_allotments: myAllotments });
});

export default router;
