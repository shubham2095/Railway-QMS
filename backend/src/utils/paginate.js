import { query, scalar } from '../db.js';
import { pageMeta, pageParams } from './http.js';

/**
 * Paginated list helper.
 * from: table + joins, where: array of SQL conditions, params: values for those conditions.
 */
export async function paginate(req, { perPage, select, from, where = [], params = [], orderBy, map = (r) => r }) {
  const { page, offset } = pageParams(req, perPage);
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = await scalar(`SELECT COUNT(*) FROM ${from} ${whereSql}`, params);
  const rows = await query(
    `SELECT ${select} FROM ${from} ${whereSql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
    [...params, perPage, offset],
  );
  return { data: rows.map(map), meta: pageMeta(page, perPage, total) };
}

export const like = (v) => `%${String(v).replace(/[\\%_]/g, '\\$&')}%`;
