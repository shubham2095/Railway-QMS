import { query, scalar } from './db.js';

/**
 * Idempotent schema upgrades for databases created by an earlier version of schema.sql.
 * (Fresh installs already get the final schema from database/schema.sql.)
 * Add new entries at the end; each one must be safe to run any number of times.
 */
const columnExists = async (table, column) =>
  (await scalar(
    'SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?',
    [table, column],
  )) > 0;

const MIGRATIONS = [
  {
    name: 'employee_profiles.pf_number',
    async run() {
      if (!(await columnExists('employee_profiles', 'pf_number'))) {
        await query('ALTER TABLE employee_profiles ADD COLUMN pf_number VARCHAR(50) NULL AFTER employee_id');
        return true;
      }
      return false;
    },
  },
];

/** Returns the names of the migrations that actually changed something. */
export async function runMigrations() {
  const [hasUsers] = await query("SHOW TABLES LIKE 'users'");
  if (!hasUsers) return []; // empty database: nothing to upgrade (bootstrap / db:setup creates the tables)

  const applied = [];
  for (const m of MIGRATIONS) {
    if (await m.run()) applied.push(m.name);
  }
  return applied;
}
