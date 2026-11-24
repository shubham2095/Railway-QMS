import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config/index.js';
import { query } from '../db.js';
import { nowStr } from '../utils/dates.js';

const FILE_RE = /^quarters-type(I|II|III|IV|V|VI)\.json$/;

/** Master-data files in `dir`, e.g. quarters-typeI.json (converted from the Excel sheets). */
export const masterDataFiles = (dir) =>
  fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => FILE_RE.test(f)).sort().map((f) => path.join(dir, f)) : [];

/**
 * Loads one master-data file into `quarters`. Idempotent: a quarter is identified by (station, colony, quarter number).
 * For quarters that already exist only block / pool / remarks are refreshed - status and occupant are never overwritten,
 * so running it again after quarters were allotted through the app is safe.
 */
export async function importQuarterMasterData(file) {
  const type = path.basename(file).match(FILE_RE)[1];
  const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
  const { zone, division, station } = config.rqms.masterData;
  const now = nowStr();
  for (let i = 0; i < rows.length; i += 500) {
    const values = rows.slice(i, i + 500).map((r) => [
      r.number, type, r.colony, zone, division, station, r.block, r.pool, r.remarks, r.status, now, now,
    ]);
    await query(
      `INSERT INTO quarters (quarter_number, quarter_type, colony_name, railway_zone, division, station, block, pool, remarks, status, created_at, updated_at)
       VALUES ? ON DUPLICATE KEY UPDATE block = VALUES(block), pool = VALUES(pool), remarks = VALUES(remarks), updated_at = VALUES(updated_at)`,
      [values],
    );
  }
  return { type, total: rows.length };
}

export async function importAllQuarterMasterData() {
  const results = [];
  for (const file of masterDataFiles(config.rqms.masterData.dir)) results.push(await importQuarterMasterData(file));
  return results;
}

/** Waiting-list requests made before this system (database/data/waitlist-*.json). Idempotent on the request number. */
export async function importWaitingListData(dir = config.rqms.masterData.dir) {
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^waitlist-.*\.json$/.test(f)).sort() : [];
  const now = nowStr();
  const results = [];
  for (const f of files) {
    const rows = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    for (let i = 0; i < rows.length; i += 500) {
      const values = rows.slice(i, i + 500).map((r) => [
        r.request_no, r.request_date, r.name, r.designation, r.quarter_type, r.category, r.pay_scale, r.pf_number, r.unit, now, now,
      ]);
      await query(
        `INSERT INTO legacy_waiting_list (request_no, request_date, name, designation, quarter_type, category, pay_scale, pf_number, unit, created_at, updated_at)
         VALUES ? ON DUPLICATE KEY UPDATE request_date = VALUES(request_date), name = VALUES(name), designation = VALUES(designation),
           quarter_type = VALUES(quarter_type), category = VALUES(category), pay_scale = VALUES(pay_scale), pf_number = VALUES(pf_number),
           unit = VALUES(unit), updated_at = VALUES(updated_at)`,
        [values],
      );
    }
    results.push({ file: f, total: rows.length });
  }
  return results;
}
