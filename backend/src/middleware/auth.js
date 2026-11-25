import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { first, query } from '../db.js';
import { currentContext } from '../context.js';
import { HttpError } from '../utils/http.js';

/** Load a user with roles, permissions and employee profile. */
export async function loadAuthUser(id) {
  const user = await first('SELECT id, name, email, mobile, is_active FROM users WHERE id = ?', [id]);
  if (!user) return null;

  const roles = (
    await query('SELECT r.slug FROM roles r JOIN role_user ru ON ru.role_id = r.id WHERE ru.user_id = ?', [id])
  ).map((r) => r.slug);

  const permissions = (
    await query(
      `SELECT DISTINCT p.slug
         FROM permissions p
         JOIN permission_role pr ON pr.permission_id = p.id
         JOIN role_user ru ON ru.role_id = pr.role_id
        WHERE ru.user_id = ?`,
      [id],
    )
  ).map((r) => r.slug);

  const profile = await first('SELECT * FROM employee_profiles WHERE user_id = ?', [id]);
  if (profile) profile.has_active_allotment = !!profile.has_active_allotment;

  return {
    ...user,
    is_active: !!user.is_active,
    roles,
    permissions,
    profile,
    hasRole: (...slugs) => slugs.some((s) => roles.includes(s)),
    // super_admin shortcut - full access (mirrors the Laravel HasRoles trait)
    hasPermission: (slug) => roles.includes('super_admin') || permissions.includes(slug),
  };
}

export function issueSession(res, userId) {
  const token = jwt.sign({ sub: userId }, config.auth.jwtSecret, { expiresIn: `${config.auth.sessionMinutes}m` });
  res.cookie(config.auth.cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.auth.cookieSecure,
    maxAge: config.auth.sessionMinutes * 60 * 1000,
    path: '/',
  });
}

export const clearSession = (res) =>
  res.clearCookie(config.auth.cookieName, { httpOnly: true, sameSite: 'lax', secure: config.auth.cookieSecure, path: '/' });

/**
 * Resolve the user from the session cookie (null when absent/invalid/inactive) and refresh
 * the cookie while the user is active (sliding session).
 */
export async function resolveSession(req, res) {
  const token = req.cookies?.[config.auth.cookieName];
  if (!token) return null;

  let payload;
  try {
    payload = jwt.verify(token, config.auth.jwtSecret);
  } catch {
    clearSession(res);
    return null;
  }

  const user = await loadAuthUser(payload.sub);
  if (!user || !user.is_active) {
    clearSession(res);
    return null;
  }

  req.user = user;
  currentContext().user = user;
  if (Date.now() / 1000 - payload.iat > 300) issueSession(res, user.id);
  return user;
}

/** Requires a valid session; attaches req.user. */
export async function authenticate(req, res, next) {
  if (!(await resolveSession(req, res))) throw new HttpError(401, 'Unauthenticated.');
  next();
}

export const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user.hasRole(...roles)) throw new HttpError(403, 'Insufficient role for this action.');
  next();
};

/** Everybody except the super admin may apply for a quarter (employees, admins, the clerk, the department desks). */
export const requireApplicant = (req, _res, next) => {
  if (req.user.hasRole('super_admin') || !req.user.roles.length) throw new HttpError(403, 'The super admin does not apply for quarters.');
  next();
};

export const requirePermission = (permission) => (req, _res, next) => {
  if (!req.user.hasPermission(permission)) {
    throw new HttpError(403, 'You do not have permission to perform this action.');
  }
  next();
};
