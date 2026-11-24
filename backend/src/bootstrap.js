import { config } from './config/index.js';
import { pool, query, scalar } from './db.js';
import { runMigrations } from './migrations.js';
import { applySchema } from './scripts/schema.js';
import { importAllQuarterMasterData, importWaitingListData } from './services/quarterImport.js';
import { createSuperAdmin, seedAll, seedRolesAndPermissions } from './scripts/seed.js';

/**
 * First-run bootstrap for hosts without a shell (e.g. Hostinger Node.js apps). Enabled with AUTO_BOOTSTRAP=true:
 *   1. creates all tables if the `users` table does not exist yet,
 *   2. makes sure the roles / permission matrix exist (idempotent),
 *   3. when there are no users at all, creates a super admin from ADMIN_EMAIL / ADMIN_PASSWORD,
 *      and - only if SEED_DEMO=true - the demo accounts and sample data.
 * It never touches existing data.
 */
const LOCK_NAME = 'rqms_bootstrap';

/**
 * Hosts such as Hostinger's LiteSpeed launcher may start several instances of the app at the same moment.
 * A MySQL advisory lock makes sure only one of them runs the bootstrap; the others wait, then find
 * everything already in place and carry on.
 */
async function withBootstrapLock(fn) {
  const conn = await pool.getConnection();
  try {
    const [[row]] = await conn.query('SELECT GET_LOCK(?, 120) AS got', [LOCK_NAME]);
    if (!row.got) throw new Error('Timed out waiting for another instance to finish the first-run setup.');
    try {
      return await fn();
    } finally {
      await conn.query('SELECT RELEASE_LOCK(?)', [LOCK_NAME]).catch(() => {});
    }
  } finally {
    conn.release();
  }
}

/**
 * Runs at every start. Under one lock (several instances may start together):
 *   1. optional first-run bootstrap (AUTO_BOOTSTRAP=true),
 *   2. schema migrations for databases created by an older version.
 */
export async function bootstrap() {
  await withBootstrapLock(async () => {
    if (config.bootstrap.enabled) await runBootstrap();
    const applied = await runMigrations();
    if (applied.length) console.log(`[migrate] Applied: ${applied.join(', ')}`);
    // The role -> permission matrix lives in code (seed.js); keep the database in step with it so that a
    // new permission reaches existing installs too. (There is no screen that edits permissions by hand.)
    const [hasUsers] = await query("SHOW TABLES LIKE 'users'");
    if (hasUsers) await seedRolesAndPermissions();
    if (config.bootstrap.importQuarters && hasUsers) {
      for (const r of await importAllQuarterMasterData()) console.log(`[quarters] Type ${r.type}: ${r.total} quarters synced from master data.`);
      for (const r of await importWaitingListData()) console.log(`[waitlist] ${r.file}: ${r.total} requests synced.`);
    }
  });
}

async function runBootstrap() {
  const { adminEmail, adminPassword, adminName, seedDemo } = config.bootstrap;

  const [hasUsersTable] = await query("SHOW TABLES LIKE 'users'");
  if (!hasUsersTable) {
    await applySchema();
    console.log(`[bootstrap] Created tables in database "${config.db.database}".`);
  }

  await seedRolesAndPermissions();

  if ((await scalar('SELECT COUNT(*) FROM users')) > 0) return;

  if (seedDemo) {
    await seedAll();
    console.warn('[bootstrap] SEED_DEMO=true: demo accounts were created with the password "password". Do NOT keep these on a public site.');
  }

  if (!adminEmail || adminPassword.length < 8) {
    if (seedDemo) return;
    console.warn('[bootstrap] No users exist yet. Set ADMIN_EMAIL and ADMIN_PASSWORD (min 8 characters) and restart to create the first super admin.');
    return;
  }
  await createSuperAdmin({ email: adminEmail, password: adminPassword, name: adminName });
  console.log(`[bootstrap] Created super admin ${adminEmail}. Sign in, then remove ADMIN_PASSWORD from the environment.`);
}
