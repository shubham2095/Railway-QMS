import dotenv from 'dotenv';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

// Must happen before any Date is formatted: all timestamps are stored in the app timezone.
process.env.TZ = process.env.APP_TIMEZONE || 'Asia/Kolkata';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
// Real environment variables (set in a hosting panel) always win over backend/.env
dotenv.config({ path: path.join(root, '.env'), quiet: true });
const num = (name, fallback) => {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : Number(v);
};
const isProd = process.env.NODE_ENV === 'production';

// Hosting panels often hand out a single connection string: mysql://user:pass@host:3306/dbname
function dbFromUrl(raw) {
  const u = new URL(raw);
  return {
    host: u.hostname,
    port: Number(u.port) || 3306,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: decodeURIComponent(u.pathname.replace(/^\//, '')),
  };
}

let jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret === 'change-me-to-a-long-random-string') {
  if (isProd) {
    throw new Error('JWT_SECRET must be set to a long random string when NODE_ENV=production.');
  }
  jwtSecret = crypto.randomBytes(32).toString('hex');
  console.warn('[config] JWT_SECRET not set - using a temporary secret (sessions reset on restart).');
}

export const config = {
  root,
  env: process.env.NODE_ENV || 'development',
  isProd,
  port: num('PORT', 5000),
  // Uploaded documents + generated certificates. Point STORAGE_DIR outside the app folder on hosts that wipe it on redeploy.
  storageDir: process.env.STORAGE_DIR ? path.resolve(process.env.STORAGE_DIR) : path.join(root, 'storage'),
  frontendDist: path.resolve(root, '..', 'frontend', 'dist'),
  clientOrigins: (process.env.CLIENT_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean),

  db: process.env.DATABASE_URL
    ? dbFromUrl(process.env.DATABASE_URL)
    : {
        host: process.env.DB_HOST || '127.0.0.1',
        port: num('DB_PORT', 3306),
        user: process.env.DB_USERNAME || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_DATABASE || 'rqms',
      },

  // First-run bootstrap (see src/bootstrap.js): create tables + roles + first super admin automatically.
  bootstrap: {
    enabled: process.env.AUTO_BOOTSTRAP === 'true',
    adminEmail: process.env.ADMIN_EMAIL || '',
    adminPassword: process.env.ADMIN_PASSWORD || '',
    adminName: process.env.ADMIN_NAME || 'Administrator',
  },

  auth: {
    jwtSecret,
    cookieName: 'rqms_token',
    sessionMinutes: num('SESSION_LIFETIME', 120),
    cookieSecure: process.env.COOKIE_SECURE === 'true',
  },

  // ---------------------------------------------------------------------------
  // RQMS domain configuration (ported 1:1 from Laravel config/rqms.php)
  // ---------------------------------------------------------------------------
  rqms: {
    // Module 4 - Priority Matrix weights
    priorityWeights: {
      essential_service: num('RQMS_W_ESSENTIAL', 50),
      medical_ground: num('RQMS_W_MEDICAL', 30),
      sc: num('RQMS_W_SC', 20),
      st: num('RQMS_W_ST', 20),
      obc: num('RQMS_W_OBC', 10),
      general: num('RQMS_W_GENERAL', 0),
      seniority_per_year: num('RQMS_W_SENIORITY_PER_YEAR', 1.0), // points per completed year
      seniority_cap: num('RQMS_W_SENIORITY_CAP', 15),
      application_per_month: num('RQMS_W_APP_PER_MONTH', 1.0), // points per month waiting
      application_cap: num('RQMS_W_APP_CAP', 10),
    },
    // Module 4 - minimum completed years of service per quarter type
    eligibility: {
      minServiceYears: { I: 0, II: 0, III: 3, IV: 7, V: 12, VI: 18 },
      blockIfExistingAllotment: true,
    },
    // Module 10 - retention
    retirement: {
      retentionPeriodDays: num('RQMS_RETENTION_DAYS', 120),
      overstayPenaltyPerDay: num('RQMS_OVERSTAY_PENALTY', 250.0),
      expiryAlertDaysBefore: num('RQMS_RETENTION_ALERT_DAYS', 15),
    },
    // Module 9 - ordered vacation clearance steps
    vacationClearanceSteps: ['clerk_inspection', 'electrical', 'water', 'accounts', 'estate_officer'],
  },
};
