import { first, insert, query, update } from '../db.js';
import { nowStr } from '../utils/dates.js';

const stationClause = (station) => (station === null || station === undefined ? ['station IS NULL', []] : ['station = ?', [station]]);

/** Module 5 - place (or refresh) an application on its queue and re-rank. */
export async function place(application) {
  const type = application.preferred_quarter_type;
  const station = application.station ?? null;
  const data = {
    quarter_type: type,
    station,
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
  await reRank(type, station);
  return first('SELECT * FROM waiting_list_entries WHERE id = ?', [id]);
}

/** Recompute ranks for one queue: highest score first, then earliest waiting. */
export async function reRank(quarterType, station) {
  const [clause, params] = stationClause(station);
  const entries = await query(
    `SELECT id FROM waiting_list_entries
      WHERE quarter_type = ? AND ${clause} AND is_active = 1
      ORDER BY priority_score DESC, waiting_since ASC, id ASC`,
    [quarterType, ...params],
  );
  let rank = 1;
  for (const entry of entries) {
    await update('waiting_list_entries', entry.id, { rank: rank++ });
  }
}

/** Active queue entries (with applicant details) ordered by rank. */
export async function queue(quarterType, station = null) {
  const params = [quarterType];
  let stationSql = '';
  if (station !== null && station !== undefined) {
    stationSql = 'AND w.station = ?';
    params.push(station);
  }
  const rows = await query(
    `SELECT w.id, w.quarter_application_id, w.quarter_type, w.station, w.priority_score, w.\`rank\`,
            w.waiting_since, a.reference_no, a.category, a.status AS application_status,
            u.name AS employee_name, p.employee_id
       FROM waiting_list_entries w
       JOIN quarter_applications a ON a.id = w.quarter_application_id
       JOIN employee_profiles p ON p.id = a.employee_profile_id
       JOIN users u ON u.id = p.user_id
      WHERE w.quarter_type = ? ${stationSql} AND w.is_active = 1
      ORDER BY w.\`rank\` ASC, w.id ASC`,
    params,
  );
  return rows.map((r) => ({
    id: r.id,
    rank: r.rank,
    priority_score: r.priority_score,
    waiting_since: r.waiting_since,
    quarter_type: r.quarter_type,
    station: r.station,
    application: {
      id: r.quarter_application_id,
      reference_no: r.reference_no,
      category: r.category,
      status: r.application_status,
      employee_name: r.employee_name,
      employee_id: r.employee_id,
    },
  }));
}

/** Take an application off its queue (offered a quarter / rejected). */
export async function remove(application) {
  const entry = await first('SELECT * FROM waiting_list_entries WHERE quarter_application_id = ?', [application.id]);
  if (!entry) return;
  await update('waiting_list_entries', entry.id, { is_active: 0, rank: null });
  await reRank(entry.quarter_type, entry.station);
}
