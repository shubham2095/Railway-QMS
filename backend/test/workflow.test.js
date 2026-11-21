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

const { default: mysql } = await import('mysql2/promise');
const { config } = await import('../src/config/index.js');
const fs = await import('node:fs');
const path = await import('node:path');

// --- fresh schema ---
const admin = await mysql.createConnection({ host: config.db.host, port: config.db.port, user: config.db.user, password: config.db.password, multipleStatements: true });
await admin.query(`CREATE DATABASE IF NOT EXISTS \`${config.db.database}\` CHARACTER SET utf8mb4`);
await admin.query(`USE \`${config.db.database}\``);
const schema = fs.readFileSync(path.join(config.root, '..', 'database', 'schema.sql'), 'utf8')
  .split('\n').filter((l) => !/^\s*(CREATE DATABASE|USE)\b/i.test(l)).join('\n');
await admin.query(schema);
await admin.end();

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

const as = {};
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

  test('clerk cannot view reports / admin; admin cannot decide applications', async () => {
    assert.equal((await as.clerk.get('/api/reports')).status, 403);
    assert.equal((await as.clerk.get('/api/admin/users')).status, 403);
    assert.equal((await as.admin.post('/api/applications/1/decide', { decision: 'approve' })).status, 403);
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

    const clash = await newUser.put('/api/profile', { employee_id: 'EMP1001', category: 'GENERAL', service_type: 'non_essential' });
    assert.equal(clash.status, 422, 'employee id must be unique');

    const joined = new Date(); joined.setFullYear(joined.getFullYear() - 5);
    const ok = await newUser.put('/api/profile', {
      employee_id: 'EMP5555', designation: 'Technician', station: 'NDLS', division: 'Delhi', category: 'GENERAL',
      service_type: 'non_essential', date_of_joining: joined.toISOString().slice(0, 10), mobile: '9876543210',
    });
    assert.equal(ok.status, 200, ok.text);
    const p = await newUser.get('/api/profile');
    assert.equal(p.json.profile.service_years, 5);
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
    fd.append('preferred_quarter_type', 'VI');
    fd.append('family_size', '3');
    fd.append('medical_ground', 'true');
    fd.append('document_categories', 'service_certificate');
    fd.append('documents', new Blob([Buffer.from('%PDF-1.4 fake')], { type: 'application/pdf' }), 'cert.pdf');
    const created = await newUser.form('/api/applications', fd);
    assert.equal(created.status, 201, created.text);
    appId = created.json.id;

    // disallowed file type is rejected
    const bad = new FormData();
    bad.append('preferred_quarter_type', 'III');
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

  test('estate officer approves; clerk sees ranked suggestions for a vacant quarter', async () => {
    const apps = await as.estate.get('/api/applications?status=waitlisted');
    ravi = apps.json.data.find((a) => a.employee_name === 'Ravi Kumar');
    assert.ok(ravi);
    assert.equal((await as.estate.post(`/api/applications/${ravi.id}/decide`, { decision: 'approve', remarks: 'ok' })).status, 200);
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
    fd.append('preferred_quarter_type', 'III');
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
