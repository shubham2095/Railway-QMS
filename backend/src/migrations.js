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

/** "add this column to this table unless it is already there" */
const addColumn = (table, column, definition) => ({
  name: `${table}.${column}`,
  async run() {
    if (await columnExists(table, column)) return false;
    await query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    return true;
  },
});

// Order matters: later entries may reference columns added by earlier ones (AFTER ...).
const MIGRATIONS = [
  addColumn('employee_profiles', 'pf_number', 'VARCHAR(50) NULL AFTER employee_id'),
  addColumn('employee_profiles', 'father_name', 'VARCHAR(120) NULL AFTER pf_number'),
  addColumn('employee_profiles', 'date_of_birth', 'DATE NULL AFTER father_name'),
  addColumn('employee_profiles', 'current_address', 'VARCHAR(500) NULL AFTER date_of_birth'),
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
