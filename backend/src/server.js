import { createApp } from './app.js';
import { bootstrap } from './bootstrap.js';
import { config } from './config/index.js';
import { pool } from './db.js';
import { state } from './state.js';

// NOTE: no top-level await in this file. Some hosts (LiteSpeed's lsnode on Hostinger) load the entry
// through require(), which cannot load an ES module graph that awaits at the top level.
// The server therefore starts listening immediately; API calls answer 503 until the database is ready.

state.ready = false;

const app = createApp();
app.listen(config.port, () => {
  console.log(`[rqms] API listening on http://localhost:${config.port}  (${config.env})`);
});

function fail(code, lines) {
  state.error = code;
  for (const line of lines) console.error(line);
  // In development stop right away; on a host keep the process alive so the error stays visible
  // (logs + /api/health) instead of ending in a restart loop.
  if (!config.isProd) process.exit(1);
}

(async () => {
  try {
    await pool.query('SELECT 1');
  } catch (err) {
    return fail(`database_unreachable (${err.code ?? 'error'})`, [
      `\n[rqms] Cannot connect to MySQL at ${config.db.host}:${config.db.port} (db "${config.db.database}") - ${err.code ?? err.message}`,
      '       Check the DB_* / DATABASE_URL settings. On XAMPP start MySQL, then run:  npm run db:setup\n',
    ]);
  }

  try {
    await bootstrap();
  } catch (err) {
    return fail(`bootstrap_failed (${err.code ?? 'error'})`, [`[rqms] Bootstrap failed: ${err.message}`]);
  }

  state.ready = true;
  console.log('[rqms] Ready.');
})();
