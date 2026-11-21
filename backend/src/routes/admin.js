import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { find, insert, isDuplicateKey, query, scalar, transaction, update } from '../db.js';
import { requirePermission } from '../middleware/auth.js';
import { audit, subject } from '../services/audit.js';
import { HttpError, bool, idParam, optStr, reqStr, validate } from '../utils/http.js';
import { like, paginate } from '../utils/paginate.js';

const router = Router();
router.use(requirePermission('users.manage'));

const base = {
  name: reqStr('name', 120),
  email: reqStr('email').pipe(z.string().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'The email must be a valid email address.')),
  mobile: optStr('mobile', 20),
  is_active: bool,
  roles: z.preprocess((v) => (v === undefined ? [] : [].concat(v)), z.array(z.coerce.number().int())),
};
const createSchema = z.object({ ...base, password: reqStr('password', 255).pipe(z.string().min(8, 'The password must be at least 8 characters.')) });
const updateSchema = z.object({
  ...base,
  password: z.preprocess((v) => (v === '' || v === null ? undefined : v), z.string().min(8, 'The password must be at least 8 characters.').optional()),
});

const emailTaken = () => new HttpError(422, 'The email has already been taken.', { email: ['The email has already been taken.'] });

async function checkRoles(ids) {
  if (!ids.length) return;
  const found = await scalar('SELECT COUNT(*) FROM roles WHERE id IN (?)', [ids]);
  if (found !== new Set(ids).size) throw new HttpError(422, 'One of the selected roles is invalid.', { roles: ['One of the selected roles is invalid.'] });
}

async function syncRoles(userId, ids) {
  await query('DELETE FROM role_user WHERE user_id = ?', [userId]);
  for (const roleId of new Set(ids)) await query('INSERT INTO role_user (role_id, user_id) VALUES (?, ?)', [roleId, userId]);
}

// GET /api/admin/roles
router.get('/roles', async (_req, res) => {
  res.json({ roles: await query('SELECT id, slug, name FROM roles ORDER BY name') });
});

// GET /api/admin/users?q=
router.get('/users', async (req, res) => {
  const where = [];
  const params = [];
  if (req.query.q) { where.push('(u.name LIKE ? OR u.email LIKE ?)'); params.push(like(req.query.q), like(req.query.q)); }

  const result = await paginate(req, {
    perPage: 20,
    select: 'u.id, u.name, u.email, u.mobile, u.is_active',
    from: 'users u',
    where,
    params,
    orderBy: 'u.name',
  });
  const ids = result.data.map((u) => u.id);
  const roleRows = ids.length
    ? await query('SELECT ru.user_id, r.id, r.slug, r.name FROM role_user ru JOIN roles r ON r.id = ru.role_id WHERE ru.user_id IN (?) ORDER BY r.name', [ids])
    : [];
  result.data = result.data.map((u) => ({
    ...u,
    is_active: !!u.is_active,
    roles: roleRows.filter((r) => r.user_id === u.id).map(({ id, slug, name }) => ({ id, slug, name })),
  }));
  res.json(result);
});

// GET /api/admin/users/:id
router.get('/users/:id', async (req, res) => {
  const user = await find('users', idParam(req.params.id));
  if (!user) throw new HttpError(404, 'Not found.');
  const roles = await query('SELECT r.id, r.slug, r.name FROM roles r JOIN role_user ru ON ru.role_id = r.id WHERE ru.user_id = ?', [user.id]);
  res.json({ user: { id: user.id, name: user.name, email: user.email, mobile: user.mobile, is_active: !!user.is_active, roles } });
});

// POST /api/admin/users
router.post('/users', async (req, res) => {
  const data = validate(createSchema, req.body);
  await checkRoles(data.roles);
  const id = await transaction(async () => {
    let userId;
    try {
      userId = await insert('users', {
        name: data.name,
        email: data.email,
        mobile: data.mobile ?? null,
        password: await bcrypt.hash(data.password, 10),
        is_active: data.is_active ? 1 : 0,
      });
    } catch (err) {
      if (isDuplicateKey(err)) throw emailTaken();
      throw err;
    }
    await syncRoles(userId, data.roles);
    return userId;
  });
  await audit('user.create', subject('user', id), `User ${data.email} created`);
  res.status(201).json({ id, message: 'User created.' });
});

// PUT /api/admin/users/:id
router.put('/users/:id', async (req, res) => {
  const user = await find('users', idParam(req.params.id));
  if (!user) throw new HttpError(404, 'Not found.');
  const data = validate(updateSchema, req.body);
  await checkRoles(data.roles);

  await transaction(async () => {
    const fields = {
      name: data.name,
      email: data.email,
      mobile: data.mobile ?? null,
      is_active: data.is_active ? 1 : 0,
    };
    if (data.password) fields.password = await bcrypt.hash(data.password, 10);
    try {
      await update('users', user.id, fields);
    } catch (err) {
      if (isDuplicateKey(err)) throw emailTaken();
      throw err;
    }
    await syncRoles(user.id, data.roles);
  });
  await audit('user.update', subject('user', user.id), `User ${data.email} updated`);
  res.json({ message: 'User updated.' });
});

export default router;
