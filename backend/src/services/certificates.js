import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config/index.js';
import { first, insert, isDuplicateKey, scalar } from '../db.js';
import { CERTIFICATE_TYPES } from '../domain.js';
import { nowStr } from '../utils/dates.js';
import { renderCertificate } from './certificateTemplates.js';

/** Absolute path of a stored certificate file (guards against path traversal). */
export function certificatePath(relPath) {
  const base = path.join(config.storageDir, 'certificates');
  const full = path.resolve(config.storageDir, relPath);
  if (!full.startsWith(base + path.sep)) throw new Error('Invalid certificate path');
  return full;
}

/**
 * Module 11 - render a certificate to HTML, store it on disk and record it.
 * certifiable: { type: 'allotment' | 'vacation_request', id }
 * (Swap the HTML for a PDF library such as pdfkit/puppeteer here if PDFs are needed.)
 */
export async function generateCertificate(certifiable, type, data = {}, issuedBy = null) {
  const prefix = CERTIFICATE_TYPES[type];
  const year = new Date().getFullYear();
  let seq = (await scalar('SELECT COUNT(*) FROM certificates WHERE type = ?', [type])) + 1;

  for (let attempt = 0; ; attempt++, seq++) {
    const number = `${prefix}/${year}/${String(seq).padStart(5, '0')}`;
    const html = renderCertificate(type, data, number);
    const filePath = `certificates/${type}/${number}.html`;
    try {
      const id = await insert('certificates', {
        certifiable_type: certifiable.type,
        certifiable_id: certifiable.id,
        type,
        number,
        payload: JSON.stringify(data),
        file_path: filePath,
        issued_by: issuedBy,
        issued_at: nowStr(),
      });
      const full = certificatePath(filePath);
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, html, 'utf8');
      return first('SELECT * FROM certificates WHERE id = ?', [id]);
    } catch (err) {
      if (isDuplicateKey(err) && attempt < 5) continue; // concurrent request took this number
      throw err;
    }
  }
}
