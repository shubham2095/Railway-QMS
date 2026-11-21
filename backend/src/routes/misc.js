import { Router } from 'express';
import { query } from '../db.js';
import { requirePermission, requireRole } from '../middleware/auth.js';
import { parseJson } from '../utils/helpers.js';
import { like, paginate } from '../utils/paginate.js';

export const notifications = Router();
export const reports = Router();
export const audit = Router();

// ---- Module 12: notifications ----
notifications.get('/', async (req, res) => {
  const isAdmin = req.user.hasRole('admin', 'super_admin');
  const where = [];
  const params = [];
  if (!isAdmin) { where.push('n.user_id = ?'); params.push(req.user.id); }
  if (req.query.channel) { where.push('n.channel = ?'); params.push(String(req.query.channel)); }

  const result = await paginate(req, {
    perPage: 20,
    select: 'n.id, n.channel, n.event, n.title, n.message, n.status, n.sent_at, n.created_at, u.name AS user_name',
    from: 'notification_logs n LEFT JOIN users u ON u.id = n.user_id',
    where,
    params,
    orderBy: 'n.id DESC',
  });
  res.json({ ...result, is_admin: isAdmin });
});

// ---- Module 13: reports & MIS ----
const grouped = (rows, key) => {
  const out = {};
  for (const r of rows) (out[r[key] ?? ''] ??= []).push({ status: r.status, total: r.total });
  return out;
};
const countMap = async (table) =>
  Object.fromEntries((await query(`SELECT status, COUNT(*) AS total FROM ${table} GROUP BY status`)).map((r) => [r.status, r.total]));

reports.get('/', requirePermission('reports.view'), async (_req, res) => {
  res.json({
    type_wise: grouped(await query('SELECT quarter_type, status, COUNT(*) AS total FROM quarters GROUP BY quarter_type, status ORDER BY quarter_type'), 'quarter_type'),
    station_wise: grouped(await query('SELECT station, status, COUNT(*) AS total FROM quarters GROUP BY station, status ORDER BY station'), 'station'),
    application_status: await countMap('quarter_applications'),
    allotment_status: await countMap('allotments'),
    vacation_status: await countMap('vacation_requests'),
    retirement_status: await countMap('retirement_records'),
  });
});

// ---- Module 14: audit trail ----
audit.get('/', requireRole('admin', 'super_admin'), async (req, res) => {
  const where = [];
  const params = [];
  if (req.query.action) { where.push('l.action LIKE ?'); params.push(like(req.query.action)); }
  if (req.query.user_id) { where.push('l.user_id = ?'); params.push(Number(req.query.user_id) || 0); }

  const result = await paginate(req, {
    perPage: 30,
    select: 'l.id, l.action, l.auditable_type, l.auditable_id, l.description, l.properties, l.ip_address, l.created_at, l.user_id, u.name AS user_name',
    from: 'audit_logs l LEFT JOIN users u ON u.id = l.user_id',
    where,
    params,
    orderBy: 'l.created_at DESC, l.id DESC',
    map: (r) => ({ ...r, properties: parseJson(r.properties) }),
  });
  const actions = (await query('SELECT DISTINCT action FROM audit_logs ORDER BY action')).map((r) => r.action);
  res.json({ ...result, actions });
});
