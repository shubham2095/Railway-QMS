import { pool } from '../db.js';
import { createSuperAdmin } from './seed.js';

// npm run db:admin -- admin@example.com "StrongPassword" "Full Name"
const [email, password, name] = process.argv.slice(2);

try {
  if (!email || !password || password.length < 8) {
    throw new Error('Usage: npm run db:admin -- <email> <password (min 8 chars)> ["Full Name"]');
  }
  await createSuperAdmin({ email, password, name: name || 'Administrator' });
  console.log(`[admin] Super admin ${email} is ready.`);
} catch (err) {
  console.error('[admin]', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
