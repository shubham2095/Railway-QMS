import { z } from 'zod';

export class HttpError extends Error {
  constructor(status, message, errors) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

/** Business-rule violation -> HTTP 422 with the message attached to a field. */
export class DomainError extends HttpError {
  constructor(message, field = 'general') {
    super(422, message, { [field]: [message] });
  }
}

export const abort = (status, message) => {
  throw new HttpError(status, message);
};
export const abortUnless = (cond, status = 403, message = 'This action is unauthorized.') => {
  if (!cond) throw new HttpError(status, message);
};

/** Validate with a zod schema; throws a 422 with Laravel-style `errors` on failure. */
export function validate(schema, data) {
  const result = schema.safeParse(data ?? {});
  if (result.success) return result.data;
  const errors = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || 'general';
    (errors[key] ??= []).push(issue.message);
  }
  const first = Object.values(errors)[0][0];
  throw new HttpError(422, first, errors);
}

// ---------- zod building blocks ----------
const blankToUndef = (v) => (v === '' || v === null ? undefined : v);

export const reqStr = (label, max = 255) =>
  z.preprocess(
    (v) => (typeof v === 'string' ? v.trim() : v),
    z
      .string({ error: `The ${label} field is required.` })
      .min(1, `The ${label} field is required.`)
      .max(max, `The ${label} must not be greater than ${max} characters.`),
  );

export const optStr = (label, max = 255) =>
  z.preprocess(
    (v) => (typeof v === 'string' ? blankToUndef(v.trim()) : blankToUndef(v)),
    z.string({ error: `The ${label} must be a string.` }).max(max, `The ${label} must not be greater than ${max} characters.`).optional(),
  );

export const optInt = (label, { min, max } = {}) =>
  z.preprocess(
    blankToUndef,
    z.coerce
      .number({ error: `The ${label} must be an integer.` })
      .int(`The ${label} must be an integer.`)
      .min(min ?? -Infinity, `The ${label} must be at least ${min}.`)
      .max(max ?? Infinity, `The ${label} must not be greater than ${max}.`)
      .optional(),
  );

export const optNum = (label, { min } = {}) =>
  z.preprocess(
    blankToUndef,
    z.coerce.number({ error: `The ${label} must be a number.` }).min(min ?? -Infinity, `The ${label} must be at least ${min}.`).optional(),
  );

const isRealDate = (s) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};
export const optDate = (label) =>
  z.preprocess(
    (v) => (typeof v === 'string' ? blankToUndef(v.trim().slice(0, 10)) : blankToUndef(v)),
    z.string().refine(isRealDate, `The ${label} is not a valid date.`).optional(),
  );
export const reqDate = (label) =>
  z.preprocess(
    (v) => (typeof v === 'string' ? v.trim().slice(0, 10) : v),
    z.string({ error: `The ${label} field is required.` }).refine(isRealDate, `The ${label} is not a valid date.`),
  );

/** checkbox-ish boolean: true / 'true' / '1' / 1 / 'on'; missing => false */
export const bool = z.preprocess(
  (v) => v === true || v === 'true' || v === '1' || v === 1 || v === 'on',
  z.boolean(),
);

export const reqEnum = (label, values) =>
  z.enum(values, { error: `The selected ${label} is invalid.` });

export const idParam = (v) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw new HttpError(404, 'Not found.');
  return n;
};

// ---------- pagination ----------
export function pageParams(req, perPage) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  return { page, perPage, offset: (page - 1) * perPage };
}

export const pageMeta = (page, perPage, total) => ({
  page,
  per_page: perPage,
  total,
  last_page: Math.max(1, Math.ceil(total / perPage)),
});
