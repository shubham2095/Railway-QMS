import path from 'node:path';
import { Router } from 'express';
import { config } from '../config/index.js';
import { find } from '../db.js';
import { HttpError, abortUnless, idParam } from '../utils/http.js';
import { first } from '../db.js';

const router = Router();

// GET /api/documents/:id  - download an uploaded document (Module 15)
router.get('/:id', async (req, res) => {
  const doc = await find('documents', idParam(req.params.id));
  if (!doc) throw new HttpError(404, 'Not found.');

  const user = req.user;
  let allowed = user.hasPermission('application.verify') || user.hasPermission('application.decide') || user.hasRole('admin', 'super_admin');
  if (!allowed && doc.documentable_type === 'application') {
    const app = await first('SELECT employee_profile_id FROM quarter_applications WHERE id = ?', [doc.documentable_id]);
    allowed = app?.employee_profile_id === user.profile?.id;
  }
  abortUnless(allowed);

  const base = path.join(config.storageDir, 'application_documents');
  const full = path.resolve(config.storageDir, doc.path);
  if (!full.startsWith(base + path.sep)) throw new HttpError(404, 'Not found.');
  res.download(full, doc.original_name, (err) => {
    if (err && !res.headersSent) res.status(404).json({ message: 'File not found.' });
  });
});

export default router;
