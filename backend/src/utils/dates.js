// Date helpers. The DB layer returns DATE / DATETIME columns as plain strings
// ('YYYY-MM-DD' / 'YYYY-MM-DD HH:mm:ss', dateStrings: true) in the app timezone.

const pad = (n) => String(n).padStart(2, '0');

export const fmtDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fmtDateTime = (d) => `${fmtDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

export const nowStr = () => fmtDateTime(new Date());
export const todayStr = () => fmtDate(new Date());

/** Parse 'YYYY-MM-DD' or 'YYYY-MM-DD HH:mm:ss' (local time) or a Date into a Date. */
export function toDate(v) {
  if (v instanceof Date) return v;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(String(v));
  if (!m) return new Date(v);
  return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
}

const dayNumber = (v) => {
  const d = toDate(v);
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
};

/** Whole calendar days from a to b (negative if b is before a). */
export const diffInDays = (a, b) => dayNumber(b) - dayNumber(a);

export function addDays(v, n) {
  const d = toDate(v);
  return fmtDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
}

export function addMonths(v, n) {
  const d = toDate(v);
  const target = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d.getDate(), lastDay));
  return fmtDate(target);
}

const intraMonthKey = (d) => ((d.getDate() * 24 + d.getHours()) * 60 + d.getMinutes()) * 60 + d.getSeconds();

/** Completed months between two instants (Carbon::diffInMonths, truncated). */
export function diffInMonths(from, to = new Date()) {
  const a = toDate(from);
  const b = toDate(to);
  let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (months > 0 && intraMonthKey(b) < intraMonthKey(a)) months -= 1;
  return months;
}

/** Completed years between two instants. */
export const diffInYears = (from, to = new Date()) => Math.trunc(diffInMonths(from, to) / 12);
