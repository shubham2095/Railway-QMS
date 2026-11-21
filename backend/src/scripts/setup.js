import mysql from 'mysql2/promise';
import { config } from '../config/index.js';
import { pool } from '../db.js';
import { applySchema, ensureDatabaseExists } from './schema.js';
import { seedAll } from './seed.js';

const fresh = process.argv.includes('--fresh');
const noSeed = process.argv.includes('--no-seed');
const { host, port, user, password, database } = config.db;

try {
  // 1. Make sure the database exists (skipped silently on shared hosting).
  await ensureDatabaseExists();

  // 2. Create the tables (only if missing, unless --fresh).
  const conn = await mysql.createConnection({ host, port, user, password, database });
  const [existing] = await conn.query("SHOW TABLES LIKE 'users'");
  await conn.end();
  if (fresh || existing.length === 0) {
    await applySchema();
    console.log(`[setup] Tables ${fresh ? 're-' : ''}created in database "${database}".`);
  } else {
    console.log(`[setup] Tables already exist in "${database}" - leaving data untouched (use "npm run db:fresh" to reset).`);
  }

  // 3. Seed roles/permissions (always safe) and demo data when the DB is empty.
  const [{ n }] = (await pool.query('SELECT COUNT(*) AS n FROM users'))[0];
  if (!noSeed && (fresh || n === 0)) {
    await seedAll();
    console.log('[setup] Seeded roles, permissions and demo data. All demo accounts use the password: password');
  }
  console.log('[setup] Done.');
} catch (err) {
  console.error(`[setup] Failed: ${err.code ?? ''} ${err.message}`);
  if (err.code === 'ECONNREFUSED') console.error('        Is MySQL running? Start it from the XAMPP Control Panel.');
  process.exitCode = 1;
} finally {
  await pool.end();
}
