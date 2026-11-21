import { insert } from '../db.js';
import { currentContext } from '../context.js';
import { nowStr } from '../utils/dates.js';

/** Module 14 - write an audit log entry for the current request user. */
export async function audit(action, auditable = null, description = null, properties = {}) {
  const ctx = currentContext();
  const hasProps = properties && Object.keys(properties).length > 0;
  return insert(
    'audit_logs',
    {
      user_id: ctx.user?.id ?? null,
      action,
      auditable_type: auditable?.type ?? null,
      auditable_id: auditable?.id ?? null,
      description,
      properties: hasProps ? JSON.stringify(properties) : null,
      ip_address: ctx.ip ?? null,
      user_agent: ctx.userAgent ?? null,
      created_at: nowStr(),
    },
    { timestamps: false },
  );
}

/** Helper to describe the affected record: subject('allotment', 12) */
export const subject = (type, id) => ({ type, id });
