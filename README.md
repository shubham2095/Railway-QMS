# Railway Quarter Management System (RQMS)

Full-stack **Node.js · Express · React · MySQL (XAMPP)** port of the original Laravel 12 application.
It digitises the whole life-cycle of railway residential quarters:

> application → eligibility & priority → waiting list → allotment → occupancy →
> vacation clearance → retirement / retention

…with role-based access control, a five-level departmental clearance workflow, audit trail,
document uploads, certificate / NOC generation and an MIS dashboard.

| | |
|---|---|
| ![Login](docs/screenshots/login.png) | ![Dashboard](docs/screenshots/dashboard.png) |
| ![Application](docs/screenshots/application.png) | ![Clearance](docs/screenshots/clearance.png) |

## Stack

| Layer | Technology |
|---|---|
| Database | MySQL / MariaDB (the one bundled with **XAMPP**) |
| API | Node.js 20.19+ / 22 · Express 5 · `mysql2` · `zod` validation · `multer` uploads |
| Auth | Email **or** Employee-ID login · employee self-signup · bcrypt · JWT in an `httpOnly` cookie (sliding 120 min) |
| UI | React 18 · React Router 7 · Tailwind CSS 3 · Vite (same look & feel as the Blade version) |

```
Railway-QMS/
├── database/schema.sql        # full schema - import with phpMyAdmin or the mysql CLI
├── backend/                   # Express API
│   └── src/
│       ├── config/            # env + domain rules (priority weights, retention, ...)
│       ├── services/          # business logic (eligibility, priority, waiting list, allotment, vacation, retirement, certificates, audit)
│       ├── routes/            # REST endpoints, one file per module
│       ├── middleware/        # session auth, role / permission guards
│       └── scripts/           # setup.js (create DB + tables) and seed.js (roles, demo data)
└── frontend/                  # React single-page app (Vite)
```

---

## Run it on Windows with XAMPP

### 1. Prerequisites
* **XAMPP** – only the **MySQL** module is needed (Apache is optional, handy for phpMyAdmin).
* **Node.js 22 LTS** (or 20.19+) from <https://nodejs.org>.

### 2. Start MySQL
Open the XAMPP Control Panel and click **Start** next to **MySQL**.
The defaults (`root`, empty password, port `3306`) already match `backend/.env.example`.

### 3. Create the database
Pick **one** of these:

**A – one command (recommended)**
```bash
cd backend
copy .env.example .env        # macOS/Linux: cp .env.example .env
npm install
npm run db:setup              # creates DB "rqms", all tables, roles and demo data
```

**B – phpMyAdmin**
1. Open <http://localhost/phpmyadmin> → **New** → create a database named `rqms` (collation `utf8mb4_unicode_ci`) → open it → **Import** → choose `database/schema.sql` → **Go**.
2. Then, in `backend/`: `copy .env.example .env`, `npm install`, `npm run db:seed` to load roles, permissions and demo data.

> `npm run db:setup` never wipes existing data. Use `npm run db:fresh` when you *want* a clean reset.

### 4. Start the app (two terminals)
```bash
# terminal 1 - API on http://localhost:5000
cd backend
npm run dev

# terminal 2 - React app on http://localhost:5173
cd frontend
npm install
npm run dev
```
Open **<http://localhost:5173>** and sign in with a demo account.

> The Vite dev server proxies `/api` to the backend, so the login cookie is same-origin – no CORS setup needed.

### Single-process mode (like a production deploy)
```bash
npm run install:all     # once, from the repo root
npm run build           # builds frontend/dist
npm start               # Express serves the API *and* the React app on http://localhost:5000
```

### Deploy to a server / Hostinger subdomain
See **[docs/DEPLOY-HOSTINGER.md](docs/DEPLOY-HOSTINGER.md)** – step-by-step for Hostinger's *Node.js Web App* + MySQL (no SSH needed:
set `AUTO_BOOTSTRAP=true` and the app creates its tables, roles and first admin on first start). It also covers a VPS.

### Demo accounts
All seeded accounts use the password **`password`**.

| Email | Employee ID | Role |
|---|---|---|
| `emp@rqms.test` / `emp2@rqms.test` | EMP1001 / EMP1002 | employee |
| `clerk@rqms.test` | CLK2001 | quarter_clerk |
| `estate@rqms.test` | EST3001 | estate_officer |
| `electrical@rqms.test` | ELE4001 | electrical_dept |
| `water@rqms.test` | WAT5001 | water_dept |
| `accounts@rqms.test` | ACC6001 | accounts_dept |
| `admin@rqms.test` | ADM7001 | admin |
| `super@rqms.test` | SUP8001 | super_admin |

The seed also creates a quarter inventory (Q-101 … Q-401, NDLS colonies) and routes two applications
through the real eligibility + priority engine, so the waiting list is populated on first start
(Ravi Kumar 70 pts → rank 1, Meena Iyer 65 pts → rank 2).

### End-to-end walkthrough
0. *(New employees)* On the login page click **Create an account** → full name, email ID, phone number, password. The account gets the `employee` role only and you are sent to the login page; after signing in, the **profile must be completed first** (the rest of the app stays locked until then). Name, email ID and phone number from signup are pre-filled; the employee adds father's name, date of birth, current address, Employee ID, **PF number**, designation, department, station, division, railway zone, category, service type, grade pay, pay level, date of joining and retirement date (all required; the single list lives in `backend/src/services/profile.js`). Staff accounts (clerk, admin, …) are created by an admin under *Users & Roles*.
1. **Employee** (`emp@`) → *My Profile* → *Applications → New application*: pick the quarter type and up to **3 preferred colonies in order of priority** (1st choice required; colonies from the quarter inventory are offered as one-click chips, any area name can also be typed), then attach documents.
2. **Quarter Clerk** (`clerk@`) does **not** verify employee profiles; the clerk checks the application itself: open it → **Approve & forward to admin**. One click: the eligibility + priority engine runs and, if the applicant is eligible, the application is **forwarded to the admin automatically** (with the clerk's optional note) and joins the **approval line** of its quarter type; if not eligible it stays with the clerk, who can **Reject application** with a reason or re-evaluate. The *Employees* page is a read-only directory of the details employees entered. An employee can have only **one open application** at a time. The admin works from **Approval Queue**: one ranked line per quarter type (priority score, then earliest application), showing how many quarters are vacant; they select the top N / top 10% / top 20% and **approve them in one go** - approved applicants leave the line and everyone behind moves up. Quarters are offered only to approved applicants (*Approved Applicants* list / the offer screen of a vacant quarter), which show every applicant's colony choices ("Colony A is their choice #1"); the queue itself is still ranked by priority score.
3. **Admin** (`admin@`) → the application now shows *Forwarded to admin* (sidebar badge) → **Approve** or **Reject** with remarks. The employee is notified either way.
4. **Clerk / Estate Officer** → *Quarter Master* → open a vacant quarter → the matching queue is suggested → **Offer quarter**.
5. **Employee** → *Allotments* → **Accept** the offer.
6. **Clerk** → **Record possession** (starts occupancy; issues possession + occupancy certificates).
7. **Employee** → *Vacations → New request* → starts the clearance chain.
8. **Clerk → Electrical → Water → Accounts → Estate Officer** each act on their step (*Vacations → Awaiting my clearance*). The final approval issues the **NOC / No-Due / Handover** certificates and frees the quarter.
9. **Admin** → *Reports & MIS*, *Audit Trail*, *Users & Roles*.

---

## Configuration (`backend/.env`)

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `5000` | API port |
| `DB_HOST` `DB_PORT` `DB_DATABASE` `DB_USERNAME` `DB_PASSWORD` | `127.0.0.1` `3306` `rqms` `root` *(empty)* | MySQL connection (XAMPP defaults) |
| `DATABASE_URL` | – | Optional single connection string `mysql://user:pass@host:3306/db` (overrides the `DB_*` values) |
| `JWT_SECRET` | – | **Required in production.** Long random string used to sign session cookies |
| `AUTO_BOOTSTRAP` `ADMIN_EMAIL` `ADMIN_PASSWORD` | off | On first start: create tables + roles and the first super admin (for hosts without a shell) |
| `STORAGE_DIR` | `backend/storage` | Where uploads and generated certificates are kept |
| `SESSION_LIFETIME` | `120` | Idle session lifetime in minutes |
| `COOKIE_SECURE` | `false` | Set `true` when served over HTTPS |
| `ALLOW_SIGNUP` | `true` | Public employee self-registration on the login page; set `false` to switch it off |
| `APP_TIMEZONE` | `Asia/Kolkata` | Timezone used for all stored timestamps |
| `RQMS_W_*`, `RQMS_RETENTION_DAYS`, `RQMS_OVERSTAY_PENALTY`, … | see `.env.example` | Tunable priority weights & retention rules (Laravel's `config/rqms.php`) |

---

## API overview

All routes are under `/api` and require the session cookie unless noted. Errors use
`{ "message": "...", "errors": { "field": ["..."] } }` (HTTP 422 for validation / business-rule errors, 403 for RBAC).

| Module | Endpoints |
|---|---|
| Auth | `POST /auth/login` · `POST /auth/logout` · `GET /auth/me` *(public, returns `user: null` when signed out)* · `POST /auth/register` *(public employee self-signup)* · `GET /auth/config` |
| Employees (staff, read-only) | `GET /employees?q=` · `GET /employees/:id` |
| Profile (M1) | `GET/PUT /profile` · `POST /profile/family` · `DELETE /profile/family/:id` |
| Colonies | `GET /colonies?type=&station=` *(colony names + counts from the quarter master, for the application form)* |
| Applications (M3-4) | `GET/POST /applications` · `GET /applications/:id` · `POST /applications/:id/verify` *(approve; auto-forwards when eligible)* · `/forward` *(only for an eligible application that was not forwarded yet)* · `/reject` · `/run-engine` · `/decide` · `GET /approval-queue?type=` · `POST /approval-queue/approve {application_ids}` (admin, bulk) · `GET /documents/:id` |
| Waiting list (M5) | `GET /waiting-list?type=&station=` |
| Quarter master (M2) | `GET/POST /quarters` · `GET/PUT /quarters/:id` |
| Allotment (M6-7) | `GET /allotments` · `GET /allotments/:id` · `POST /quarters/:id/offer` · `POST /allotments/:id/respond` · `/possession` |
| Vacation (M8-9) | `GET/POST /vacations` · `GET /vacations/options` · `GET /vacations/:id` · `POST /vacations/:id/act` |
| Retirement (M10) | `GET/POST /retirements` · `POST /retirements/run-cycle` |
| Certificates (M11) | `GET /certificates` · `GET /certificates/:id/view` · `/download` |
| Notifications (M12) | `GET /notifications` |
| Reports (M13) | `GET /reports` |
| Audit (M14) | `GET /audit` |
| Admin | `GET /admin/roles` · `GET/POST /admin/users` · `GET/PUT /admin/users/:id` |

### Roles & permissions
Eight roles (`employee`, `quarter_clerk`, `estate_officer`, `electrical_dept`, `water_dept`, `accounts_dept`, `admin`, `super_admin`)
with the same permission matrix as the Laravel version (`backend/src/scripts/seed.js`). `super_admin` bypasses every permission check.
Rules are enforced in the API; the React app only hides navigation and pages the role cannot use.

---

## Tests

`npm test` (from the repo root or `backend/`) runs an integration suite against a **throw-away `rqms_test` database**
(created and reset automatically – your real `rqms` data is untouched). It drives the real HTTP API through
the complete chain: login & RBAC → priority engine and ranking → uploads → eligibility rejection → offer →
accept → possession → five-level clearance → NOC/certificates → retirement penalty cycle → audit & reports.

---

## Laravel → Node mapping

| Laravel | Node |
|---|---|
| Eloquent models + migrations | plain SQL in `database/schema.sql`, thin `mysql2` helpers in `backend/src/db.js` |
| `DB::transaction` | `transaction()` – nested calls join the outer transaction |
| `Auth::id()` in `AuditService` | `AsyncLocalStorage` request context |
| `role:` / `permission:` middleware | `requireRole()` / `requirePermission()` |
| Form requests / `$request->validate` | `zod` schemas (`backend/src/utils/http.js`) |
| Blade views | React pages in `frontend/src/pages` |
| Session flash messages | route-state flash (`navigate(path, { state: { flash } })`) |
| `Storage::disk('local')` | `backend/storage/` (uploads + generated certificate HTML) |

### Intentional differences from the Laravel original
The business rules are ported 1:1. These small hardening changes were made while porting:

* **Session auth** is a signed `httpOnly` JWT cookie (sliding expiry); deactivating a user revokes their session immediately; login is rate-limited.
* **State guards the UI already implied are now enforced by the API:** verify only when `submitted`; re-run engine / decide only for open applications; an offer can only be answered while `offered`; a quarter can only be offered to an *active* queue entry of the *same type*; a vacation request needs an eligible allotment and cannot be duplicated; a rejected or completed clearance chain cannot be acted on again.
* **Concurrency:** offering a quarter locks the quarter row, so two officers can't allot the same quarter at once.
* **Validation:** `employee_id` uniqueness, `category` / `service_type` enums, duplicate quarter numbers return a clean 422 instead of a database error.
* **Fix:** in the Laravel certificate list, an authenticated user *without* an employee profile could see **every** certificate; here they see none.
* **Added:** `GET /api/documents/:id` to download uploaded application documents (the Blade app stored them but had no download route).

### Carried over unchanged (worth knowing)
* Rejecting an allotment offer releases the quarter but leaves the application as `allotted` and off the waiting list.
* A rejected clearance step marks the request `rejected` and leaves the quarter `vacation_pending`; there is no re-start flow.
* Notifications are **logged** to `notification_logs` (and the console); the e-mail / SMS / WhatsApp senders in `backend/src/services/notifications.js` are stubs to wire to real providers.
* Certificates are rendered to HTML (`backend/storage/certificates/`). Swap `generateCertificate()` in `backend/src/services/certificates.js` for a PDF library if PDFs are needed.
* The *daily* retention cycle is triggered from **Retirement → Run retention cycle**. To automate it, call `POST /api/retirements/run-cycle` from a scheduler (Windows Task Scheduler, cron) with an admin session, or add `node-cron` to the backend.

## Production checklist
* Set a strong `JWT_SECRET`, `NODE_ENV=production`, `COOKIE_SECURE=true` (behind HTTPS), and a real MySQL password.
* `npm run build && npm start` (runs `server.js`), ideally behind a reverse proxy (nginx / IIS / Apache) with HTTPS.
* Back up the `rqms` database **and** `backend/storage/`.
* Do not deploy the demo accounts: use `AUTO_BOOTSTRAP` + `ADMIN_*` (or `npm run db:admin`) for the first admin; the production login page hides the demo buttons unless built with `VITE_SHOW_DEMO=true`.

## License
MIT
