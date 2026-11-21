import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { config } from '../config/index.js';
import { find, first, insert, query } from '../db.js';
import { QUARTER_TYPES, APPLICATION_STATUSES } from '../domain.js';
import { requirePermission } from '../middleware/auth.js';
import * as applications from '../services/applications.js';
import { DomainError, HttpError, abortUnless, bool, idParam, optInt, optStr, reqEnum, reqStr, validate } from '../utils/http.js';
import { parseJson } from '../utils/helpers.js';
import { isProfileComplete, missingProfileFields } from '../services/profile.js';
import { preferencesFor } from '../services/colonyPreferences.js';
import { paginate } from '../utils/paginate.js';

const router = Router();

// ---- file uploads (Module 15): PDF / JPG / PNG up to 5 MB each ----
const uploadDir = path.join(config.storageDir, 'application_documents');
fs.mkdirSync(uploadDir, { recursive: true });
const ALLOWED = { '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' };

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_req, file, cb) => cb(null, `${crypto.randomBytes(20).toString('hex')}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED[ext]) return cb(new HttpError(422, `The file "${file.originalname}" must be a file of type: pdf, jpg, jpeg, png.`, { documents: ['Only pdf, jpg, jpeg and png files are allowed.'] }));
    cb(null, true);
  },
});

const createSchema = z.object({
  preferred_quarter_type: reqEnum('preferred quarter type', QUARTER_TYPES),
  // Up to 3 colonies in order of priority. The 1st choice is required; no gaps, no repeats.
  colony_1: reqStr('first choice colony', 255),
  colony_2: optStr('second choice colony', 255),
  colony_3: optStr('third choice colony', 255),
  station: optStr('station'),
  division: optStr('division'),
  family_size: optInt('family size', { min: 1, max: 30 }),
  medical_ground: bool,
  special_grounds: optStr('special grounds', 2000),
}).superRefine((d, ctx) => {
  const picks = [d.colony_1, d.colony_2, d.colony_3];
  if (d.colony_3 && !d.colony_2) {
    ctx.addIssue({ code: 'custom', path: ['colony_3'], message: 'Choose the second choice colony before the third.' });
  }
  const seen = new Set();
  picks.forEach((name, i) => {
    if (!name) return;
    const key = name.toLowerCase();
    if (seen.has(key)) ctx.addIssue({ code: 'custom', path: [`colony_${i + 1}`], message: `"${name}" is already chosen - each choice must be a different colony.` });
    seen.add(key);
  });
});

const decideSchema = z.object({
  decision: reqEnum('decision', ['approve', 'reject']),
  remarks: optStr('remarks', 1000),
});

const isStaff = (u) => u.hasPermission('application.verify') || u.hasPermission('application.decide') || u.hasRole('admin', 'super_admin');

const loadApplication = async (id) => {
  const app = await find('quarter_applications', idParam(id));
  if (!app) throw new HttpError(404, 'Not found.');
  return app;
};

// GET /api/applications
router.get('/', async (req, res) => {
  const user = req.user;
  const staff = isStaff(user);
  const where = [];
  const params = [];

  if (!staff) {
    where.push('a.employee_profile_id = ?');
    params.push(user.profile?.id ?? 0);
  } else {
    if (req.query.status) { where.push('a.status = ?'); params.push(String(req.query.status)); }
    if (req.query.type) { where.push('a.preferred_quarter_type = ?'); params.push(String(req.query.type)); }
  }

  const result = await paginate(req, {
    perPage: 15,
    select: `a.id, a.reference_no, a.preferred_quarter_type, a.station, a.applied_at, a.priority_score, a.status,
             u.name AS employee_name, p.employee_id, w.\`rank\` AS \`rank\``,
    from: `quarter_applications a
           JOIN employee_profiles p ON p.id = a.employee_profile_id
           JOIN users u ON u.id = p.user_id
           LEFT JOIN waiting_list_entries w ON w.quarter_application_id = a.id`,
    where,
    params,
    orderBy: 'a.applied_at DESC, a.id DESC',
  });
  res.json({ ...result, is_staff: staff, statuses: APPLICATION_STATUSES, types: QUARTER_TYPES });
});

// POST /api/applications  (multipart: fields + documents[] + document_categories[])
router.post('/', upload.array('documents', 10), async (req, res) => {
  const files = req.files ?? [];
  try {
    const profile = req.user.profile;
    if (!isProfileComplete(profile)) {
      const msg = `Please complete your profile first (missing: ${missingProfileFields(profile).join(', ')}).`;
      throw new HttpError(422, msg, { profile: [msg] });
    }
    const data = validate(createSchema, req.body);
    data.colonies = [data.colony_1, data.colony_2, data.colony_3].filter(Boolean);

    const application = await applications.submitApplication(profile, req.user, data);

    // Module 3 / 15 - store uploaded supporting documents against the application.
    const cats = [].concat(req.body.document_categories ?? []);
    for (const [i, file] of files.entries()) {
      const hash = crypto.createHash('sha256').update(await fsp.readFile(file.path)).digest('hex');
      await insert('documents', {
        documentable_type: 'application',
        documentable_id: application.id,
        category: cats[i] || 'supporting_document',
        title: file.originalname,
        original_name: file.originalname,
        path: `application_documents/${file.filename}`,
        disk: 'local',
        mime: ALLOWED[path.extname(file.originalname).toLowerCase()] ?? file.mimetype,
        size: file.size,
        hash,
        uploaded_by: req.user.id,
      });
    }
    res.status(201).json({ id: application.id, reference_no: application.reference_no, message: `Application ${application.reference_no} submitted.` });
  } catch (err) {
    await Promise.all(files.map((f) => fsp.unlink(f.path).catch(() => {})));
    throw err;
  }
});

// GET /api/applications/:id
router.get('/:id', async (req, res) => {
  const app = await loadApplication(req.params.id);
  abortUnless(isStaff(req.user) || app.employee_profile_id === req.user.profile?.id);

  const owner = await first(
    `SELECT u.name, p.employee_id FROM employee_profiles p JOIN users u ON u.id = p.user_id WHERE p.id = ?`,
    [app.employee_profile_id],
  );
  const profileRow = await find('employee_profiles', app.employee_profile_id);
  const entry = await first('SELECT `rank` FROM waiting_list_entries WHERE quarter_application_id = ?', [app.id]);
  const documents = await query(
    `SELECT id, category, title, original_name, mime, size, created_at FROM documents
      WHERE documentable_type = 'application' AND documentable_id = ? ORDER BY id`,
    [app.id],
  );
  const allotment = await first(
    `SELECT al.id, al.allotment_order_no, al.status, q.quarter_number
       FROM allotments al JOIN quarters q ON q.id = al.quarter_id WHERE al.quarter_application_id = ?`,
    [app.id],
  );

  res.json({
    application: {
      ...app,
      medical_ground: !!app.medical_ground,
      eligibility_result: parseJson(app.eligibility_result),
      priority_breakdown: parseJson(app.priority_breakdown),
      employee_name: owner?.name ?? null,
      employee_id: owner?.employee_id ?? null,
      rank: entry?.rank ?? null,
      colony_preferences: (await preferencesFor([app.id])).get(app.id) ?? [],
      profile_id: app.employee_profile_id,
      profile_verification_status: profileRow?.verification_status ?? null,
    },
    documents,
    allotment,
  });
});

// POST /api/applications/:id/verify
router.post('/:id/verify', requirePermission('application.verify'), async (req, res) => {
  const app = await loadApplication(req.params.id);
  if (app.status !== 'submitted') throw new DomainError('Only submitted applications can be verified.', 'status');
  // The clerk checks the employee's details first, then the application.
  const owner = await find('employee_profiles', app.employee_profile_id);
  if (owner?.verification_status !== 'verified') {
    throw new DomainError("Verify the employee's profile first (Employees → open the profile → Verify).", 'profile');
  }
  await applications.verifyApplication(app, req.user);
  res.json({ message: 'Verified. Eligibility & priority engine has run.' });
});

// POST /api/applications/:id/reject   { remarks }  - the clerk's check failed
router.post('/:id/reject', requirePermission('application.verify'), async (req, res) => {
  const app = await loadApplication(req.params.id);
  const { remarks } = validate(z.object({ remarks: reqStr('remarks', 1000) }), req.body);
  if (app.status !== 'submitted') throw new DomainError('Only submitted applications can be rejected by the clerk.', 'status');
  await applications.rejectApplication(app, req.user, remarks);
  res.json({ message: 'Application rejected.' });
});

// POST /api/applications/:id/run-engine
router.post('/:id/run-engine', requirePermission('application.verify'), async (req, res) => {
  const app = await loadApplication(req.params.id);
  if (!['verified', 'eligible', 'ineligible', 'waitlisted'].includes(app.status)) {
    throw new DomainError('The engine can only be re-run for verified, eligible, ineligible or waitlisted applications.', 'status');
  }
  await applications.runEngine(app.id);
  res.json({ message: 'Engine re-evaluated.' });
});

// POST /api/applications/:id/decide
router.post('/:id/decide', requirePermission('application.decide'), async (req, res) => {
  const app = await loadApplication(req.params.id);
  const data = validate(decideSchema, req.body);
  if (!['verified', 'eligible', 'waitlisted'].includes(app.status)) {
    throw new DomainError('A decision can only be recorded for verified or waitlisted applications.', 'status');
  }
  await applications.decideApplication(app, req.user, data.decision === 'approve', data.remarks ?? null);
  res.json({ message: 'Decision recorded.' });
});

export default router;
