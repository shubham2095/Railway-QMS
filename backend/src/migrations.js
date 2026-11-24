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

const indexExists = async (table, index) =>
  (await scalar(
    'SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?',
    [table, index],
  )) > 0;

const constraintExists = async (table, name) =>
  (await scalar(
    'SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = ? AND constraint_name = ?',
    [table, name],
  )) > 0;

/** "add this index unless it exists" */
const addIndex = (table, name, columns) => ({
  name: `${table}.${name}`,
  async run() {
    if (await indexExists(table, name)) return false;
    await query(`ALTER TABLE ${table} ADD INDEX ${name} (${columns})`);
    return true;
  },
});

/** "add this foreign key unless it exists" */
const addForeignKey = (table, name, definition) => ({
  name: `${table}.${name}`,
  async run() {
    if (await constraintExists(table, name)) return false;
    await query(`ALTER TABLE ${table} ADD CONSTRAINT ${name} ${definition}`);
    return true;
  },
});

/** "create this table unless it exists" (keep the DDL identical to database/schema.sql) */
const createTable = (name, ddl) => ({
  name: `create ${name}`,
  async run() {
    const exists = await scalar(
      'SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?',
      [name],
    );
    if (exists) return false;
    await query(ddl);
    return true;
  },
});

const LEGACY_WAITING_LIST_DDL = `CREATE TABLE legacy_waiting_list (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  request_no     VARCHAR(100) NOT NULL,            -- e.g. DRM/BTHP/MAR-17-000002
  request_date   DATE NULL,                        -- in the line since
  name           VARCHAR(255) NULL,
  designation    VARCHAR(255) NULL,
  quarter_type   VARCHAR(10) NOT NULL,             -- I..VI
  category       VARCHAR(20) NULL,                 -- essential / non_essential
  pay_scale      VARCHAR(50) NULL,
  pf_number      VARCHAR(50) NULL,
  unit           VARCHAR(50) NULL,                 -- issuing unit in the request number (BTHP, HP ...)
  list_name      VARCHAR(60) NULL,                 -- which list: Type-II, Transit flat, Type-IV Spl ...
  staff_kind     VARCHAR(20) NULL,                 -- staff / gazetted
  present_accommodation VARCHAR(255) NULL,
  preferred_colonies    VARCHAR(500) NULL,         -- places of registration, in order
  contact_no     VARCHAR(30) NULL,
  remarks        VARCHAR(500) NULL,
  list_order     INT UNSIGNED NULL,                -- position on the source sheet (gazetted lists)
  created_at     DATETIME NULL,
  updated_at     DATETIME NULL,
  UNIQUE KEY lwl_request_unique (request_no),
  KEY lwl_type_date_index (quarter_type, request_date),
  KEY lwl_list_index (list_name, list_order, request_date),
  KEY lwl_pf_index (pf_number)
) ENGINE=InnoDB`;

const COLONY_PREFERENCES_DDL = `CREATE TABLE application_colony_preferences (
  id                     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  quarter_application_id BIGINT UNSIGNED NOT NULL,
  priority               TINYINT UNSIGNED NOT NULL,
  colony_name            VARCHAR(255) NOT NULL,
  created_at             DATETIME NULL,
  updated_at             DATETIME NULL,
  UNIQUE KEY acp_application_priority_unique (quarter_application_id, priority),
  KEY acp_colony_index (colony_name(100)),
  CONSTRAINT acp_application_fk FOREIGN KEY (quarter_application_id) REFERENCES quarter_applications (id) ON DELETE CASCADE
) ENGINE=InnoDB`;

// Order matters: later entries may reference columns added by earlier ones (AFTER ...).
const MIGRATIONS = [
  {
    // The line is now one per quarter type (not per station): unify existing entries and re-rank.
    name: 'waiting_list_entries one queue per type',
    async run() {
      const moved = await query('UPDATE waiting_list_entries SET station = NULL WHERE station IS NOT NULL');
      if (moved.affectedRows === 0) return false;
      const { reRank } = await import('./services/waitingList.js');
      for (const row of await query('SELECT DISTINCT quarter_type FROM waiting_list_entries')) await reRank(row.quarter_type);
      return true;
    },
  },
  {
    // The same colony may have a Type-I and a Type-II quarter with the same number: the type is part of the identity now.
    // (Prefix lengths keep the key under InnoDB's 3072-byte limit.)
    name: 'quarters unique key includes the type',
    async run() {
      if (await indexExists('quarters', 'quarters_unique_per_type')) return false;
      const drop = (await indexExists('quarters', 'quarters_station_colony_number_unique')) ? 'DROP INDEX quarters_station_colony_number_unique, ' : '';
      await query(`ALTER TABLE quarters ${drop}ADD UNIQUE KEY quarters_unique_per_type (station(100), colony_name(100), quarter_number(100), quarter_type)`);
      return true;
    },
  },
  addColumn('quarters', 'pool', 'VARCHAR(50) NULL AFTER floor'),
  addColumn('quarters', 'remarks', 'VARCHAR(500) NULL AFTER pool'),
  addColumn('employee_profiles', 'pf_number', 'VARCHAR(50) NULL AFTER employee_id'),
  addColumn('employee_profiles', 'father_name', 'VARCHAR(120) NULL AFTER pf_number'),
  addColumn('employee_profiles', 'date_of_birth', 'DATE NULL AFTER father_name'),
  addColumn('employee_profiles', 'current_address', 'VARCHAR(500) NULL AFTER date_of_birth'),
  createTable('application_colony_preferences', COLONY_PREFERENCES_DDL),
  createTable('legacy_waiting_list', LEGACY_WAITING_LIST_DDL),
  addColumn('legacy_waiting_list', 'list_name', 'VARCHAR(60) NULL AFTER unit'),
  addColumn('legacy_waiting_list', 'staff_kind', 'VARCHAR(20) NULL AFTER list_name'),
  addColumn('legacy_waiting_list', 'present_accommodation', 'VARCHAR(255) NULL AFTER staff_kind'),
  addColumn('legacy_waiting_list', 'preferred_colonies', 'VARCHAR(500) NULL AFTER present_accommodation'),
  addColumn('legacy_waiting_list', 'contact_no', 'VARCHAR(30) NULL AFTER preferred_colonies'),
  addColumn('legacy_waiting_list', 'remarks', 'VARCHAR(500) NULL AFTER contact_no'),
  addColumn('legacy_waiting_list', 'list_order', 'INT UNSIGNED NULL AFTER remarks'),
  addIndex('legacy_waiting_list', 'lwl_list_index', 'list_name, list_order, request_date'),
  {
    name: 'legacy_waiting_list list_name backfill',
    async run() {
      const r = await query("UPDATE legacy_waiting_list SET list_name = CONCAT('Type-', quarter_type), staff_kind = 'staff' WHERE list_name IS NULL");
      return r.affectedRows > 0;
    },
  },
  // Clerk verification of employee profiles
  addColumn('employee_profiles', 'verification_status', "VARCHAR(30) NOT NULL DEFAULT 'pending' AFTER has_active_allotment"),
  addColumn('employee_profiles', 'verified_by', 'BIGINT UNSIGNED NULL AFTER verification_status'),
  addColumn('employee_profiles', 'verified_at', 'DATETIME NULL AFTER verified_by'),
  addColumn('employee_profiles', 'verification_remarks', 'TEXT NULL AFTER verified_at'),
  addIndex('employee_profiles', 'employee_profiles_verification_index', 'verification_status'),
  addForeignKey('employee_profiles', 'employee_profiles_verifier_fk', 'FOREIGN KEY (verified_by) REFERENCES users (id) ON DELETE SET NULL'),
  // Clerk -> admin approval flow
  addColumn('quarter_applications', 'forwarded_by', 'BIGINT UNSIGNED NULL AFTER priority_breakdown'),
  addColumn('quarter_applications', 'forwarded_at', 'DATETIME NULL AFTER forwarded_by'),
  addColumn('quarter_applications', 'forward_remarks', 'TEXT NULL AFTER forwarded_at'),
  addForeignKey('quarter_applications', 'qa_forwarded_fk', 'FOREIGN KEY (forwarded_by) REFERENCES users (id) ON DELETE SET NULL'),
  {
    // Applications made before ranked preferences existed: their single colony becomes the first choice.
    name: 'backfill application_colony_preferences',
    async run() {
      const res = await query(
        `INSERT INTO application_colony_preferences (quarter_application_id, priority, colony_name, created_at, updated_at)
         SELECT a.id, 1, TRIM(a.preferred_colony), NOW(), NOW()
           FROM quarter_applications a
          WHERE a.preferred_colony IS NOT NULL AND TRIM(a.preferred_colony) <> ''
            AND NOT EXISTS (SELECT 1 FROM application_colony_preferences p WHERE p.quarter_application_id = a.id)`,
      );
      return res.affectedRows > 0;
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
