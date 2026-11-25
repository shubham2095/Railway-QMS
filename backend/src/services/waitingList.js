import { first, insert, query, update } from '../db.js';
import { nowStr } from '../utils/dates.js';
import { preferencesFor } from './colonyPreferences.js';

/** Module 5 - place (or refresh) an application on its queue and re-rank. */
export async function place(application) {
  const type = application.preferred_quarter_type;
  const data = {
    quarter_type: type,
    station: null, // one queue per quarter type for the whole division
    priority_score: Number(application.priority_score || 0),
    waiting_since: application.applied_at ?? nowStr(),
    is_active: 1,
  };
  const existing = await first('SELECT id FROM waiting_list_entries WHERE quarter_application_id = ?', [application.id]);
  let id;
  if (existing) {
    id = existing.id;
    await update('waiting_list_entries', id, data);
  } else {
    id = await insert('waiting_list_entries', { quarter_application_id: application.id, ...data });
  }
  await reRank(type);
  return first('SELECT * FROM waiting_list_entries WHERE id = ?', [id]);
}

/**
 * Recompute the line for one quarter type. The line is the applicants who are waiting for the admin's approval
 * (status "forwarded"): highest priority score first, then earliest application. Once approved an applicant leaves
 * the line (rank cleared) and everyone behind moves up.
 */
export async function reRank(quarterType) {
  await query(
    `UPDATE waiting_list_entries w JOIN quarter_applications a ON a.id = w.quarter_application_id
        SET w.\`rank\` = NULL WHERE w.quarter_type = ? AND a.status <> 'forwarded'`,
    [quarterType],
  );
  const entries = await query(
    `SELECT w.id FROM waiting_list_entries w JOIN quarter_applications a ON a.id = w.quarter_application_id
      WHERE w.quarter_type = ? AND w.is_active = 1 AND a.status = 'forwarded'
      ORDER BY w.priority_score DESC, w.waiting_since ASC, w.id ASC`,
    [quarterType],
  );
  let rank = 1;
  for (const entry of entries) {
    await update('waiting_list_entries', entry.id, { rank: rank++ });
  }
}

/**
 * Active entries of one quarter type with applicant details.
 *   stage "pending"  - in line for the admin's approval (status forwarded), by rank
 *   stage "approved" - approved by the admin, waiting for a quarter to be offered, best score first
 */
export async function queue(quarterType, stage = 'pending') {
  const status = stage === 'approved' ? 'approved' : 'forwarded';
  const rows = await query(
    `SELECT w.id, w.quarter_application_id, w.quarter_type, w.station, w.priority_score, w.\`rank\`,
            w.waiting_since, a.reference_no, a.category, a.status AS application_status, a.decided_at,
            u.name AS employee_name, p.user_id AS owner_user_id, p.employee_id, p.designation, p.grade_pay
       FROM waiting_list_entries w
       JOIN quarter_applications a ON a.id = w.quarter_application_id
       JOIN employee_profiles p ON p.id = a.employee_profile_id
       JOIN users u ON u.id = p.user_id
      WHERE w.quarter_type = ? AND w.is_active = 1 AND a.status = ?
      ORDER BY w.priority_score DESC, w.waiting_since ASC, w.id ASC`,
    [quarterType, status],
  );
  const prefs = await preferencesFor(rows.map((r) => r.quarter_application_id));
  return rows.map((r, i) => ({
    id: r.id,
    rank: r.rank ?? i + 1,
    priority_score: r.priority_score,
    waiting_since: r.waiting_since,
    quarter_type: r.quarter_type,
    station: r.station,
    application: {
      id: r.quarter_application_id,
      reference_no: r.reference_no,
      category: r.category,
      status: r.application_status,
      decided_at: r.decided_at,
      employee_name: r.employee_name,
      owner_user_id: r.owner_user_id,
      employee_id: r.employee_id,
      designation: r.designation,
      grade_pay: r.grade_pay,
      colony_preferences: prefs.get(r.quarter_application_id) ?? [],
    },
  }));
}

/** Counts per quarter type: waiting for approval / approved and waiting for a quarter. */
export async function summary() {
  return query(
    `SELECT w.quarter_type,
            SUM(a.status = 'forwarded') AS pending,
            SUM(a.status = 'approved') AS approved,
            MAX(CASE WHEN a.status = 'forwarded' THEN w.priority_score END) AS top_score
       FROM waiting_list_entries w JOIN quarter_applications a ON a.id = w.quarter_application_id
      WHERE w.is_active = 1 AND a.status IN ('forwarded', 'approved')
      GROUP BY w.quarter_type ORDER BY w.quarter_type`,
  );
}

/** Take an application off its queue (offered a quarter / rejected). */
export async function remove(application) {
  const entry = await first('SELECT * FROM waiting_list_entries WHERE quarter_application_id = ?', [application.id]);
  if (!entry) return;
  await update('waiting_list_entries', entry.id, { is_active: 0, rank: null });
  await reRank(entry.quarter_type);
}
