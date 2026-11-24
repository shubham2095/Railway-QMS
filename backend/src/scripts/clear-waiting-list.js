import { pool } from '../db.js';
import { clearLegacyWaitingList } from '../services/quarterImport.js';

try {
  console.log(`[waitlist] Removed ${await clearLegacyWaitingList()} pending requests.`);
} catch (err) {
  console.error(`[waitlist] Failed: ${err.code ?? ''} ${err.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
