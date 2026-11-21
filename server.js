// Entry file for hosts that expect `node server.js` at the repository root (e.g. Hostinger Node.js Web Apps).
//
// This file is deliberately CommonJS: LiteSpeed's Node launcher (lsnode.js) loads the entry with require(),
// and a dynamic import() is the one way that works for every launcher to start the ES-module backend.
import('./backend/src/server.js').catch((err) => {
  console.error('[rqms] Failed to start:', err);
  process.exit(1);
});
