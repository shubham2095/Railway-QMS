const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const parse = (v) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(String(v ?? ''));
  return m ? { y: m[1], mo: +m[2], d: m[3], h: m[4], mi: m[5] } : null;
};

/** '2026-06-19' / '2026-06-19 14:05:00' -> '19 Jun 2026' */
export function fmtDate(v, fallback = '—') {
  const p = parse(v);
  return p ? `${p.d} ${MONTHS[p.mo - 1]} ${p.y}` : fallback;
}

/** -> '19 Jun 2026 14:05' */
export function fmtDateTime(v, fallback = '—') {
  const p = parse(v);
  if (!p) return fallback;
  return `${p.d} ${MONTHS[p.mo - 1]} ${p.y}${p.h ? ` ${p.h}:${p.mi}` : ''}`;
}

export const titleCase = (s) =>
  String(s ?? '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

export const inr = (n, digits = 0) =>
  `₹${Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

export const todayIso = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export const kb = (bytes) => `${Math.round((bytes ?? 0) / 1024)} KB`;
