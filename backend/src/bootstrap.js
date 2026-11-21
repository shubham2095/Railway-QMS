import { config } from './config/index.js';
import { query, scalar } from './db.js';
import { applySchema } from './scripts/schema.js';
import { createSuperAdmin, seedAll, seedRolesAndPermissions } from './scripts/seed.js';

/**
 * First-run bootstrap for hosts without a shell (e.g. Hostinger Node.js apps). Enabled with AUTO_BOOTSTRAP=true:
 *   1. creates all tables if the `users` table does not exist yet,
 *   2. makes sure the roles / permission matrix exist (idempotent),
 *   3. when there are no users at all, creates a super admin from ADMIN_EMAIL / ADMIN_PASSWORD,
 *      and - only if SEED_DEMO=true - the demo accounts and sample data.
 * It never touches existing data.
 */
export async function bootstrap() {
  const { enabled, adminEmail, adminPassword, adminName, seedDemo } = config.bootstrap;
  if (!enabled) return;

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
