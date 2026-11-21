import bcrypt from 'bcryptjs';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { first, insert, isDuplicateKey, query, scalar, transaction } from '../db.js';
import { config } from '../config/index.js';
import { currentContext } from '../context.js';
import { STEP_FOR_ROLE } from '../domain.js';
import { authenticate, clearSession, issueSession, loadAuthUser, resolveSession } from '../middleware/auth.js';
import { audit, subject } from '../services/audit.js';
import { HttpError, optStr, reqStr, validate } from '../utils/http.js';

const router = Router();

// Compared against when the account does not exist, so response time doesn't reveal valid logins.
const DUMMY_HASH = bcrypt.hashSync('rqms-dummy-password', 10);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: process.env.NODE_ENV === 'test' ? 10_000 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many login attempts. Please try again later.' },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: process.env.NODE_ENV === 'test' ? 10_000 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many sign-ups from this address. Please try again later.' },
});

const registerSchema = z
  .object({
    name: reqStr('name', 120),
    email: reqStr('email').pipe(z.string().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'The email must be a valid email address.')),
    mobile: optStr('mobile', 20),
    // bcrypt only uses the first 72 bytes, so refuse longer passwords instead of silently truncating
    password: reqStr('password', 72).pipe(z.string().min(8, 'The password must be at least 8 characters.')),
    password_confirmation: reqStr('password confirmation', 72),
  })
  .refine((d) => d.password === d.password_confirmation, {
    message: 'The password confirmation does not match.',
    path: ['password_confirmation'],
  });

/** Everything the SPA needs about the signed-in user (+ sidebar work badges). */
export async function mePayload(user) {
  const badges = { applications_to_verify: 0, applications_to_decide: 0, clearances_for_me: 0 };

  if (user.hasPermission('application.verify')) {
    badges.applications_to_verify = await scalar("SELECT COUNT(*) FROM quarter_applications WHERE status = 'submitted'");
  }
  if (user.hasPermission('application.decide')) {
    badges.applications_to_decide = await scalar("SELECT COUNT(*) FROM quarter_applications WHERE status = 'waitlisted'");
  }
  for (const [role, step] of Object.entries(STEP_FOR_ROLE)) {
    if (user.hasRole(role)) {
      badges.clearances_for_me += await scalar(
        "SELECT COUNT(*) FROM vacation_requests WHERE status = 'in_clearance' AND current_step = ?",
        [step],
      );
    }
  }

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      mobile: user.mobile,
      roles: user.roles,
      permissions: user.permissions,
      profile: user.profile,
    },
    badges,
  };
}

// Public feature flags for the login / signup pages.
router.get('/config', (_req, res) => res.json({ signup: config.auth.allowSignup }));

// Employee self-registration. The role is fixed server-side: a client can never choose its own role.
router.post('/register', registerLimiter, async (req, res) => {
  if (!config.auth.allowSignup) {
    throw new HttpError(403, 'Self-registration is disabled. Please contact the Estate Office for an account.');
  }
  const data = validate(registerSchema, req.body);

  const role = await first("SELECT id FROM roles WHERE slug = 'employee'");
  if (!role) throw new HttpError(500, 'Registration is not available yet: the employee role has not been set up.');

  const userId = await transaction(async () => {
    let id;
    try {
      id = await insert('users', {
        name: data.name,
        email: data.email,
        mobile: data.mobile ?? null,
        password: await bcrypt.hash(data.password, 10),
        is_active: 1,
      });
    } catch (err) {
      if (isDuplicateKey(err)) {
        throw new HttpError(422, 'An account with this email already exists.', { email: ['An account with this email already exists.'] });
      }
      throw err;
    }
    await query('INSERT INTO role_user (role_id, user_id) VALUES (?, ?)', [role.id, id]);
    return id;
  });

  issueSession(res, userId);
  currentContext().user = { id: userId };
  await audit('auth.register', subject('user', userId), 'Employee self-registered');

  res.status(201).json(await mePayload(await loadAuthUser(userId)));
});

router.post('/login', loginLimiter, async (req, res) => {
  const data = validate(z.object({ email: reqStr('email'), password: reqStr('password', 255) }), req.body);

  // Allow login by email OR employee number.
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email);
  const row = isEmail
    ? await first('SELECT * FROM users WHERE email = ?', [data.email])
    : await first(
        'SELECT u.* FROM users u JOIN employee_profiles p ON p.user_id = u.id WHERE p.employee_id = ?',
        [data.email],
      );

  const valid = await bcrypt.compare(data.password, row ? row.password : DUMMY_HASH);
  if (!row || !valid) {
    throw new HttpError(422, 'The provided credentials do not match our records.', {
      email: ['The provided credentials do not match our records.'],
    });
  }
  if (!row.is_active) {
    throw new HttpError(422, 'This account is inactive. Please contact the administrator.', {
      email: ['This account is inactive. Please contact the administrator.'],
    });
  }

  issueSession(res, row.id);
  currentContext().user = { id: row.id };
  await audit('auth.login', subject('user', row.id), 'User signed in');

  res.json(await mePayload(await loadAuthUser(row.id)));
});

router.post('/logout', authenticate, async (req, res) => {
  await audit('auth.logout', subject('user', req.user.id), 'User signed out');
  clearSession(res);
  res.json({ message: 'You have been signed out.' });
});

// Returns { user: null } (HTTP 200) when signed out so the SPA can boot without a console error.
router.get('/me', async (req, res) => {
  const user = await resolveSession(req, res);
  res.json(user ? await mePayload(user) : { user: null, badges: {} });
});

export default router;
