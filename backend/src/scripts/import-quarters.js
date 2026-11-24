import { pool } from '../db.js';
import { runMigrations } from '../migrations.js';
import { importAllQuarterMasterData, importWaitingListData } from '../services/quarterImport.js';

try {
  await runMigrations();
  const results = await importAllQuarterMasterData();
  if (!results.length) console.log('[quarters] No database/data/quarters-type*.json files found.');
  for (const r of results) console.log(`[quarters] Type ${r.type}: ${r.total} quarters synced.`);
  for (const r of await importWaitingListData()) console.log(`[waitlist] ${r.file}: ${r.total} requests synced.`);
} catch (err) {
  console.error(`[quarters] Failed: ${err.code ?? ''} ${err.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
