import { createApp } from './app.js';
import { bootstrap } from './bootstrap.js';
import { config } from './config/index.js';
import { pool } from './db.js';

try {
  await pool.query('SELECT 1');
} catch (err) {
  console.error(`\n[rqms] Cannot connect to MySQL at ${config.db.host}:${config.db.port} (db "${config.db.database}") - ${err.code ?? err.message}`);
  console.error('       Check the DB_* / DATABASE_URL settings. On XAMPP start MySQL, then run:  npm run db:setup\n');
  process.exit(1);
}

try {
  await bootstrap();
} catch (err) {
  console.error(`[rqms] Bootstrap failed: ${err.message}`);
  process.exit(1);
}

const app = createApp();
app.listen(config.port, () => {
  console.log(`[rqms] API listening on http://localhost:${config.port}  (${config.env})`);
});
