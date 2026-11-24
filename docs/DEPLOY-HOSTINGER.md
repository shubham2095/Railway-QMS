# Deploying RQMS on a Hostinger subdomain

This guide deploys the app to e.g. **`qms.yourdomain.com`** using Hostinger's **Node.js Web App** feature
and a Hostinger **MySQL** database. You do **not** need SSH: on its first start the app creates the tables, the
roles and your first admin account by itself (`AUTO_BOOTSTRAP`).

> **Plan requirement.** Hostinger runs Node.js apps on the **Business** web-hosting plan and on the **Cloud**
> plans (Startup / Professional / Enterprise). The basic *Single/Premium* shared plans do not have the Node.js
> Web App option – upgrade, or use a VPS (see the end of this guide).
> hPanel menu names change from time to time; if a label below differs slightly, look for the closest one.

One Node process serves everything: the React app **and** the API, on the same domain (so login cookies just work).

---

## 1. Create the MySQL database
hPanel → **Databases → Management** → create a database + user.
Note down the four values (Hostinger prefixes the names, e.g. `u123456789_rqms`):

| Value | Typical |
|---|---|
| Database name | `u123456789_rqms` |
| Username | `u123456789_rqmsuser` |
| Password | the one you chose |
| Host | `localhost`, port `3306` |

Leave the database **empty** – the app creates the tables.

## 2. Create the Node.js app from GitHub
hPanel → **Websites → Add Website → Node.js Web App → Import Git Repository**, connect GitHub and pick
`shubham2095/Railway-QMS`, branch `main`. Use these settings:

| Setting | Value |
|---|---|
| Framework preset | Express (or "Other") |
| Node.js version | **22.x** (20.19+ also works; older versions will fail the Vite build) |
| Root directory | `./` (repository root) |
| Build command / script | `npm run build` |
| Entry file | `server.js` |
| Start command (if asked) | `npm start` |

`npm run build` installs the backend and frontend dependencies and builds the React app into `frontend/dist`.

## 3. Add environment variables
In the same wizard (or later under the app's **Environment variables**; changes need a redeploy/restart):

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `JWT_SECRET` | a long random string – generate with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `COOKIE_SECURE` | `true` (Hostinger serves the site over HTTPS) |
| `DATABASE_URL` | `mysql://DB_USER:DB_PASSWORD@localhost:3306/DB_NAME` |
| `AUTO_BOOTSTRAP` | `true` |
| `ADMIN_EMAIL` | the email you will log in with |
| `ADMIN_PASSWORD` | a strong password (min 8 chars) |
| `ADMIN_NAME` | e.g. `Site Owner` |
| `ALLOW_SIGNUP` | *(optional)* `true` by default: anyone can create an **employee** account from the login page. Set `false` to allow only accounts created by an admin |
| `STORAGE_DIR` | *(recommended)* a folder **outside** the app folder, e.g. `/home/u123456789/rqms-storage`, so uploaded documents and certificates survive redeploys |

Notes
* **Special characters in the DB password must be URL-encoded** inside `DATABASE_URL` (`@`→`%40`, `/`→`%2F`, `:`→`%3A`, `#`→`%23`, `?`→`%3F`).
  Easier alternative: skip `DATABASE_URL` and set `DB_HOST=localhost`, `DB_PORT=3306`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD` separately (no encoding needed).
* Do **not** set `PORT` unless Hostinger tells you to – the app reads `process.env.PORT` automatically.
* Do **not** set `SEED_DEMO` (see "Demo mode" below).

## 4. Deploy and check the logs
Click **Deploy**. In the build/runtime logs you should see:
```
[bootstrap] Created tables in database "u123456789_rqms".
[bootstrap] Created super admin you@example.com. ...
[rqms] API listening on http://localhost:...  (production)
```

## 5. Put it on your subdomain
Hostinger deploys a new Node.js app to a temporary URL first; then connect your domain from the app's settings
(**Domain / Connect domain**). Use the subdomain you want, e.g. `qms.yourdomain.com`.

* If the subdomain already exists in hPanel as an empty/placeholder website, **remove that website first** – the Node.js flow creates its own slot for the domain.
* If your domain's DNS is **not** managed by Hostinger, add the `CNAME`/`A` record Hostinger shows you at your DNS provider.
* Wait for the free SSL certificate to be issued (usually minutes) and open `https://qms.yourdomain.com`.

## 6. First login & cleanup
1. Sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
2. **Remove `ADMIN_PASSWORD` (and `ADMIN_EMAIL`) from the environment** and redeploy. They are only used while the database has no users.
3. Open **Users & Roles** and create the real accounts (clerk, estate officer, electrical / water / accounts desks, employees).
   Assign the right role to each – the roles are already created.

Updates: push to `main` → Hostinger rebuilds automatically (if auto-deploy is on). Database changes between versions (for example the new `pf_number` column) are applied **automatically on start** by the built-in migrations, so you never need to touch phpMyAdmin for an upgrade; existing data is kept.

---

## About public signup
The login page has a **Create an account** link (employees only). A self-registered account can only ever get the `employee` role – staff roles
are assigned by an admin under **Users & Roles**. It does not verify the email address (the app sends no email yet), so on a public site
keep an eye on **Users & Roles** and deactivate unwanted accounts, or set `ALLOW_SIGNUP=false` and create employees yourself.
Sign-ups are limited to 10 per hour per IP address.

## Demo mode (optional, showcase only)
Want the demo accounts (`clerk@rqms.test`, … password `password`) on this subdomain for a presentation?
1. Add `SEED_DEMO=true` (and keep `AUTO_BOOTSTRAP=true`) **before the first start** with an empty database.
2. Add the build-time variable `VITE_SHOW_DEMO=true` so the login page shows the demo buttons.
3. **Delete or change those accounts afterwards.** Everyone on the internet can read this repository, so they know the password.

## Without GitHub (ZIP upload)
Zip the repository **without** `node_modules` and `frontend/dist`, choose the upload option instead of Git, and use the same
settings and variables as above.

## Manual database import (alternative to AUTO_BOOTSTRAP)
phpMyAdmin → select your database → **Import** → `database/schema.sql`. Keep `AUTO_BOOTSTRAP=true` anyway: it detects the
existing tables and only adds the roles/permissions and your first admin.

## Troubleshooting
| Symptom | Fix |
|---|---|
| `503 Service Unavailable` right after a successful build | Open `https://your-subdomain/api/health`. `{"status":"ok"}` = app is fine (wait a few seconds / hard-refresh). `{"status":"error","error":"database_unreachable (...)"}` = fix the DB variables (see below). A plain LiteSpeed 503 page with `ERR_REQUIRE_ASYNC_MODULE` in the logs means an **old deployment** – pull the latest `main` and redeploy. |
| Build says it cloned the wrong project (`client` workspace, `concurrently`, `sequelize`…) | You selected another repo. Import **`shubham2095/Railway-QMS`**. |
| Log shows `frontend/dist not found - serving the API only` | The React build output was not included in the runtime copy. Check that the build command is `npm run build` and the build log ends with `built in ...`; tell me the build log if it still happens. |
| Build fails on `vite` / "engine" errors | Set Node.js to **22.x** (Vite 8 needs 20.19+ or 22.12+). |
| Build killed / out of memory | Try again after a redeploy; if it keeps failing, build locally (`npm run build`) and tell me – the build output can be committed instead. |
| `JWT_SECRET must be set ...` | Add `JWT_SECRET` (any long random string). |
| Log: `Cannot connect to MySQL ... ECONNREFUSED / ENOTFOUND / ETIMEDOUT` and `localhost` does not work | Your app probably runs on a different server than MySQL. In hPanel → **Databases** look for **Remote MySQL** / the connection details and use the **hostname shown there** as `DB_HOST` (and allow the app's IP there if it asks for one). Try `127.0.0.1` instead of `localhost` too. |
| `Cannot connect to MySQL ... ECONNREFUSED / ENOTFOUND` | Host must be `localhost`, port `3306`; use the **prefixed** DB name and user from hPanel. |
| `Access denied for user` | Wrong password, or the user is not assigned to that database in hPanel. If the password has special characters, URL-encode it in `DATABASE_URL` or use the separate `DB_*` variables. |
| Login works but you are logged out immediately | `COOKIE_SECURE=true` only works on **https://** – open the site via https (or set it to `false` while testing over http). |
| Page refresh gives 404 | The React build is missing: check that `npm run build` ran and `frontend/dist` exists. |
| Uploaded files disappear after a deploy | Set `STORAGE_DIR` to a folder outside the app directory. |
| "No users exist yet" in the log | `ADMIN_EMAIL` / `ADMIN_PASSWORD` (min 8 chars) were not set on the first start – set them and restart. |

## Backups
Back up the MySQL database (hPanel → Backups, or phpMyAdmin → Export) **and** the `STORAGE_DIR` folder.

## Running on a VPS instead
```bash
git clone https://github.com/shubham2095/Railway-QMS.git && cd Railway-QMS
cp backend/.env.example backend/.env        # edit: DB_*, JWT_SECRET, COOKIE_SECURE=true, NODE_ENV=production
npm run build
npm run db:setup -- --no-seed               # tables (needs a MySQL user that may create the database), no demo data
npm run db:admin -- you@example.com "StrongPassword" "Site Owner"
npm i -g pm2 && pm2 start server.js --name rqms && pm2 save
```
Then put nginx (or Caddy) in front with a server block for your subdomain proxying to `http://127.0.0.1:5000`, and add HTTPS (Let's Encrypt).

---
*Hostinger references used for this guide:*
[Node.js hosting options](https://www.hostinger.com/support/1583661-is-node-js-supported-at-hostinger/) ·
[How to add a Node.js web app](https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/) ·
[Express deploy settings](https://docs.hostinger.com/node.js/overview-1/express) ·
[Environment variables](https://www.hostinger.com/support/how-to-add-environment-variables-during-node-js-application-deployment/) ·
[Connecting a MySQL database](https://www.hostinger.com/support/connecting-a-hostinger-mysql-database-to-a-node-js-application/)

## Quarter master data

The real quarter list (Excel -> JSON) lives in `database/data/quarters-type*.json` (one file per quarter type; Type I is in).
To load it on the live site set the environment variable `IMPORT_QUARTERS=true` and restart: every start then syncs the
file into `quarters` (idempotent - re-running never duplicates rows or overwrites status/occupant of quarters already in use).
Locally: `npm run db:quarters` in `backend/`. Optional: `MASTER_ZONE`, `MASTER_DIVISION`, `MASTER_STATION`
(defaults: Northern Railway / Delhi / New Delhi) set the location stamped on imported quarters.

### Old waiting list (pending requests)

`database/data/waitlist-<UNIT>.json` holds the requests made before this system (BTHP, HP ...). They are loaded by the same
`IMPORT_QUARTERS=true` switch into `legacy_waiting_list` (unique on the request number, so re-running never duplicates) and
shown to the staff under **Pending Requests (old list)**. To add more reports:
`python3 -I database/data/convert_waitlist.py database/data <report.xlsx> ...` (rows are merged by request number), commit, redeploy.

Gazetted officers' priority lists (Transit flat, Type-IV, Type-IV Spl, Type-V, Type-V Safdarjung, Type-VI) come from
`python3 -I database/data/convert_gazetted.py database/data <priority.xlsx>` -> `waitlist-GAZETTED.json`. They keep the
sheet's own order, the places of registration, present flat, contact and remarks; where a "date of refusal" is given,
the priority counts from that date and the original registration date is kept in the remarks.

More quarter types: `python3 -I database/data/convert_quarters.py database/data <Master_Data.xlsx>` turns every sheet named
`Master Data-<TYPE>` into `quarters-type<TYPE>.json` (commit it, redeploy). "II(Peela)" quarters are Type II with "Peela" in
the remarks; office / union / barrack quarters are loaded as *reserved*, unsafe / dismantled / sealed ones as *under maintenance*.
A quarter is identified by station + colony + number + type, so Type I and Type II may share a number in the same colony.

### Old waiting list (pending requests): how it is built

`python3 -I database/data/build_waitlist.py database/data <zip-folders-or-xlsx...>` reads every "House Requisition" report
(both layouts) and writes `waitlist-<UNIT>.json` plus `waitlist-duplicates-report.csv`. Rules: the same request number in
several reports counts once; the same PF number with the same quarter type more than once keeps only the **oldest** request
(later ones are dropped and listed in the CSV); the same PF in different quarter types is kept; rows without a PF are kept.
Gazetted lists: `convert_gazetted.py` (same "oldest wins" rule per list, report in `gazetted-duplicates-report.csv`).
Loaded by `IMPORT_QUARTERS=true`. To empty the list in a database set `CLEAR_WAITING_LIST=true` for one restart, then remove it
(locally: `npm run db:clear-waitlist`).
