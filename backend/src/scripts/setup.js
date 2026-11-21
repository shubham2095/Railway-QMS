import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';
import { config } from '../config/index.js';
import { pool } from '../db.js';
import { seedAll } from './seed.js';

const fresh = process.argv.includes('--fresh');
const noSeed = process.argv.includes('--no-seed');
const { host, port, user, password, database } = config.db;

try {
  // 1. Make sure the database exists.
  const admin = await mysql.createConnection({ host, port, user, password });
  await admin.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await admin.end();

  // 2. Create the tables (only if missing, unless --fresh).
  const conn = await mysql.createConnection({ host, port, user, password, database, multipleStatements: true });
  const [existing] = await conn.query("SHOW TABLES LIKE 'users'");
  if (fresh || existing.length === 0) {
    const schemaFile = path.join(config.root, '..', 'database', 'schema.sql');
    const sql = fs
      .readFileSync(schemaFile, 'utf8')
      .split('\n')
      .filter((line) => !/^\s*(CREATE DATABASE|USE)\b/i.test(line))
      .join('\n');
    await conn.query(sql);
    console.log(`[setup] Tables ${fresh ? 're-' : ''}created in database "${database}".`);
  } else {
    console.log(`[setup] Tables already exist in "${database}" - leaving data untouched (use "npm run db:fresh" to reset).`);
  }
  await conn.end();

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
