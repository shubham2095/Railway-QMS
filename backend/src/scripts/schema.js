import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';
import { config } from '../config/index.js';

const schemaFile = path.join(config.root, '..', 'database', 'schema.sql');

/** schema.sql as one string (tolerates old copies that still contain CREATE DATABASE / USE). */
export const loadSchemaSql = () =>
  fs
    .readFileSync(schemaFile, 'utf8')
    .split('\n')
    .filter((line) => !/^\s*(CREATE DATABASE|USE)\b/i.test(line))
    .join('\n');

/** Create every table in the configured database. WARNING: the script drops existing RQMS tables first. */
export async function applySchema() {
  const { host, port, user, password, database } = config.db;
  const conn = await mysql.createConnection({ host, port, user, password, database, multipleStatements: true });
  try {
    await conn.query(loadSchemaSql());
  } finally {
    await conn.end();
  }
}

/** Create the database if the MySQL user is allowed to; on shared hosting it already exists. */
export async function ensureDatabaseExists() {
  const { host, port, user, password, database } = config.db;
  const conn = await mysql.createConnection({ host, port, user, password });
  try {
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  } catch (err) {
    // Shared hosting: no CREATE DATABASE privilege - the database was created in the control panel.
    if (!['ER_DBACCESS_DENIED_ERROR', 'ER_ACCESS_DENIED_ERROR', 'ER_SPECIFIC_ACCESS_DENIED_ERROR'].includes(err.code)) throw err;
  } finally {
    await conn.end();
  }
}
