import { config } from '../config/index.js';
import { first, insert, query, update } from '../db.js';
import { addDays, diffInDays, nowStr, todayStr } from '../utils/dates.js';
import { round2 } from '../utils/helpers.js';
import { audit, subject } from './audit.js';
import { notify } from './notifications.js';

/** Record a retirement and (optionally) grant a retention period. */
export async function recordRetirement(profile, allotment, grantRetention = true) {
  const days = config.rqms.retirement.retentionPeriodDays;
  const retire = profile.retirement_date ?? todayStr();
  const expiry = grantRetention ? addDays(retire, days) : null;

  const id = await insert('retirement_records', {
    employee_profile_id: profile.id,
    allotment_id: allotment?.id ?? null,
    retirement_date: retire,
    retention_granted: grantRetention ? 1 : 0,
    retention_period_days: grantRetention ? days : null,
    retention_expiry_date: expiry,
    status: grantRetention ? 'retained' : 'notice',
    last_evaluated_at: nowStr(),
  });
  await audit('retirement.record', subject('retirement_record', id), 'Retirement recorded');
  return first('SELECT * FROM retirement_records WHERE id = ?', [id]);
}

/** Daily cycle - alerts for expiring retention and penalty accrual for overstay. */
export async function processDailyRetentionCycle() {
  const { expiryAlertDaysBefore: alertWindow, overstayPenaltyPerDay: perDay } = config.rqms.retirement;
  const today = todayStr();
  let processed = 0;

  const records = await query(
    `SELECT r.*, u.id AS user_id, u.email, u.mobile
       FROM retirement_records r
       JOIN employee_profiles p ON p.id = r.employee_profile_id
       JOIN users u ON u.id = p.user_id
      WHERE r.status IN ('retained', 'expiring', 'overstaying')`,
  );

  for (const record of records) {
    const expiry = record.retention_expiry_date;
    if (!expiry) continue;
    const user = { id: record.user_id, email: record.email, mobile: record.mobile };

    if (today > expiry) {
      const overstay = diffInDays(expiry, today);
      await update('retirement_records', record.id, {
        status: 'overstaying',
        overstay_days: overstay,
        penalty_amount: round2(overstay * perDay),
        last_evaluated_at: nowStr(),
      });
      await notify(
        user,
        'retirement_overstay',
        `Retention period expired. Overstay: ${overstay} day(s). Penalty accruing.`,
        'Quarter Overstay',
        ['email', 'sms'],
      );
    } else if (diffInDays(today, expiry) <= alertWindow) {
      await update('retirement_records', record.id, { status: 'expiring', last_evaluated_at: nowStr() });
      await notify(
        user,
        'retirement_reminder',
        `Quarter retention expires on ${expiry}. Please plan handover.`,
        'Retention Expiring',
        ['email', 'sms'],
      );
    }
    processed++;
  }
  return processed;
}
