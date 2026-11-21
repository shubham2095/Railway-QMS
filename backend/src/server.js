import { createApp } from './app.js';
import { config } from './config/index.js';
import { pool } from './db.js';

try {
  await pool.query('SELECT 1');
} catch (err) {
  console.error(`\n[rqms] Cannot connect to MySQL at ${config.db.host}:${config.db.port} (db "${config.db.database}") - ${err.code ?? err.message}`);
  console.error('       Start MySQL in the XAMPP Control Panel, then run:  npm run db:setup\n');
  process.exit(1);
}

const app = createApp();
app.listen(config.port, () => {
  console.log(`[rqms] API listening on http://localhost:${config.port}  (${config.env})`);
});
