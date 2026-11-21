import fs from 'node:fs/promises';
import { Router } from 'express';
import { find, first } from '../db.js';
import { CERTIFICATE_TYPES } from '../domain.js';
import { certificatePath } from '../services/certificates.js';
import { HttpError, abortUnless, idParam } from '../utils/http.js';
import { paginate } from '../utils/paginate.js';

const router = Router();
const STAFF = ['quarter_clerk', 'estate_officer', 'admin', 'super_admin', 'electrical_dept', 'water_dept', 'accounts_dept'];

// GET /api/certificates
router.get('/', async (req, res) => {
  const user = req.user;
  const staff = user.hasRole(...STAFF);
  const where = [];
  const params = [];

  if (req.query.type) { where.push('c.type = ?'); params.push(String(req.query.type)); }

  // Employees see only certificates tied to their own allotments / vacations.
  if (!staff) {
    const pid = user.profile?.id ?? 0;
    where.push(`(
      (c.certifiable_type = 'allotment' AND c.certifiable_id IN (SELECT id FROM allotments WHERE employee_profile_id = ?))
      OR (c.certifiable_type = 'vacation_request' AND c.certifiable_id IN (SELECT id FROM vacation_requests WHERE employee_profile_id = ?))
    )`);
    params.push(pid, pid);
  }

  const result = await paginate(req, {
    perPage: 15,
    select: 'c.id, c.type, c.number, c.issued_at, c.is_signed, u.name AS issuer_name',
    from: 'certificates c LEFT JOIN users u ON u.id = c.issued_by',
    where,
    params,
    orderBy: 'c.issued_at DESC, c.id DESC',
    map: (r) => ({ ...r, is_signed: !!r.is_signed }),
  });
  res.json({ ...result, types: Object.keys(CERTIFICATE_TYPES) });
});

async function authorizeCertificate(req) {
  const cert = await find('certificates', idParam(req.params.id));
  if (!cert) throw new HttpError(404, 'Not found.');
  if (req.user.hasRole(...STAFF)) return cert;

  const table = { allotment: 'allotments', vacation_request: 'vacation_requests' }[cert.certifiable_type];
  const owner = table ? await first(`SELECT employee_profile_id FROM ${table} WHERE id = ?`, [cert.certifiable_id]) : null;
  abortUnless(owner && owner.employee_profile_id === req.user.profile?.id);
  return cert;
}

async function readFile(cert) {
  if (!cert.file_path) throw new HttpError(404, 'Rendered certificate file not found.');
  try {
    return await fs.readFile(certificatePath(cert.file_path), 'utf8');
  } catch {
    throw new HttpError(404, 'Rendered certificate file not found.');
  }
}

// GET /api/certificates/:id/view  - rendered HTML (opens in a new tab)
router.get('/:id/view', async (req, res) => {
  const cert = await authorizeCertificate(req);
  res.type('html').send(await readFile(cert));
});

// GET /api/certificates/:id/download
router.get('/:id/download', async (req, res) => {
  const cert = await authorizeCertificate(req);
  const html = await readFile(cert);
  res.set('Content-Disposition', `attachment; filename="${cert.number.replaceAll('/', '-')}.html"`);
  res.type('html').send(html);
});

export default router;
