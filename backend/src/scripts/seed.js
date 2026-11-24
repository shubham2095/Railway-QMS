import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'node:url';
import { first, insert, pool, query, transaction, update } from '../db.js';
import { fmtDate, nowStr } from '../utils/dates.js';
import { forwardApplication, runEngine, submitApplication } from '../services/applications.js';

/** insert-or-update by a "where" object (Laravel updateOrCreate). Returns the row id. */
async function upsert(table, where, data) {
  const keys = Object.keys(where);
  const existing = await first(`SELECT id FROM \`${table}\` WHERE ${keys.map((k) => `\`${k}\` <=> ?`).join(' AND ')}`, keys.map((k) => where[k]));
  if (existing) {
    await update(table, existing.id, data);
    return existing.id;
  }
  return insert(table, { ...where, ...data });
}

const ROLES = {
  employee: 'Employee',
  quarter_clerk: 'Quarter Clerk',
  estate_officer: 'Estate Officer',
  electrical_dept: 'Electrical Department',
  water_dept: 'Water Department',
  accounts_dept: 'Accounts Department',
  admin: 'Administrator',
  super_admin: 'Super Administrator',
};

// group => { slug: name }
const PERMISSIONS = {
  application: {
    'application.verify': 'Verify applications',
    'application.decide': 'Approve/reject applications',
  },
  quarter: { 'quarter.manage': 'Manage quarter master data' },
  allotment: {
    'allotment.approve': 'Offer/approve allotments',
    'allotment.possession': 'Record possession',
  },
  vacation: {
    'vacation.clerk_inspection': 'Act on clerk inspection step',
    'vacation.electrical': 'Act on electrical clearance step',
    'vacation.water': 'Act on water clearance step',
    'vacation.accounts': 'Act on accounts clearance step',
    'vacation.estate_officer': 'Act on estate officer step',
  },
  reports: { 'reports.view': 'View dashboards & MIS reports' },
  admin: {
    'users.manage': 'Manage users',
    'master.manage': 'Manage master data',
    'settings.manage': 'Manage system settings',
  },
};

const ROLE_PERMISSIONS = {
  employee: [],
  quarter_clerk: ['application.verify', 'quarter.manage', 'allotment.possession', 'vacation.clerk_inspection'],
  estate_officer: ['application.decide', 'allotment.approve', 'allotment.possession', 'vacation.estate_officer', 'reports.view'],
  electrical_dept: ['vacation.electrical'],
  water_dept: ['vacation.water'],
  accounts_dept: ['vacation.accounts'],
  // The admin decides who gets a quarter: approves applications and offers quarters from the approved list.
  // Users & roles, quarter master changes, reports and the audit trail belong to the super admin.
  admin: ['application.decide', 'allotment.approve'],
  super_admin: Object.values(PERMISSIONS).flatMap((g) => Object.keys(g)),
};

export async function seedRolesAndPermissions() {
  const roleIds = {};
  for (const [slug, name] of Object.entries(ROLES)) roleIds[slug] = await upsert('roles', { slug }, { name });

  const permIds = {};
  for (const [group, items] of Object.entries(PERMISSIONS)) {
    for (const [slug, name] of Object.entries(items)) permIds[slug] = await upsert('permissions', { slug }, { name, group });
  }

  // One transaction: other app instances never see a half-written permission matrix while this runs.
  await transaction(async () => {
    for (const [roleSlug, permSlugs] of Object.entries(ROLE_PERMISSIONS)) {
      await query('DELETE FROM permission_role WHERE role_id = ?', [roleIds[roleSlug]]);
      for (const p of permSlugs) await query('INSERT INTO permission_role (permission_id, role_id) VALUES (?, ?)', [permIds[p], roleIds[roleSlug]]);
    }
  });
  // Permissions that no longer exist in the catalogue (e.g. profile.verify) are removed.
  await query('DELETE FROM permissions WHERE slug NOT IN (?)', [Object.keys(permIds)]);
  return roleIds;
}

const yearsAgo = (n) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - n);
  return fmtDate(d);
};
const yearsAhead = (n) => yearsAgo(-n);

export async function seedDemo(roleIds) {
  const passwordHash = await bcrypt.hash('password', 10);

  const accounts = [
    ['employee', 'Ravi Kumar', 'emp@rqms.test', 'EMP1001'],
    ['quarter_clerk', 'Sunita Devi', 'clerk@rqms.test', 'CLK2001'],
    ['estate_officer', 'A. K. Sharma', 'estate@rqms.test', 'EST3001'],
    ['electrical_dept', 'Electrical Desk', 'electrical@rqms.test', 'ELE4001'],
    ['water_dept', 'Water Desk', 'water@rqms.test', 'WAT5001'],
    ['accounts_dept', 'Accounts Desk', 'accounts@rqms.test', 'ACC6001'],
    ['admin', 'System Admin', 'admin@rqms.test', 'ADM7001'],
    ['super_admin', 'Super Admin', 'super@rqms.test', 'SUP8001'],
  ];

  const assignRole = async (userId, roleId) =>
    query('INSERT IGNORE INTO role_user (role_id, user_id) VALUES (?, ?)', [roleId, userId]);

  let employee = null; // { user, profile }
  for (const [roleSlug, name, email, empId] of accounts) {
    const userId = await upsert('users', { email }, { name, mobile: `90000${empId.slice(-5)}`, password: passwordHash, is_active: 1 });
    await assignRole(userId, roleIds[roleSlug]);

    const profileId = await upsert('employee_profiles', { employee_id: empId }, {
      user_id: userId,
      pf_number: `PF${empId.replace(/\D/g, '')}`,
      verification_status: 'verified',
      verified_at: nowStr(),
      father_name: 'Ram Prasad',
      date_of_birth: yearsAgo(32),
      current_address: 'Railway Colony, New Delhi - 110001',
      designation: roleSlug.charAt(0).toUpperCase() + roleSlug.slice(1).replaceAll('_', ' '),
      department: 'Railways',
      station: 'NDLS',
      division: 'Delhi',
      railway_zone: 'Northern Railway',
      category: roleSlug === 'employee' ? 'OBC' : 'GENERAL',
      service_type: roleSlug === 'employee' ? 'essential' : 'non_essential',
      grade_pay: 4200,
      pay_level: 'Level-6',
      date_of_joining: yearsAgo(10),
      retirement_date: yearsAhead(20),
    });
    if (roleSlug === 'employee') employee = { userId, profileId };
  }

  // A second eligible employee to make the waiting list non-trivial.
  const user2 = await upsert('users', { email: 'emp2@rqms.test' }, { name: 'Meena Iyer', mobile: '9000099999', password: passwordHash, is_active: 1 });
  await assignRole(user2, roleIds.employee);
  const profile2 = await upsert('employee_profiles', { employee_id: 'EMP1002' }, {
    user_id: user2,
    pf_number: 'PF1002',
    verification_status: 'verified',
    verified_at: nowStr(),
    father_name: 'Suresh Iyer',
    date_of_birth: yearsAgo(42),
    current_address: 'Railway Colony A, New Delhi - 110001',
    designation: 'Senior Technician',
    department: 'Railways',
    station: 'NDLS',
    division: 'Delhi',
    railway_zone: 'Northern Railway',
    category: 'SC',
    service_type: 'non_essential',
    grade_pay: 2800,
    pay_level: 'Level-5',
    date_of_joining: yearsAgo(18),
    retirement_date: yearsAhead(12),
  });

  // Quarter inventory - a spread of types, mostly vacant.
  const quarters = [
    ['Q-101', 'III', 'Railway Colony A', 'vacant'],
    ['Q-102', 'III', 'Railway Colony A', 'vacant'],
    ['Q-201', 'IV', 'Railway Colony B', 'vacant'],
    ['Q-202', 'IV', 'Railway Colony B', 'under_maintenance'],
    ['Q-301', 'II', 'Railway Colony C', 'vacant'],
    ['Q-401', 'V', 'Officers Enclave', 'reserved'],
  ];
  for (const [number, type, colony, status] of quarters) {
    await upsert('quarters', { station: 'NDLS', colony_name: colony, quarter_number: number }, {
      quarter_type: type,
      address: `${colony}, New Delhi`,
      railway_zone: 'Northern Railway',
      division: 'Delhi',
      block: 'A',
      floor: 'Ground',
      status,
    });
  }

  // Route two applications through the real engine.
  const applyFor = async (userId, profileId, data) => {
    const existing = await first('SELECT COUNT(*) AS c FROM quarter_applications WHERE employee_profile_id = ?', [profileId]);
    if (existing.c > 0) return;
    const user = await first('SELECT id, name, email, mobile FROM users WHERE id = ?', [userId]);
    const profile = await first('SELECT * FROM employee_profiles WHERE id = ?', [profileId]);
    const app = await submitApplication(profile, user, { preferred_quarter_type: 'III', ...data });
    const checked = await runEngine(app.id);
    // As if the clerk had approved it: the application is with the admin, in the line for approval.
    const clerk = await first("SELECT id FROM users WHERE email = 'clerk@rqms.test'");
    if (checked.status === 'waitlisted' && clerk) await forwardApplication(checked, clerk, null);
  };
  await applyFor(employee.userId, employee.profileId, { family_size: 4, medical_ground: false, colonies: ['Railway Colony A', 'Railway Colony B'] });
  await applyFor(user2, profile2, { family_size: 3, medical_ground: true, colonies: ['Railway Colony B', 'Railway Colony A'] });
}

/** Create (or reset the password of) a super_admin account - used for the first login on a real deployment. */
export async function createSuperAdmin({ email, password, name = 'Administrator' }) {
  const roleIds = await seedRolesAndPermissions();
  const userId = await upsert('users', { email }, {
    name,
    password: await bcrypt.hash(password, 10),
    is_active: 1,
  });
  await query('INSERT IGNORE INTO role_user (role_id, user_id) VALUES (?, ?)', [roleIds.super_admin, userId]);
  return userId;
}

export async function seedAll() {
  const roleIds = await seedRolesAndPermissions();
  await seedDemo(roleIds);
}

// `npm run db:seed`
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await seedAll();
    console.log('[seed] Roles, permissions, demo accounts, quarters and applications are in place.');
    console.log('[seed] All demo accounts use the password: password');
  } catch (err) {
    console.error('[seed] failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
