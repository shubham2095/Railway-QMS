import { insert, update } from '../db.js';
import { nowStr } from '../utils/dates.js';

const log = (...args) => {
  if (process.env.NODE_ENV !== 'test') console.log('[notify]', ...args);
};

// Module 12 - notifications are recorded in notification_logs. The send* functions
// are stubs: wire real providers (SMTP / SMS gateway / WhatsApp API) here.
const senders = {
  async email(user, title, message) {
    log(`[EMAIL] to ${user.email}: ${title} - ${message}`);
  },
  async sms(user, _title, message) {
    log(`[SMS] to ${user.mobile}: ${message}`);
  },
  async whatsapp(user, _title, message) {
    log(`[WHATSAPP] to ${user.mobile}: ${message}`);
  },
};

/** user: { id, email, mobile } */
export async function notify(user, event, message, title = null, channels = ['email']) {
  for (const channel of channels) {
    const id = await insert('notification_logs', {
      user_id: user.id,
      channel,
      event,
      title,
      message,
      status: 'queued',
    });
    try {
      await (senders[channel] ?? senders.email)(user, title, message);
      await update('notification_logs', id, { status: 'sent', sent_at: nowStr() });
    } catch (err) {
      await update('notification_logs', id, { status: 'failed', response: String(err.message) });
    }
  }
}
