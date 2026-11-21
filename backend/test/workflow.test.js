// Integration test: walks the whole RQMS lifecycle through the HTTP API against a
// throw-away MySQL database (rqms_test). Requires a running MySQL/MariaDB (XAMPP is fine).
//
//   npm test
//
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.DB_DATABASE = process.env.TEST_DB_DATABASE || 'rqms_test';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret';

// --- fresh schema ---
const { ensureDatabaseExists, applySchema } = await import('../src/scripts/schema.js');
await ensureDatabaseExists();
await applySchema();

const { config } = await import('../src/config/index.js');
const { createApp } = await import('../src/app.js');
const { seedAll } = await import('../src/scripts/seed.js');
const { pool } = await import('../src/db.js');
await seedAll();

let server;
let base;

/** Tiny cookie-aware API client. */
function client() {
  let cookie = '';
  const call = async (method, url, body, extraHeaders = {}) => {
    const isForm = body instanceof FormData;
    const res = await fetch(base + url, {
      method,
      headers: { ...(cookie ? { cookie } : {}), ...(body && !isForm ? { 'content-type': 'application/json' } : {}), ...extraHeaders },
      body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
    });
    const set = res.headers.getSetCookie?.() ?? [];
    for (const c of set) cookie = c.startsWith('rqms_token=;') || /Expires=Thu, 01 Jan 1970/.test(c) ? '' : c.split(';')[0];
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* html */ }
    return { status: res.status, json, text };
  };
  return {
    get: (u) => call('GET', u),
    post: (u, b = {}) => call('POST', u, b),
    put: (u, b = {}) => call('PUT', u, b),
    del: (u) => call('DELETE', u),
    form: (u, fd) => call('POST', u, fd),
    async login(email, password = 'password') {
      const r = await call('POST', '/api/auth/login', { email, password });
      assert.equal(r.status, 200, `login ${email}: ${r.text}`);
      return r.json;
    },
  };
}

const isoYears = (n) => { const d = new Date(); d.setFullYear(d.getFullYear() + n); return d.toISOString().slice(0, 10); };
/** A complete, valid profile payload (every service field is required). */
const fullProfile = (over = {}) => ({
  name: 'Test Employee', mobile: '9876543210',
  employee_id: 'EMP5555', pf_number: 'PF5555', father_name: 'Mohan Lal', date_of_birth: isoYears(-30),
  current_address: '12 Railway Colony, New Delhi 110001', designation: 'Technician', department: 'Railways',
  station: 'NDLS', division: 'Delhi', railway_zone: 'Northern Railway', category: 'GENERAL', service_type: 'non_essential',
  grade_pay: 2800, pay_level: 'Level-5', date_of_joining: isoYears(-5), retirement_date: isoYears(25), ...over,
});

const as = {};

/** id of an employee's profile as the clerk sees it in the Employees queue */
const profileIdOf = async (employeeId) => {
  const r = await as.clerk.get(`/api/employees?q=${employeeId}`);
  assert.equal(r.status, 200, r.text);
  const row = r.json.data.find((p) => p.employee_id === employeeId);
  assert.ok(row, `profile ${employeeId} is in the clerk's queue`);
  return row.id;
};
/** the clerk verifies an employee's profile (no-op if it already is) */
const verifyProfileOf = async (employeeId) => {
  const r = await as.clerk.post(`/api/employees/${await profileIdOf(employeeId)}/verify`);
  assert.ok([200, 422].includes(r.status), r.text);
};
before(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  for (const [key, email] of Object.entries({
    employee: 'emp@rqms.test', employee2: 'emp2@rqms.test', clerk: 'clerk@rqms.test', estate: 'estate@rqms.test',
    electrical: 'electrical@rqms.test', water: 'water@rqms.test', accounts: 'accounts@rqms.test', admin: 'admin@rqms.test', super: 'super@rqms.test',
  })) {
    as[key] = client();
    await as[key].login(email);
  }
});
after(async () => {
  server?.close();
  await pool.end();
});

describe('authentication & RBAC', () => {
  test('rejects wrong password and unauthenticated access', async () => {
    const c = client();
    const bad = await c.post('/api/auth/login', { email: 'emp@rqms.test', password: 'nope' });
    assert.equal(bad.status, 422);
    assert.match(bad.json.errors.email[0], /do not match/);
    assert.equal((await c.get('/api/dashboard')).status, 401);
    const me = await c.get('/api/auth/me');
    assert.equal(me.status, 200);
    assert.equal(me.json.user, null);
  });

  test('login by employee ID works and /me exposes roles & permissions', async () => {
    const c = client();
    const me = await c.login('CLK2001');
    assert.equal(me.user.email, 'clerk@rqms.test');
    assert.deepEqual(me.user.roles, ['quarter_clerk']);
    assert.ok(me.user.permissions.includes('application.verify'));
  });

  test('employee is blocked from staff/admin endpoints', async () => {
    for (const url of ['/api/quarters', '/api/waiting-list', '/api/retirements', '/api/reports', '/api/audit', '/api/admin/users']) {
      assert.equal((await as.employee.get(url)).status, 403, url);
    }
  });

  test('clerk cannot view reports / admin; only the admin side approves applications', async () => {
    assert.equal((await as.clerk.get('/api/reports')).status, 403);
    assert.equal((await as.clerk.get('/api/admin/users')).status, 403);
    assert.equal((await as.clerk.post('/api/applications/1/decide', { decision: 'approve' })).status, 403, 'the clerk verifies and forwards, the admin approves');
    assert.equal((await as.employee.post('/api/applications/1/decide', { decision: 'approve' })).status, 403);
    // the admin holds the permission (so the request gets as far as the status rule: application 1 is not forwarded yet)
    assert.equal((await as.admin.post('/api/applications/1/decide', { decision: 'approve' })).status, 422);
    assert.equal((await as.admin.post('/api/applications/1/forward')).status, 403, 'the admin does not forward');
  });
});

describe('seeded data & priority engine', () => {
  test('demo applications are waitlisted with the expected score and ranking', async () => {
    const wl = await as.clerk.get('/api/waiting-list');
    assert.equal(wl.status, 200);
    assert.equal(wl.json.entries.length, 2);
    const [first, second] = wl.json.entries;
    // Ravi: essential 50 + OBC 10 + seniority 10 = 70 ; Meena: SC 20 + medical 30 + seniority 15 (cap) = 65
    assert.equal(first.application.employee_name, 'Ravi Kumar');
    assert.equal(first.priority_score, 70);
    assert.equal(first.rank, 1);
    assert.equal(second.application.employee_name, 'Meena Iyer');
    assert.equal(second.priority_score, 65);
    assert.equal(second.rank, 2);
  });

  test('colony preferences: shown on the waiting list and matched against the quarter being offered', async () => {
    // Ravi chose [Colony A, Colony B]; Meena chose [Colony B, Colony A]
    const wl = (await as.clerk.get('/api/waiting-list')).json.entries;
    const prefs = (name) => wl.find((e) => e.application.employee_name === name).application.colony_preferences;
    assert.deepEqual(prefs('Ravi Kumar'), [{ priority: 1, colony_name: 'Railway Colony A' }, { priority: 2, colony_name: 'Railway Colony B' }]);
    assert.deepEqual(prefs('Meena Iyer').map((p) => p.colony_name), ['Railway Colony B', 'Railway Colony A']);

    const q101 = (await as.clerk.get('/api/quarters?q=Q-101')).json.data[0];   // a Type-III quarter in Colony A
    const sugg = (await as.clerk.get(`/api/quarters/${q101.id}`)).json.suggestions;
    assert.equal(sugg.find((e) => e.application.employee_name === 'Ravi Kumar').colony_choice, 1, "Colony A is Ravi's 1st choice");
    assert.equal(sugg.find((e) => e.application.employee_name === 'Meena Iyer').colony_choice, 2, "Colony A is Meena's 2nd choice");
    assert.equal(sugg[0].application.employee_name, 'Ravi Kumar', 'ranking is still by priority score, preferences are shown alongside');
  });

  test('application detail exposes eligibility checks and breakdown', async () => {
    const list = await as.employee.get('/api/applications');
    assert.equal(list.json.data.length, 1);
    const detail = await as.employee.get(`/api/applications/${list.json.data[0].id}`);
    const a = detail.json.application;
    assert.equal(a.status, 'waitlisted');
    assert.equal(a.eligibility_result.eligible, true);
    assert.deepEqual(a.priority_breakdown, { essential_service: 50, medical_ground: 0, category: 10, seniority: 10, application_age: 0 });
    // other employee cannot read it
    assert.equal((await as.employee2.get(`/api/applications/${a.id}`)).status, 403);
  });

  test('dashboard stats for staff, snapshot for employee', async () => {
    const d = await as.estate.get('/api/dashboard');
    assert.equal(d.json.stats.total_quarters, 6);
    assert.equal(d.json.stats.vacant, 4);
    assert.equal(d.json.stats.waitlist, 2);
    const e = await as.employee.get('/api/dashboard');
    assert.equal(e.json.stats, null);
    assert.equal(e.json.my_applications.length, 1);
  });
});

describe('application lifecycle (new employee, upload, verify, ineligible)', () => {
  let newUser;
  before(async () => {
    const roles = (await as.admin.get('/api/admin/roles')).json.roles;
    const employeeRole = roles.find((r) => r.slug === 'employee');
    const created = await as.admin.post('/api/admin/users', {
      name: 'Test Employee', email: 'new@rqms.test', password: 'secret123', is_active: true, roles: [employeeRole.id],
    });
    assert.equal(created.status, 201, created.text);
    newUser = client();
    await newUser.login('new@rqms.test', 'secret123');
  });

  test('admin user management validates input', async () => {
    const dup = await as.admin.post('/api/admin/users', { name: 'X', email: 'new@rqms.test', password: 'secret123', roles: [] });
    assert.equal(dup.status, 422);
    assert.ok(dup.json.errors.email);
    const weak = await as.admin.post('/api/admin/users', { name: 'X', email: 'x@rqms.test', password: 'short', roles: [] });
    assert.equal(weak.status, 422);
    const list = await as.admin.get('/api/admin/users?q=new@rqms');
    assert.equal(list.json.data[0].email, 'new@rqms.test');
    assert.equal(list.json.data[0].roles[0].slug, 'employee');
  });

  test('cannot apply before the profile exists; profile validation + save', async () => {
    const early = await newUser.form('/api/applications', Object.assign(new FormData(), {}));
    assert.equal(early.status, 422);

    const bad = await newUser.put('/api/profile', { employee_id: '', category: 'X', service_type: 'essential' });
    assert.equal(bad.status, 422);
    assert.ok(bad.json.errors.employee_id && bad.json.errors.category);

    const clash = await newUser.put('/api/profile', fullProfile({ employee_id: 'EMP1001' }));
    assert.equal(clash.status, 422, 'employee id must be unique');
    assert.ok(clash.json.errors.employee_id);
    const pfClash = await newUser.put('/api/profile', fullProfile({ pf_number: 'PF1001' }));
    assert.equal(pfClash.status, 422, 'PF number must be unique');
    assert.ok(pfClash.json.errors.pf_number);

    const ok = await newUser.put('/api/profile', fullProfile());
    assert.equal(ok.status, 200, ok.text);
    const p = await newUser.get('/api/profile');
    assert.equal(p.json.profile.service_years, 5);
    assert.equal(p.json.profile.pf_number, 'PF5555');
    assert.equal(p.json.profile.father_name, 'Mohan Lal');
    assert.equal(p.json.profile.current_address, '12 Railway Colony, New Delhi 110001');
    assert.equal(p.json.profile.date_of_birth, isoYears(-30));
    assert.equal(p.json.user.mobile, '9876543210');

    const fam = await newUser.post('/api/profile/family', { name: 'Asha', relation: 'Spouse', is_dependent: true });
    assert.equal(fam.status, 201);
    const again = await newUser.get('/api/profile');
    assert.equal(again.json.family_members.length, 1);
    assert.equal((await as.employee.del(`/api/profile/family/${fam.json.id}`)).status, 403);
    assert.equal((await newUser.del(`/api/profile/family/${fam.json.id}`)).status, 200);
  });

  let appId;
  test('submit a Type-VI application with documents, clerk verifies -> ineligible (needs 18y)', async () => {
    const fd = new FormData();
    fd.append('preferred_quarter_type', 'VI'); fd.append('colony_1', 'Railway Colony A');
    fd.append('family_size', '3');
    fd.append('medical_ground', 'true');
    fd.append('document_categories', 'service_certificate');
    fd.append('documents', new Blob([Buffer.from('%PDF-1.4 fake')], { type: 'application/pdf' }), 'cert.pdf');
    const created = await newUser.form('/api/applications', fd);
    assert.equal(created.status, 201, created.text);
    appId = created.json.id;

    // disallowed file type is rejected
    const bad = new FormData();
    bad.append('preferred_quarter_type', 'III'); bad.append('colony_1', 'Railway Colony A');
    bad.append('documents', new Blob(['MZ'], { type: 'application/x-msdownload' }), 'virus.exe');
    assert.equal((await newUser.form('/api/applications', bad)).status, 422);

    const detail = await newUser.get(`/api/applications/${appId}`);
    assert.equal(detail.json.application.status, 'submitted');
    assert.equal(detail.json.application.medical_ground, true);
    assert.equal(detail.json.documents.length, 1);
    const doc = await newUser.get(`/api/documents/${detail.json.documents[0].id}`);
    assert.equal(doc.status, 200);
    assert.equal((await as.employee.get(`/api/documents/${detail.json.documents[0].id}`)).status, 403);

    assert.equal((await newUser.post(`/api/applications/${appId}/verify`)).status, 403, 'employee cannot verify');
    const badges = (await as.clerk.get('/api/auth/me')).json.badges;
    assert.equal(badges.applications_to_verify, 1);

    // the clerk checks the employee first: the application cannot be verified until the profile is
    const blocked = await as.clerk.post(`/api/applications/${appId}/verify`);
    assert.equal(blocked.status, 422);
    assert.match(blocked.json.errors.profile[0], /Verify the employee's profile first/);
    await verifyProfileOf('EMP5555');

    assert.equal((await as.clerk.post(`/api/applications/${appId}/verify`)).status, 200);
    assert.equal((await as.clerk.post(`/api/applications/${appId}/verify`)).status, 422, 'cannot verify twice');
    const after = (await newUser.get(`/api/applications/${appId}`)).json.application;
    assert.equal(after.status, 'ineligible');
    assert.equal(after.eligibility_result.checks.service_length, false);
    assert.match(after.eligibility_result.reasons[0], /Requires 18 years of service for Type-VI; employee has 5/);
    assert.equal((await as.estate.post(`/api/applications/${appId}/decide`, { decision: 'approve' })).status, 422, 'ineligible cannot be decided');
  });

  test('list filters for staff', async () => {
    const r = await as.clerk.get('/api/applications?status=ineligible');
    assert.equal(r.json.data.length, 1);
    assert.equal(r.json.data[0].preferred_quarter_type, 'VI');
    assert.equal((await as.clerk.get('/api/applications?type=III')).json.data.length, 2);
  });
});

describe('quarter master', () => {
  test('create / update / duplicate / filter', async () => {
    const body = { quarter_number: 'Q-501', quarter_type: 'IV', colony_name: 'Colony Z', station: 'NDLS', status: 'vacant' };
    const created = await as.clerk.post('/api/quarters', body);
    assert.equal(created.status, 201, created.text);
    assert.equal((await as.clerk.post('/api/quarters', body)).status, 422, 'duplicate quarter');
    assert.equal((await as.clerk.post('/api/quarters', { ...body, quarter_number: 'Q-502', quarter_type: 'IX' })).status, 422);
    assert.equal((await as.estate.post('/api/quarters', { ...body, quarter_number: 'Q-503' })).status, 403, 'estate officer lacks quarter.manage');

    assert.equal((await as.admin.put(`/api/quarters/${created.json.id}`, { ...body, status: 'under_maintenance' })).status, 200);
    const filtered = await as.clerk.get('/api/quarters?status=under_maintenance&q=501');
    assert.equal(filtered.json.data.length, 1);
    assert.equal(filtered.json.meta.total, 1);
  });
});

describe('allotment -> occupancy -> vacation -> clearance (the full chain)', () => {
  let quarterId, entryId, allotmentId, vacationId, ravi;

  test('clerk forwards, admin approves; clerk sees ranked suggestions for a vacant quarter', async () => {
    const apps = await as.clerk.get('/api/applications?status=waitlisted');
    ravi = apps.json.data.find((a) => a.employee_name === 'Ravi Kumar');
    assert.ok(ravi);
    assert.equal((await as.admin.post(`/api/applications/${ravi.id}/decide`, { decision: 'approve' })).status, 422, 'not forwarded yet');
    assert.equal((await as.clerk.post(`/api/applications/${ravi.id}/forward`, { remarks: 'Documents checked' })).status, 200);
    assert.equal((await as.admin.post(`/api/applications/${ravi.id}/decide`, { decision: 'approve', remarks: 'ok' })).status, 200);
    assert.equal((await as.employee.get(`/api/applications/${ravi.id}`)).json.application.status, 'approved');

    const quarters = await as.clerk.get('/api/quarters?type=III&status=vacant');
    quarterId = quarters.json.data.find((q) => q.quarter_number === 'Q-101').id;
    const q = await as.clerk.get(`/api/quarters/${quarterId}`);
    assert.equal(q.json.suggestions.length, 2);
    assert.equal(q.json.suggestions[0].application.employee_name, 'Ravi Kumar');
    entryId = q.json.suggestions[0].id;
  });

  test('offer: guards + success creates allotment order, flips statuses, re-ranks queue', async () => {
    assert.equal((await as.employee.post(`/api/quarters/${quarterId}/offer`, { waiting_list_entry_id: entryId })).status, 403);
    assert.equal((await as.estate.post(`/api/quarters/${quarterId}/offer`, {})).status, 422);

    const offer = await as.clerk.post(`/api/quarters/${quarterId}/offer`, { waiting_list_entry_id: entryId });
    assert.equal(offer.status, 201, offer.text);
    allotmentId = offer.json.id;

    // quarter no longer allocatable; the same quarter can't be offered twice
    assert.equal((await as.clerk.get(`/api/quarters/${quarterId}`)).json.quarter.status, 'allotted');
    assert.equal((await as.clerk.post(`/api/quarters/${quarterId}/offer`, { waiting_list_entry_id: entryId })).status, 422);

    // Ravi leaves the queue; Meena is now rank 1
    const wl = await as.clerk.get('/api/waiting-list');
    assert.equal(wl.json.entries.length, 1);
    assert.equal(wl.json.entries[0].rank, 1);
    assert.equal((await as.employee.get(`/api/applications/${ravi.id}`)).json.application.status, 'allotted');

    const detail = await as.employee.get(`/api/allotments/${allotmentId}`);
    assert.equal(detail.json.allotment.status, 'offered');
    assert.equal(detail.json.certificates.length, 1);
    assert.equal(detail.json.certificates[0].type, 'allotment_order');
    assert.match(detail.json.certificates[0].number, /^AO\/\d{4}\/\d{5}$/);

    // the order HTML is rendered with the quarter details, and is access controlled
    const html = await as.employee.get(`/api/certificates/${detail.json.certificates[0].id}/view`);
    assert.equal(html.status, 200);
    assert.match(html.text, /Allotment Order/);
    assert.match(html.text, /Q-101/);
    assert.equal((await as.employee2.get(`/api/certificates/${detail.json.certificates[0].id}/view`)).status, 403);
    assert.equal((await as.employee2.get(`/api/allotments/${allotmentId}`)).status, 403);
  });

  test('respond: only the owner, only once; possession only after acceptance', async () => {
    assert.equal((await as.employee2.post(`/api/allotments/${allotmentId}/respond`, { decision: 'accept' })).status, 403);
    assert.equal((await as.clerk.post(`/api/allotments/${allotmentId}/possession`)).status, 422, 'not accepted yet');
    assert.equal((await as.employee.post(`/api/allotments/${allotmentId}/respond`, { decision: 'maybe' })).status, 422);
    assert.equal((await as.employee.post(`/api/allotments/${allotmentId}/respond`, { decision: 'accept' })).status, 200);
    assert.equal((await as.employee.post(`/api/allotments/${allotmentId}/respond`, { decision: 'reject' })).status, 422, 'already answered');

    assert.equal((await as.employee.post(`/api/allotments/${allotmentId}/possession`)).status, 403);
    assert.equal((await as.clerk.post(`/api/allotments/${allotmentId}/possession`)).status, 200);
    assert.equal((await as.clerk.post(`/api/allotments/${allotmentId}/possession`)).status, 422);

    const q = (await as.clerk.get(`/api/quarters/${quarterId}`)).json;
    assert.equal(q.quarter.status, 'occupied');
    assert.equal(q.quarter.occupant_name, 'Ravi Kumar');
    assert.equal(q.occupancies.length, 1);
    assert.equal(q.occupancies[0].is_current, true);
    const certs = (await as.employee.get(`/api/allotments/${allotmentId}`)).json.certificates.map((c) => c.type).sort();
    assert.deepEqual(certs, ['allotment_order', 'occupancy_certificate', 'possession_letter']);
    assert.equal((await as.employee.get('/api/profile')).json.profile.has_active_allotment, true);
  });

  test('a rejected offer releases the quarter back to vacant', async () => {
    // Meena applies pipeline: offer Q-102 to her and reject
    const q102 = (await as.clerk.get('/api/quarters?q=Q-102')).json.data[0];
    const sugg = (await as.clerk.get(`/api/quarters/${q102.id}`)).json.suggestions;
    assert.equal(sugg.length, 1);
    const offer = await as.clerk.post(`/api/quarters/${q102.id}/offer`, { waiting_list_entry_id: sugg[0].id });
    assert.equal(offer.status, 201);
    assert.equal((await as.employee2.post(`/api/allotments/${offer.json.id}/respond`, { decision: 'reject' })).status, 200);
    assert.equal((await as.clerk.get(`/api/quarters/${q102.id}`)).json.quarter.status, 'vacant');
    assert.equal((await as.clerk.get(`/api/allotments?status=rejected`)).json.data.length, 1);
  });

  test('vacation: only eligible allotments; clearance steps must run in order by the right department', async () => {
    assert.equal((await as.employee2.get('/api/vacations/options')).json.allotments.length, 0);
    const opts = await as.employee.get('/api/vacations/options');
    assert.equal(opts.json.allotments.length, 1);

    assert.equal((await as.employee2.post('/api/vacations', { allotment_id: allotmentId, trigger: 'transfer', requested_vacation_date: '2030-01-01' })).status, 403);
    assert.equal((await as.employee.post('/api/vacations', { allotment_id: allotmentId, trigger: 'bogus', requested_vacation_date: '2030-01-01' })).status, 422);
    const created = await as.employee.post('/api/vacations', { allotment_id: allotmentId, trigger: 'transfer', requested_vacation_date: '2030-01-01', reason: 'Transferred' });
    assert.equal(created.status, 201, created.text);
    vacationId = created.json.id;
    assert.equal((await as.employee.post('/api/vacations', { allotment_id: allotmentId, trigger: 'transfer', requested_vacation_date: '2030-01-01' })).status, 422, 'no duplicate vacation');

    assert.equal((await as.clerk.get(`/api/quarters/${quarterId}`)).json.quarter.status, 'vacation_pending');
    const v = (await as.employee.get(`/api/vacations/${vacationId}`)).json;
    assert.deepEqual(v.clearances.map((c) => c.step), ['clerk_inspection', 'electrical', 'water', 'accounts', 'estate_officer']);
    assert.equal(v.vacation.current_step, 'clerk_inspection');
    assert.equal((await as.employee2.get(`/api/vacations/${vacationId}`)).status, 403);

    // badges: clerk has one clearance waiting
    assert.equal((await as.clerk.get('/api/auth/me')).json.badges.clearances_for_me, 1);
    assert.equal((await as.electrical.get('/api/auth/me')).json.badges.clearances_for_me, 0);

    // wrong department / wrong order
    assert.equal((await as.electrical.post(`/api/vacations/${vacationId}/act`, { step: 'clerk_inspection', decision: 'approve' })).status, 403);
    assert.equal((await as.electrical.post(`/api/vacations/${vacationId}/act`, { step: 'electrical', decision: 'approve', meter_reading: 100 })).status, 422, 'not the current step');
    assert.equal((await as.employee.post(`/api/vacations/${vacationId}/act`, { step: 'clerk_inspection', decision: 'approve' })).status, 403);
    assert.equal((await as.clerk.get(`/api/vacations?mine_to_action=1`)).json.data.length, 1);
    assert.equal((await as.electrical.get(`/api/vacations?mine_to_action=1`)).json.data.length, 0);
  });

  test('five-level clearance completes: NOC set issued, quarter vacant, occupancy closed', async () => {
    const act = (who, step, extra = {}) => as[who].post(`/api/vacations/${vacationId}/act`, { step, decision: 'approve', ...extra });
    assert.equal((await act('clerk', 'clerk_inspection', { has_damage: true, remarks: 'Minor' })).status, 200);
    assert.equal((await act('electrical', 'electrical', { meter_reading: 1234.5, dues_amount: 0 })).status, 200);
    assert.equal((await act('water', 'water', { meter_reading: 77 })).status, 200);
    assert.equal((await act('accounts', 'accounts', { dues_amount: 0 })).status, 200);

    let v = (await as.employee.get(`/api/vacations/${vacationId}`)).json;
    assert.equal(v.vacation.status, 'in_clearance');
    assert.equal(v.vacation.current_step, 'estate_officer');
    assert.equal(v.certificates.length, 2); // electrical + water clearance
    const clerkStep = v.clearances.find((c) => c.step === 'clerk_inspection');
    assert.equal(clerkStep.has_damage, true);
    assert.equal(clerkStep.handler_name, 'Sunita Devi');

    assert.equal((await act('estate', 'estate_officer', { remarks: 'Handed over' })).status, 200);

    v = (await as.employee.get(`/api/vacations/${vacationId}`)).json;
    assert.equal(v.vacation.status, 'completed');
    assert.equal(v.vacation.current_step, null);
    assert.deepEqual(v.certificates.map((c) => c.type).sort(),
      ['electrical_clearance', 'handover_certificate', 'no_due_certificate', 'vacation_noc', 'water_clearance']);

    const q = (await as.clerk.get(`/api/quarters/${quarterId}`)).json;
    assert.equal(q.quarter.status, 'vacant');
    assert.equal(q.quarter.current_occupant_id, null);
    assert.equal(q.occupancies[0].is_current, false);
    assert.ok(q.occupancies[0].end_date);
    assert.equal((await as.employee.get('/api/profile')).json.profile.has_active_allotment, false);
    assert.equal((await as.employee.get(`/api/allotments/${allotmentId}`)).json.allotment.status, 'vacated');

    // can't act again on a completed request
    assert.equal((await act('estate', 'estate_officer')).status, 422);

    // employee sees all 8 certificates of the chain; another employee sees none
    const certs = await as.employee.get('/api/certificates');
    assert.equal(certs.json.meta.total, 8);
    // Meena only owns the (rejected) Q-102 allotment order - none of Ravi's certificates leak to her
    const meenaCerts = (await as.employee2.get('/api/certificates')).json;
    assert.equal(meenaCerts.meta.total, 1);
    assert.equal(meenaCerts.data[0].type, 'allotment_order');
    const noc = certs.json.data.find((c) => c.type === 'vacation_noc');
    const html = await as.employee.get(`/api/certificates/${noc.id}/view`);
    assert.match(html.text, /No Objection Certificate/);
    const dl = await fetch(`${base}/api/certificates/${noc.id}/download`, { headers: { cookie: '' } });
    assert.equal(dl.status, 401);
    assert.equal((await as.employee.get('/api/certificates?type=vacation_noc')).json.data.length, 1);
  });

  test('a rejected clearance stops the workflow', async () => {
    // The new employee (5 yrs, eligible for Type-III) goes the full way to a vacation request ...
    const nu = client();
    await nu.login('new@rqms.test', 'secret123');
    const fd = new FormData();
    fd.append('preferred_quarter_type', 'III'); fd.append('colony_1', 'Railway Colony A');
    const app = await nu.form('/api/applications', fd);
    assert.equal(app.status, 201, app.text);
    assert.equal((await as.clerk.post(`/api/applications/${app.json.id}/verify`)).status, 200);
    const detail = (await nu.get(`/api/applications/${app.json.id}`)).json.application;
    assert.equal(detail.status, 'waitlisted');
    assert.equal(detail.priority_score, 5); // GENERAL 0 + seniority 5
    assert.equal(detail.rank, 1);

    const q102 = (await as.clerk.get('/api/quarters?q=Q-102')).json.data[0];
    const sugg = (await as.clerk.get(`/api/quarters/${q102.id}`)).json.suggestions;
    assert.equal(sugg.length, 1);
    const offer = await as.estate.post(`/api/quarters/${q102.id}/offer`, { waiting_list_entry_id: sugg[0].id });
    assert.equal(offer.status, 201, offer.text);
    assert.equal((await nu.post(`/api/allotments/${offer.json.id}/respond`, { decision: 'accept' })).status, 200);
    assert.equal((await as.estate.post(`/api/allotments/${offer.json.id}/possession`)).status, 200);
    const vac = await nu.post('/api/vacations', { allotment_id: offer.json.id, trigger: 'voluntary', requested_vacation_date: '2031-05-05' });
    assert.equal(vac.status, 201, vac.text);

    // ... and the clerk rejects at inspection.
    const rej = await as.clerk.post(`/api/vacations/${vac.json.id}/act`, { step: 'clerk_inspection', decision: 'reject', remarks: 'Heavy damage' });
    assert.equal(rej.status, 200);
    const v = (await nu.get(`/api/vacations/${vac.json.id}`)).json;
    assert.equal(v.vacation.status, 'rejected');
    assert.equal(v.clearances[0].status, 'rejected');
    assert.equal(v.clearances[1].status, 'pending');
    assert.equal(v.certificates.length, 0);
    // nothing further can be done, and the quarter is not freed
    assert.equal((await as.electrical.post(`/api/vacations/${vac.json.id}/act`, { step: 'electrical', decision: 'approve' })).status, 422);
    assert.equal((await as.clerk.get(`/api/quarters/${q102.id}`)).json.quarter.status, 'vacation_pending');
  });
});

describe('retirement, reports, audit, notifications', () => {
  test('upcoming retirees, record retirement, retention cycle accrues overstay penalty', async () => {
    // make Meena retire 10 days ago, with a 5-day retention so she is overstaying
    await pool.query("UPDATE employee_profiles SET retirement_date = DATE_SUB(CURDATE(), INTERVAL 10 DAY) WHERE employee_id = 'EMP1002'");
    // and a clerk retiring in 30 days (upcoming list)
    await pool.query("UPDATE employee_profiles SET retirement_date = DATE_ADD(CURDATE(), INTERVAL 30 DAY) WHERE employee_id = 'CLK2001'");

    const before = await as.estate.get('/api/retirements');
    assert.equal(before.status, 200);
    const clerkRow = before.json.upcoming.find((u) => u.employee_id === 'CLK2001');
    assert.ok(clerkRow);
    assert.equal(clerkRow.days_until, 30);
    assert.equal((await as.estate.get('/api/dashboard')).json.stats.retiring_60d, 0);

    const meena = (await pool.query("SELECT id FROM employee_profiles WHERE employee_id = 'EMP1002'"))[0][0].id;
    // meena's retirement date is in the past -> not "upcoming"; record directly with retention
    assert.equal((await as.clerk.post('/api/retirements', { employee_profile_id: meena, grant_retention: true })).status, 201);
    assert.equal((await as.clerk.post('/api/retirements', { employee_profile_id: 99999 })).status, 422);
    assert.equal((await as.clerk.post('/api/retirements', { employee_profile_id: clerkRow.id, grant_retention: false })).status, 201);

    // shorten Meena's retention window so she is overstaying by 4 days
    await pool.query("UPDATE retirement_records SET retention_expiry_date = DATE_SUB(CURDATE(), INTERVAL 4 DAY) WHERE employee_profile_id = ?", [meena]);

    assert.equal((await as.clerk.post('/api/retirements/run-cycle')).status, 403, 'clerk may not run the cycle');
    const run = await as.admin.post('/api/retirements/run-cycle');
    assert.equal(run.status, 200);
    assert.match(run.json.message, /processed 1 record/);

    const after = await as.estate.get('/api/retirements');
    const rec = after.json.data.find((r) => r.employee_id === 'EMP1002');
    assert.equal(rec.status, 'overstaying');
    assert.equal(rec.overstay_days, 4);
    assert.equal(rec.penalty_amount, 1000); // 4 days x 250
    assert.equal(after.json.data[0].employee_id, 'EMP1002', 'overstaying sorts first');
  });

  test('reports, audit trail and notifications', async () => {
    const r = await as.estate.get('/api/reports');
    assert.equal(r.status, 200);
    assert.equal(r.json.application_status.ineligible, 1);
    assert.equal(r.json.vacation_status.completed, 1);
    assert.ok(r.json.type_wise.III);

    const audit = await as.admin.get('/api/audit?action=vacation');
    assert.equal(audit.status, 200);
    assert.ok(audit.json.data.length >= 5);
    assert.ok(audit.json.actions.includes('allotment.offer'));
    assert.ok(audit.json.data.every((l) => l.action.includes('vacation')));
    const login = (await as.super.get('/api/audit?action=auth.login')).json.data[0];
    assert.ok(login.user_name);
    assert.equal(login.ip_address !== null, true);
    assert.equal((await as.estate.get('/api/audit')).status, 403);

    const mine = await as.employee.get('/api/notifications');
    assert.ok(mine.json.meta.total > 0);
    assert.equal(mine.json.is_admin, false);
    const everyone = await as.admin.get('/api/notifications?channel=whatsapp');
    assert.equal(everyone.json.is_admin, true);
    assert.ok(everyone.json.data.every((n) => n.channel === 'whatsapp'));
  });

  test('logout invalidates the session; deactivated users are locked out', async () => {
    const c = client();
    await c.login('water@rqms.test');
    assert.equal((await c.get('/api/dashboard')).status, 200);
    assert.equal((await c.post('/api/auth/logout')).status, 200);
    assert.equal((await c.get('/api/dashboard')).status, 401);

    const users = (await as.admin.get('/api/admin/users?q=Water')).json.data;
    const water = users[0];
    const upd = await as.admin.put(`/api/admin/users/${water.id}`, { name: water.name, email: water.email, is_active: false, roles: water.roles.map((x) => x.id) });
    assert.equal(upd.status, 200, upd.text);
    assert.equal((await as.water.get('/api/dashboard')).status, 401, 'existing session is revoked');
    const attempt = await client().post('/api/auth/login', { email: 'water@rqms.test', password: 'password' });
    assert.equal(attempt.status, 422);
    assert.match(attempt.json.errors.email[0], /inactive/);
  });
});

describe('employee self-signup', () => {
  const form = (over = {}) => ({
    name: 'Sita Verma', email: 'sita@example.com', mobile: '9811111111',
    password: 'longenough1', password_confirmation: 'longenough1', ...over,
  });

  test('public config advertises signup', async () => {
    const c = client();
    const r = await c.get('/api/auth/config');
    assert.equal(r.status, 200);
    assert.equal(r.json.signup, true);
  });

  test('registers an employee (no auto-login) who then signs in with the employee role only', async () => {
    const c = client();
    // try to smuggle in privileges: unknown fields must be ignored
    const superRole = (await as.admin.get('/api/admin/roles')).json.roles.find((r) => r.slug === 'super_admin');
    const res = await c.post('/api/auth/register', form({ roles: [superRole.id], role: 'super_admin', is_active: true, permissions: ['users.manage'] }));
    assert.equal(res.status, 201, res.text);
    assert.match(res.json.message, /Please sign in/);
    assert.equal(res.json.user, undefined, 'registration returns no user / session');

    // signing up does NOT sign in
    assert.equal((await c.get('/api/dashboard')).status, 401);
    assert.equal((await c.get('/api/auth/me')).json.user, null);

    // password is stored hashed; phone stored normalised; account is active
    const [[row]] = await pool.query("SELECT password, mobile, is_active FROM users WHERE email = 'sita@example.com'");
    assert.notEqual(row.password, 'longenough1');
    assert.equal(row.mobile, '9811111111');
    assert.equal(row.is_active, 1);

    // now sign in: employee role only, no permissions, profile not started
    const me = await c.login('sita@example.com', 'longenough1');
    assert.deepEqual(me.user.roles, ['employee']);
    assert.deepEqual(me.user.permissions, []);
    assert.equal(me.user.name, 'Sita Verma');
    assert.equal(me.user.mobile, '9811111111');
    assert.equal(me.user.profile, null);
    assert.equal(me.user.profile_complete, false);
    assert.deepEqual(me.user.missing_profile_fields, [
      'Employee ID', 'PF number', "Father's name", 'Date of birth', 'Current address',
      'Designation', 'Department', 'Station', 'Division', 'Railway zone',
      'Category', 'Service type', 'Grade pay', 'Pay level', 'Date of joining', 'Retirement date',
    ]);
    for (const url of ['/api/quarters', '/api/admin/users', '/api/audit', '/api/reports', '/api/waiting-list']) {
      assert.equal((await c.get(url)).status, 403, url);
    }

    const audit = (await as.admin.get('/api/audit?action=auth.register')).json;
    assert.equal(audit.data.length, 1);
    assert.equal(audit.data[0].description, 'Employee self-registered');
  });

  test('profile must be completed first: cannot apply until it is, then everything unlocks', async () => {
    const c = client();
    await c.login('sita@example.com', 'longenough1');

    // 1. no profile at all
    const fd0 = new FormData();
    fd0.append('preferred_quarter_type', 'II'); fd0.append('colony_1', 'Railway Colony A');
    const blocked = await c.form('/api/applications', fd0);
    assert.equal(blocked.status, 422);
    assert.match(blocked.json.message, /complete your profile first/i);

    // 2. every field is required by the profile form
    const incomplete = await c.put('/api/profile', { name: 'Sita Verma', mobile: '9811111111', employee_id: 'EMP7777', category: 'GENERAL', service_type: 'non_essential' });
    assert.equal(incomplete.status, 422);
    for (const f of ['pf_number', 'father_name', 'date_of_birth', 'current_address', 'designation', 'department', 'station', 'division', 'railway_zone', 'grade_pay', 'pay_level', 'date_of_joining', 'retirement_date']) {
      assert.ok(incomplete.json.errors[f], `${f} is required`);
    }
    assert.equal((await c.get('/api/auth/me')).json.user.profile_complete, false);

    // 3. complete it
    const ok = await c.put('/api/profile', fullProfile({ name: 'Sita Verma', mobile: '9811111111', employee_id: 'EMP7777', pf_number: 'PF7777', designation: 'Clerk' }));
    assert.equal(ok.status, 200, ok.text);
    const me = (await c.get('/api/auth/me')).json.user;
    assert.equal(me.profile_complete, true);
    assert.deepEqual(me.missing_profile_fields, []);
    assert.equal((await c.get('/api/profile')).json.profile_complete, true);

    // 4. now applying works, and login by the new employee ID works too
    const fd = new FormData();
    fd.append('preferred_quarter_type', 'II'); fd.append('colony_1', 'Railway Colony A');
    assert.equal((await c.form('/api/applications', fd)).status, 201);
    assert.equal((await client().post('/api/auth/login', { email: 'EMP7777', password: 'longenough1' })).status, 200, 'employee-id login works too');
  });

  test('signup details are carried into the profile; name/phone editable, email is not', async () => {
    const c = client();
    await c.login('sita@example.com', 'longenough1');
    const g = (await c.get('/api/profile')).json;
    assert.equal(g.user.name, 'Sita Verma');
    assert.equal(g.user.email, 'sita@example.com');
    assert.equal(g.user.mobile, '9811111111');

    // correcting name + phone through the profile works; an email in the payload is ignored
    const res = await c.put('/api/profile', fullProfile({ name: 'Sita K. Verma', mobile: '+91 98111-22222', employee_id: 'EMP7777', pf_number: 'PF7777', email: 'hacker@example.com' }));
    assert.equal(res.status, 200, res.text);
    const after = (await c.get('/api/profile')).json.user;
    assert.equal(after.name, 'Sita K. Verma');
    assert.equal(after.mobile, '+919811122222');
    assert.equal(after.email, 'sita@example.com');
    await c.put('/api/profile', fullProfile({ name: 'Sita Verma', mobile: '9811111111', employee_id: 'EMP7777', pf_number: 'PF7777' }));
  });

  test('profile sanity rules and the completeness rule', async () => {
    const c = client();
    await c.login('sita@example.com', 'longenough1');
    const base = { employee_id: 'EMP7777', pf_number: 'PF7777', name: 'Sita Verma', mobile: '9811111111' };

    const early = await c.put('/api/profile', fullProfile({ ...base, retirement_date: isoYears(-6) }));
    assert.equal(early.status, 422);
    assert.match(early.json.errors.retirement_date[0], /after the date of joining/);
    const future = await c.put('/api/profile', fullProfile({ ...base, date_of_joining: isoYears(1), retirement_date: isoYears(30) }));
    assert.equal(future.status, 422);
    assert.match(future.json.errors.date_of_joining[0], /future/);
    // personal details
    const dobFuture = await c.put('/api/profile', fullProfile({ ...base, date_of_birth: isoYears(1) }));
    assert.equal(dobFuture.status, 422);
    assert.match(dobFuture.json.errors.date_of_birth[0], /in the past/);
    const joinBeforeBirth = await c.put('/api/profile', fullProfile({ ...base, date_of_birth: isoYears(-3), date_of_joining: isoYears(-5) }));
    assert.equal(joinBeforeBirth.status, 422);
    assert.match(joinBeforeBirth.json.errors.date_of_joining[0], /after the date of birth/);
    assert.ok((await c.put('/api/profile', fullProfile({ ...base, father_name: '' }))).json.errors.father_name);
    assert.ok((await c.put('/api/profile', fullProfile({ ...base, current_address: '   ' }))).json.errors.current_address);
    assert.equal((await c.put('/api/profile', fullProfile({ ...base, current_address: 'x'.repeat(501) }))).status, 422);
    assert.equal((await c.put('/api/profile', fullProfile({ ...base, grade_pay: '' }))).status, 422);
    assert.equal((await c.put('/api/profile', fullProfile({ ...base, grade_pay: -5 }))).status, 422);
    assert.equal((await c.put('/api/profile', fullProfile({ ...base, mobile: '123' }))).status, 422);
    assert.equal((await c.put('/api/profile', fullProfile({ ...base, category: 'XYZ' }))).status, 422);
    assert.equal((await c.put('/api/profile', fullProfile({ ...base, retirement_date: 'not-a-date' }))).status, 422);

    // a profile created before a field became mandatory (e.g. PF number) is treated as incomplete
    await pool.query("UPDATE employee_profiles SET pf_number = NULL WHERE employee_id = 'EMP7777'");
    let me = (await c.get('/api/auth/me')).json.user;
    assert.equal(me.profile_complete, false);
    assert.deepEqual(me.missing_profile_fields, ['PF number']);
    const fd = new FormData(); fd.append('preferred_quarter_type', 'II'); fd.append('colony_1', 'Railway Colony A');
    const blocked = await c.form('/api/applications', fd);
    assert.equal(blocked.status, 422);
    assert.match(blocked.json.message, /PF number/);
    await c.put('/api/profile', fullProfile({ ...base }));
    me = (await c.get('/api/auth/me')).json.user;
    assert.equal(me.profile_complete, true);
  });

  test('colony list for the application form', async () => {
    assert.equal((await client().get('/api/colonies')).status, 401);
    const c = client();
    await c.login('sita@example.com', 'longenough1');
    const all = (await c.get('/api/colonies')).json.data;
    // (Colony Z was added to the inventory by the quarter-master test above)
    assert.deepEqual(all.map((x) => x.colony_name), ['Colony Z', 'Officers Enclave', 'Railway Colony A', 'Railway Colony B', 'Railway Colony C']);
    const typeIII = (await c.get('/api/colonies?type=III&station=NDLS')).json.data;
    assert.equal(typeIII.length, 1);
    assert.deepEqual(typeIII[0], { colony_name: 'Railway Colony A', quarters: 2, vacant: typeIII[0].vacant });
    const typeIV = (await c.get('/api/colonies?type=IV')).json.data;
    assert.deepEqual(typeIV.map((x) => [x.colony_name, x.quarters]), [['Colony Z', 1], ['Railway Colony B', 2]]);
    assert.equal((await c.get('/api/colonies?type=VI')).json.data.length, 0);
    assert.equal((await c.get('/api/colonies?station=NOWHERE')).json.data.length, 0);
    // names and counts only - nothing about occupants
    assert.deepEqual(Object.keys(all[0]).sort(), ['colony_name', 'quarters', 'vacant']);
  });

  test('applying with up to 3 colonies in priority order', async () => {
    const c = client();
    await c.login('sita@example.com', 'longenough1');
    const apply = (fields) => {
      const fd = new FormData(); fd.append('preferred_quarter_type', 'III');
      for (const [k, v] of Object.entries(fields)) fd.append(k, v);
      return c.form('/api/applications', fd);
    };

    const ok = await apply({ colony_1: 'Saket', colony_2: '  Hauz Khas  ', colony_3: 'Connaught Place' });
    assert.equal(ok.status, 201, ok.text);
    const d = (await c.get(`/api/applications/${ok.json.id}`)).json.application;
    assert.deepEqual(d.colony_preferences, [
      { priority: 1, colony_name: 'Saket' }, { priority: 2, colony_name: 'Hauz Khas' }, { priority: 3, colony_name: 'Connaught Place' },
    ]);
    assert.equal(d.preferred_colony, 'Saket', 'first choice is kept on the application itself');

    // one choice is enough; two is fine
    assert.equal((await apply({ colony_1: 'Railway Colony A' })).status, 201);
    const two = await apply({ colony_1: 'Railway Colony B', colony_2: 'Railway Colony A' });
    assert.equal((await c.get(`/api/applications/${two.json.id}`)).json.application.colony_preferences.length, 2);

    // rules: first choice required, no gaps, no repeats (case-insensitive), length limit
    const none = await apply({});
    assert.equal(none.status, 422);
    assert.ok(none.json.errors.colony_1);
    const gap = await apply({ colony_1: 'Saket', colony_3: 'Hauz Khas' });
    assert.equal(gap.status, 422);
    assert.match(gap.json.errors.colony_3[0], /second choice/i);
    const dup = await apply({ colony_1: 'Saket', colony_2: 'SAKET' });
    assert.equal(dup.status, 422);
    assert.match(dup.json.errors.colony_2[0], /different colony/);
    assert.equal((await apply({ colony_1: 'x'.repeat(256) })).status, 422);

    // another employee cannot read these preferences
    const other = client(); await other.login('emp2@rqms.test');
    assert.equal((await other.get(`/api/applications/${ok.json.id}`)).status, 403);

    // after verification the applicant joins the queue with the choices visible to staff
    await verifyProfileOf('EMP7777');
    assert.equal((await as.clerk.post(`/api/applications/${ok.json.id}/verify`)).status, 200);
    const entry = (await as.clerk.get('/api/waiting-list?type=III&station=NDLS')).json.entries.find((e) => e.application.id === ok.json.id);
    assert.deepEqual(entry.application.colony_preferences.map((p) => p.colony_name), ['Saket', 'Hauz Khas', 'Connaught Place']);
  });

  test('validation: duplicate email, weak / mismatched password, missing fields', async () => {
    const c = client();
    const dup = await c.post('/api/auth/register', form());
    assert.equal(dup.status, 422);
    assert.match(dup.json.errors.email[0], /already exists/);
    assert.equal((await c.post('/api/auth/register', form({ email: 'SITA@EXAMPLE.COM' }))).status, 422, 'email match is case-insensitive');

    const weak = await c.post('/api/auth/register', form({ email: 'a1@example.com', password: 'short', password_confirmation: 'short' }));
    assert.equal(weak.status, 422);
    assert.match(weak.json.errors.password[0], /at least 8/);

    const mismatch = await c.post('/api/auth/register', form({ email: 'a2@example.com', password_confirmation: 'different123' }));
    assert.equal(mismatch.status, 422);
    assert.match(mismatch.json.errors.password_confirmation[0], /does not match/);

    const long = await c.post('/api/auth/register', form({ email: 'a3@example.com', password: 'x'.repeat(73), password_confirmation: 'x'.repeat(73) }));
    assert.equal(long.status, 422);

    // phone number is required and must look like a phone number
    assert.equal((await c.post('/api/auth/register', form({ email: 'p1@example.com', mobile: '' }))).status, 422, 'phone required');
    const noPhone = form({ email: 'p1@example.com' }); delete noPhone.mobile;
    assert.ok((await c.post('/api/auth/register', noPhone)).json.errors.mobile, 'phone missing');
    for (const bad of ['12345', 'abcdefghij', '98111-1111', '+1234567890123456789']) {
      const r = await c.post('/api/auth/register', form({ email: 'p2@example.com', mobile: bad }));
      assert.equal(r.status, 422, `rejects phone "${bad}"`);
      assert.match(r.json.errors.mobile[0], /valid phone number/);
    }
    // formatting characters are accepted and stripped
    assert.equal((await c.post('/api/auth/register', form({ email: 'p3@example.com', mobile: '+91 98765-43210' }))).status, 201);
    assert.equal((await pool.query("SELECT mobile FROM users WHERE email = 'p3@example.com'"))[0][0].mobile, '+919876543210');

    const empty = await c.post('/api/auth/register', {});
    assert.equal(empty.status, 422);
    assert.ok(empty.json.errors.name && empty.json.errors.email && empty.json.errors.password && empty.json.errors.mobile);
    assert.equal((await c.post('/api/auth/register', form({ email: 'not-an-email' }))).status, 422);

    // none of the failed attempts created an account
    assert.equal((await pool.query("SELECT COUNT(*) AS n FROM users WHERE email LIKE 'a_@example.com' OR email IN ('not-an-email', 'p1@example.com', 'p2@example.com')"))[0][0].n, 0);
  });

  test('can be switched off with ALLOW_SIGNUP=false', async () => {
    config.auth.allowSignup = false;
    try {
      const c = client();
      assert.equal((await c.get('/api/auth/config')).json.signup, false);
      const res = await c.post('/api/auth/register', form({ email: 'blocked@example.com' }));
      assert.equal(res.status, 403);
      assert.equal((await pool.query("SELECT COUNT(*) AS n FROM users WHERE email = 'blocked@example.com'"))[0][0].n, 0);
    } finally {
      config.auth.allowSignup = true;
    }
  });
});

describe('clerk: verify employee profiles, then check applications', () => {
  let sita, sitaProfileId, waitlistedApp;
  before(async () => {
    sita = client();
    await sita.login('sita@example.com', 'longenough1');
    // an earlier test already had her verified: start this suite from "waiting for the clerk"
    await pool.query("UPDATE employee_profiles SET verification_status = 'pending', verified_by = NULL, verified_at = NULL, verification_remarks = NULL WHERE employee_id = 'EMP7777'");
    sitaProfileId = await profileIdOf('EMP7777');
  });
  const sitaProfile = (over = {}) => fullProfile({ name: 'Sita Verma', mobile: '9811111111', employee_id: 'EMP7777', pf_number: 'PF7777', ...over });

  test('who may do what', async () => {
    assert.equal((await as.employee.get('/api/employees')).status, 403);
    assert.equal((await as.employee.post(`/api/employees/${sitaProfileId}/verify`)).status, 403);
    assert.equal((await as.estate.get('/api/employees')).status, 200, 'staff can look');
    assert.equal((await as.admin.get('/api/employees')).status, 200, 'admin can look');
    assert.equal((await as.estate.post(`/api/employees/${sitaProfileId}/verify`)).status, 403, 'but only the clerk verifies');
    assert.equal((await as.admin.post(`/api/employees/${sitaProfileId}/verify`)).status, 403);
    const me = (await as.clerk.get('/api/auth/me')).json;
    assert.ok(me.user.permissions.includes('profile.verify'));
    assert.equal((await as.estate.get('/api/auth/me')).json.badges.profiles_to_verify, 0, 'no badge without the permission');
  });

  test('the queue lists complete employee profiles only, with filters, search and counts', async () => {
    const all = (await as.clerk.get('/api/employees')).json;
    const ids = all.data.map((p) => p.employee_id);
    assert.ok(ids.includes('EMP7777') && ids.includes('EMP1001'));
    assert.ok(!ids.includes('CLK2001'), 'staff accounts are not in the employee queue');
    assert.equal(all.counts.pending + all.counts.verified + all.counts.changes_requested, all.meta.total);

    const pending = (await as.clerk.get('/api/employees?status=pending')).json;
    assert.ok(pending.data.every((p) => p.verification_status === 'pending'));
    assert.ok(pending.data.some((p) => p.employee_id === 'EMP7777'));
    assert.equal(pending.data.find((p) => p.employee_id === 'EMP7777').name, 'Sita Verma');
    assert.deepEqual((await as.clerk.get('/api/employees?q=PF7777')).json.data.map((p) => p.employee_id), ['EMP7777']);
    assert.deepEqual((await as.clerk.get('/api/employees?q=sita@example')).json.data.map((p) => p.employee_id), ['EMP7777']);

    // the clerk's sidebar badge is the number of pending profiles
    assert.equal((await as.clerk.get('/api/auth/me')).json.badges.profiles_to_verify, pending.meta.total);

    // a profile that is not complete yet is not queued
    await pool.query("UPDATE employee_profiles SET pf_number = NULL WHERE employee_id = 'EMP7777'");
    assert.ok(!(await as.clerk.get('/api/employees?q=EMP7777')).json.data.length);
    await pool.query("UPDATE employee_profiles SET pf_number = 'PF7777' WHERE employee_id = 'EMP7777'");
  });

  test('detail page data', async () => {
    const d = (await as.clerk.get(`/api/employees/${sitaProfileId}`)).json;
    assert.equal(d.user.email, 'sita@example.com');
    assert.equal(d.profile.pf_number, 'PF7777');
    assert.equal(d.profile.father_name, 'Mohan Lal');
    assert.ok(d.applications.length >= 1);
    assert.equal(d.verification.status, 'pending');
    assert.equal((await as.clerk.get('/api/employees/999999')).status, 404);
  });

  test('send back for changes -> employee sees why -> fixing it queues it again', async () => {
    const blank = await as.clerk.post(`/api/employees/${sitaProfileId}/request-changes`, { remarks: '   ' });
    assert.equal(blank.status, 422);
    assert.ok(blank.json.errors.remarks, 'remarks are required');

    const res = await as.clerk.post(`/api/employees/${sitaProfileId}/request-changes`, { remarks: 'Date of birth does not match the service record.' });
    assert.equal(res.status, 200, res.text);
    assert.equal((await as.clerk.post(`/api/employees/${sitaProfileId}/request-changes`, { remarks: 'again' })).status, 422, 'already sent back');

    const v = (await sita.get('/api/profile')).json.verification;
    assert.equal(v.status, 'changes_requested');
    assert.equal(v.remarks, 'Date of birth does not match the service record.');
    assert.equal(v.verified_by_name, 'Sunita Devi');

    // saving without changing anything keeps it waiting for the real correction
    assert.equal((await sita.put('/api/profile', sitaProfile({ date_of_joining: (await sita.get('/api/profile')).json.profile.date_of_joining, retirement_date: (await sita.get('/api/profile')).json.profile.retirement_date, date_of_birth: (await sita.get('/api/profile')).json.profile.date_of_birth, grade_pay: 2800 }))).status, 200);
    assert.equal((await sita.get('/api/profile')).json.verification.status, 'changes_requested');

    // the employee was told
    const note = (await as.admin.get('/api/notifications?channel=email')).json.data.find((n) => n.event === 'profile_changes_requested');
    assert.ok(note && /Date of birth does not match/.test(note.message) && note.user_name === 'Sita Verma');

    // a real correction puts it back in the queue and clears the old remarks
    const fix = await sita.put('/api/profile', sitaProfile({ date_of_birth: isoYears(-31) }));
    assert.equal(fix.status, 200, fix.text);
    const after = (await sita.get('/api/profile')).json.verification;
    assert.equal(after.status, 'pending');
    assert.equal(after.remarks, null);
    assert.equal((await as.clerk.get(`/api/employees/${sitaProfileId}`)).json.profile.date_of_birth, isoYears(-31));
  });

  test('verify -> employee sees it -> any later change needs re-verification', async () => {
    assert.equal((await sita.get('/api/auth/me')).json.user.profile.verification_status, 'pending');
    const ok = await as.clerk.post(`/api/employees/${sitaProfileId}/verify`);
    assert.equal(ok.status, 200, ok.text);
    assert.equal((await as.clerk.post(`/api/employees/${sitaProfileId}/verify`)).status, 422, 'already verified');
    const v = (await sita.get('/api/profile')).json.verification;
    assert.equal(v.status, 'verified');
    assert.equal(v.verified_by_name, 'Sunita Devi');
    assert.ok(v.verified_at);
    assert.ok((await as.admin.get('/api/audit?action=profile.verify')).json.data.length >= 1);

    // unchanged save: stays verified
    const p = (await sita.get('/api/profile')).json.profile;
    const same = await sita.put('/api/profile', sitaProfile({
      date_of_birth: p.date_of_birth, date_of_joining: p.date_of_joining, retirement_date: p.retirement_date, grade_pay: p.grade_pay,
      pay_level: p.pay_level, designation: p.designation, current_address: p.current_address, father_name: p.father_name,
    }));
    assert.equal(same.status, 200, same.text);
    assert.equal((await sita.get('/api/profile')).json.verification.status, 'verified');

    // changing the address (or anything) sends it back to the clerk
    const changed = await sita.put('/api/profile', sitaProfile({
      date_of_birth: p.date_of_birth, date_of_joining: p.date_of_joining, retirement_date: p.retirement_date, grade_pay: p.grade_pay,
      pay_level: p.pay_level, designation: p.designation, father_name: p.father_name, current_address: 'New address, Sector 5, Delhi',
    }));
    assert.match(changed.json.message, /verify the changes again/);
    assert.equal((await sita.get('/api/profile')).json.verification.status, 'pending');
  });

  test('applications: the clerk can only proceed once the profile is verified; the clerk can also reject', async () => {
    const apply = async () => {
      const fd = new FormData(); fd.append('preferred_quarter_type', 'II'); fd.append('colony_1', 'Railway Colony C');
      const r = await sita.form('/api/applications', fd);
      assert.equal(r.status, 201, r.text);
      return r.json.id;
    };
    const a1 = await apply();

    // profile is pending again -> the application cannot be verified yet
    const blocked = await as.clerk.post(`/api/applications/${a1}/verify`);
    assert.equal(blocked.status, 422);
    assert.ok(blocked.json.errors.profile);
    const detail = (await as.clerk.get(`/api/applications/${a1}`)).json.application;
    assert.equal(detail.profile_verification_status, 'pending');
    assert.equal(detail.profile_id, sitaProfileId);

    // reject: remarks required, employee/others cannot, only while it is waiting for the clerk
    assert.equal((await as.clerk.post(`/api/applications/${a1}/reject`, {})).status, 422);
    assert.equal((await sita.post(`/api/applications/${a1}/reject`, { remarks: 'x' })).status, 403);
    assert.equal((await as.estate.post(`/api/applications/${a1}/reject`, { remarks: 'x' })).status, 403);
    const rej = await as.clerk.post(`/api/applications/${a1}/reject`, { remarks: 'Service certificate is missing.' });
    assert.equal(rej.status, 200, rej.text);
    const r = (await sita.get(`/api/applications/${a1}`)).json.application;
    assert.equal(r.status, 'rejected');
    assert.equal(r.remarks, 'Service certificate is missing.');
    assert.equal((await as.clerk.post(`/api/applications/${a1}/reject`, { remarks: 'again' })).status, 422, 'only submitted applications');
    const note = (await as.admin.get('/api/notifications?channel=email')).json.data.find((n) => n.event === 'application_rejected');
    assert.ok(note && /Service certificate is missing/.test(note.message));

    // verified profile -> the clerk can proceed
    assert.equal((await as.clerk.post(`/api/employees/${sitaProfileId}/verify`)).status, 200);
    const a2 = await apply();
    assert.equal((await as.clerk.post(`/api/applications/${a2}/verify`)).status, 200);
    assert.equal((await sita.get(`/api/applications/${a2}`)).json.application.status, 'waitlisted');
    waitlistedApp = a2;
  });

  test('the clerk forwards to the admin; the admin approves or rejects', async () => {
    const fdApp = (type, colony = 'Railway Colony C') => {
      const fd = new FormData(); fd.append('preferred_quarter_type', type); fd.append('colony_1', colony);
      return sita.form('/api/applications', fd).then((r) => { assert.equal(r.status, 201, r.text); return r.json.id; });
    };
    const adminNotes = async (event) => (await as.admin.get('/api/notifications?channel=email')).json.data.filter((n) => n.event === event);

    // ---- who may forward, and when ----
    assert.equal((await sita.post(`/api/applications/${waitlistedApp}/forward`)).status, 403);
    assert.equal((await as.estate.post(`/api/applications/${waitlistedApp}/forward`)).status, 403);
    const fresh = await fdApp('II');
    const early = await as.clerk.post(`/api/applications/${fresh}/forward`);
    assert.equal(early.status, 422);
    assert.match(early.json.errors.status[0], /Verify the application first/);

    // ---- forward ----
    const before = (await as.admin.get('/api/auth/me')).json.badges.applications_to_decide;
    const fw = await as.clerk.post(`/api/applications/${waitlistedApp}/forward`, { remarks: 'Details and documents checked.' });
    assert.equal(fw.status, 200, fw.text);
    const a = (await as.admin.get(`/api/applications/${waitlistedApp}`)).json.application;
    assert.equal(a.status, 'forwarded');
    assert.equal(a.forwarded_by_name, 'Sunita Devi');
    assert.equal(a.forward_remarks, 'Details and documents checked.');
    assert.ok(a.forwarded_at && a.verified_by_name === 'Sunita Devi');
    assert.equal((await as.clerk.post(`/api/applications/${waitlistedApp}/forward`)).status, 422, 'only once');
    assert.equal((await as.clerk.post(`/api/applications/${waitlistedApp}/reject`, { remarks: 'too late' })).status, 422, 'the clerk cannot reject after forwarding');

    // admin is told, so is the employee, and the admin sidebar badge counts it
    assert.ok((await adminNotes('application_forwarded')).some((n) => n.user_name === 'System Admin' && n.message.includes('waiting for your approval')));
    assert.ok((await adminNotes('application_forwarded_employee')).some((n) => n.user_name === 'Sita Verma'));
    assert.equal((await as.admin.get('/api/auth/me')).json.badges.applications_to_decide, before + 1);
    assert.equal((await as.clerk.get('/api/auth/me')).json.badges.applications_to_decide, 0, 'the clerk is not an approver');

    // ---- the admin decides ----
    assert.equal((await as.clerk.post(`/api/applications/${waitlistedApp}/decide`, { decision: 'approve' })).status, 403);
    assert.equal((await as.admin.post(`/api/applications/${waitlistedApp}/decide`, { decision: 'maybe' })).status, 422);
    const ok = await as.admin.post(`/api/applications/${waitlistedApp}/decide`, { decision: 'approve', remarks: 'Approved for allotment.' });
    assert.equal(ok.status, 200, ok.text);
    const done = (await sita.get(`/api/applications/${waitlistedApp}`)).json.application;
    assert.equal(done.status, 'approved');
    assert.equal(done.decided_by_name, 'System Admin');
    assert.equal(done.remarks, 'Approved for allotment.');
    assert.equal((await as.admin.post(`/api/applications/${waitlistedApp}/decide`, { decision: 'reject' })).status, 422, 'already decided');
    assert.ok((await adminNotes('application_approved')).some((n) => n.user_name === 'Sita Verma'));

    // staff making an offer can see which applicants the admin has approved
    const q301 = (await as.clerk.get('/api/quarters?q=Q-301')).json.data[0];                 // Type-II, Colony C
    const sugg = (await as.clerk.get(`/api/quarters/${q301.id}`)).json.suggestions;
    assert.equal(sugg.find((e) => e.application.id === waitlistedApp).application.status, 'approved');

    // ---- the admin rejects ----
    const toReject = await fdApp('II');
    assert.equal((await as.clerk.post(`/api/applications/${toReject}/verify`)).status, 200);
    assert.equal((await as.clerk.post(`/api/applications/${toReject}/forward`)).status, 200);
    const queued = () => as.clerk.get('/api/waiting-list?type=II&station=NDLS').then((r) => r.json.entries.some((e) => e.application.id === toReject));
    assert.equal(await queued(), true);
    assert.equal((await as.admin.post(`/api/applications/${toReject}/decide`, { decision: 'reject', remarks: 'Quarter not admissible for this grade.' })).status, 200);
    assert.equal((await sita.get(`/api/applications/${toReject}`)).json.application.status, 'rejected');
    assert.equal(await queued(), false, 'a rejected application leaves the waiting list');
    assert.ok((await adminNotes('application_rejected')).some((n) => /not admissible/.test(n.message)));

    // ---- an ineligible application cannot be forwarded, the clerk can reject it ----
    const tooJunior = await fdApp('VI');
    assert.equal((await as.clerk.post(`/api/applications/${tooJunior}/verify`)).status, 200);
    assert.equal((await sita.get(`/api/applications/${tooJunior}`)).json.application.status, 'ineligible');
    assert.equal((await as.clerk.post(`/api/applications/${tooJunior}/forward`)).status, 422);
    assert.equal((await as.clerk.post(`/api/applications/${tooJunior}/reject`, { remarks: 'Not eligible for Type-VI.' })).status, 200);
  });
});
