import mysql from 'mysql2/promise';
import { AsyncLocalStorage } from 'node:async_hooks';
import { config } from './config/index.js';
import { nowStr } from './utils/dates.js';

export const pool = mysql.createPool({
  ...config.db,
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4',
  dateStrings: true, // DATE/DATETIME -> strings, no timezone surprises
  decimalNumbers: true, // DECIMAL -> number
  timezone: 'local',
});

// The active transaction connection, if any. Services simply call query()/insert()/...
// and automatically join the surrounding transaction (like Laravel's DB::transaction).
const txStore = new AsyncLocalStorage();
const executor = () => txStore.getStore() ?? pool;

export async function query(sql, params = []) {
  const [rows] = await executor().query(sql, params);
  return rows;
}

export async function first(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] ?? null;
}

export async function scalar(sql, params = []) {
  const row = await first(sql, params);
  return row ? Object.values(row)[0] : null;
}

const quote = (k) => `\`${k}\``;

/** INSERT a row (adds created_at/updated_at). Returns the new id. */
export async function insert(table, data, { timestamps = true } = {}) {
  const now = nowStr();
  const row = { ...data };
  if (timestamps) {
    row.created_at ??= now;
    row.updated_at ??= now;
  }
  const keys = Object.keys(row);
  const [res] = await executor().query(
    `INSERT INTO ${quote(table)} (${keys.map(quote).join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
    keys.map((k) => normalize(row[k])),
  );
  return res.insertId;
}

/** UPDATE a row by primary key (touches updated_at). */
export async function update(table, id, data, { timestamps = true } = {}) {
  const row = { ...data };
  if (timestamps) row.updated_at = nowStr();
  const keys = Object.keys(row);
  if (!keys.length) return;
  await executor().query(
    `UPDATE ${quote(table)} SET ${keys.map((k) => `${quote(k)} = ?`).join(', ')} WHERE id = ?`,
    [...keys.map((k) => normalize(row[k])), id],
  );
}

export const find = (table, id) => first(`SELECT * FROM ${quote(table)} WHERE id = ?`, [id]);

function normalize(v) {
  if (v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v !== null && typeof v === 'object' && !(v instanceof Date) && !Buffer.isBuffer(v)) {
    return JSON.stringify(v);
  }
  return v;
}

/** Run fn inside a transaction. Nested calls join the outer transaction. */
export async function transaction(fn) {
  if (txStore.getStore()) return fn();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await txStore.run(conn, fn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
}

export const isDuplicateKey = (err) => err?.code === 'ER_DUP_ENTRY';
