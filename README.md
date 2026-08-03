# Task Management System

Self-hosted task management platform (Project → Milestone → Task → Sub-task),
built per `SPEC.md`. All six phases from Section 13 are implemented: core
schema/auth/RBAC/Task CRUD, activity logging + timesheets + PWA shell,
notifications + dashboards, KPI engine + leaderboard + reports, Zoho CRM sync,
and the admin panel + audit log.

## Stack

- Frontend: React + TypeScript + Tailwind CSS (Vite, installable PWA)
- Backend: Node.js + Express + TypeScript
- Database: PostgreSQL (via Prisma ORM)
- Deployment: Docker Compose (app + db + nginx reverse proxy)

## Quick start (Docker)

1. Copy the env template and fill in real secrets:

   ```bash
   cp .env.example .env
   ```

   At minimum change `POSTGRES_PASSWORD` and `JWT_SECRET`. SMTP and Zoho
   variables are optional — see "Known gaps" below for what happens if left blank.

2. Build and start everything:

   ```bash
   docker compose up --build
   ```

3. Run migrations and seed demo data (first run only):

   ```bash
   docker compose exec backend npx prisma migrate deploy
   docker compose exec backend npm run seed
   ```

4. Open the app: **http://localhost:8080** (routed through the nginx reverse proxy).

### Demo logins (from the seed script)

| Role | Email | Password |
|---|---|---|
| Admin | admin@example.com | Password123! |
| Manager | manager@example.com | Password123! |
| Team Lead | teamlead@example.com | Password123! |
| Staff | staff@example.com | Password123! |

## Deploying to the cloud (giving your team access)

The app is already Docker Compose based, so "deploy to the cloud" mostly means
"run `docker compose up` on a server instead of your laptop." Two realistic paths:

### Option A — a cloud VM (recommended: cheapest, simplest, matches what's built)

1. **Provision a small VM.** Any of these work fine for 20–50 users: a
   DigitalOcean Droplet, AWS Lightsail, Linode, or a Hetzner Cloud server.
   2 vCPU / 4GB RAM is comfortable. Pick Ubuntu 22.04/24.04.
2. **Point a domain at it.** Buy/use a domain (or a subdomain like
   `tasks.yourcompany.com`) and add an **A record** pointing at the VM's public
   IP. This is required for step 5 (HTTPS) — Caddy won't issue a certificate
   without it.
3. **Install Docker** on the VM:
   ```bash
   curl -fsSL https://get.docker.com | sh
   ```
4. **Copy the project onto the server** (git clone, or `scp` the folder) and
   set up `.env`:
   ```bash
   cp .env.example .env
   ```
   Fill in real values — **at minimum**: `POSTGRES_PASSWORD`, `JWT_SECRET`
   (use `openssl rand -hex 32` for both), `DOMAIN` (your domain from step 2),
   and set `VITE_API_URL=/api` (not `http://localhost:4000/api` — that only
   works on your own machine). SMTP is optional but worth setting up so email
   alerts (Section 6.9) actually go out.
5. **Start it with the production overlay** (swaps the plain-HTTP nginx proxy
   for Caddy, which gets you automatic free HTTPS, and stops exposing Postgres
   publicly):
   ```bash
   docker compose -f docker-compose.prod.yml up -d --build
   docker compose exec backend npx prisma migrate deploy
   docker compose exec backend npm run seed   # creates the demo logins — change/remove them after
   ```
6. **Open `https://yourdomain.com`.** Caddy issues the certificate on first
   request, so the very first load may take a few seconds longer.
7. **Log in as the seeded admin and immediately**: change the admin password
   (via Admin → Users, or just create your own admin account and deactivate/
   delete the seeded ones), and add your real Company/Department/Users before
   inviting your team.

**Ongoing maintenance:**
- **Backups**: `docker compose exec postgres pg_dump -U taskmgmt taskmgmt > backup-$(date +%F).sql`,
  put it on a daily cron job, and copy the dump off the server (S3, another
  machine — anywhere but the same disk).
- **Updates**: `git pull && docker compose -f docker-compose.prod.yml up -d --build`.
- **Logs**: `docker compose logs -f backend` (or `frontend`, `caddy`, `postgres`).

### Option B — managed platforms (less ops, a bit more setup work per service)

If you'd rather not manage a VM: Railway, Render, or Fly.io can each host this,
but since they're single-service-oriented and this app has 4 pieces
(frontend, backend, Postgres, and normally nginx), you'd typically:
- Use the platform's **managed Postgres** add-on instead of the `postgres`
  service in `docker-compose.yml` (point `DATABASE_URL` at it).
- Deploy `backend/` as one web service (it already has a `Dockerfile`).
- Deploy `frontend/` as a static site build (`npm run build`, serve `dist/`) —
  most of these platforms build and host static sites for free or very cheap.
- Drop nginx/Caddy entirely — the platform terminates HTTPS for you.
- Set `VITE_API_URL` to the backend service's public URL at build time.

This costs more setup effort up front (three separate deployments to wire
together) but means no server patching/maintenance afterward. For a 20–50
person internal tool, Option A is simpler to reason about and cheaper — it's
what the Docker Compose setup here is already built for.

## Local development (without Docker)

Requires Node 20+ and a local/reachable PostgreSQL instance.

```bash
# Backend
cd backend
cp ../.env.example .env   # adjust DATABASE_URL to point at your local Postgres
npm install
npx prisma migrate dev
npm run seed
npm run dev                # http://localhost:4000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev                # http://localhost:5173
```

## Running the tests

```bash
cd backend
npm test          # Vitest + Supertest against the DB in your DATABASE_URL
```

Tests hit a real database and create their own scratch data (unique per run),
so it's fine to run them against your dev DB — just not against production.

## Project structure

```
backend/
  prisma/schema.prisma    # full data model (all phases)
  prisma/seed.ts          # demo company/users/project/milestone
  tests/                  # Vitest + Supertest (auth, RBAC, KPI) against a real DB
  scripts/dev-db.mjs      # optional: runs a local Postgres via embedded-postgres,
                          # for dev/testing where Docker isn't available
  src/
    config/               # env, prisma client (+ audit-log middleware)
    middleware/            # JWT auth, role guard, error handler
    jobs/                  # node-cron: escalation checks, Zoho poll, weekly email
    utils/                  # jwt, mailer, csv/parseCsv, upload storage, request-scoped user context
    modules/
      auth/                 # login, /me
      users/                 # user CRUD (Admin-only create/update)
      masterData/           # Company / Department / Category
      projects/              # Project CRUD
      milestones/             # Milestone CRUD (+ computed progress rollup)
      tasks/                  # Task CRUD, sub-tasks, multi-assignee, RBAC scoping
      activityLogs/           # Activity Log entries, auto-populates Timesheet
      timesheets/              # My/Team timesheet views, manual non-task entries
      notifications/            # In-app notification log (polling)
      comments/                  # Task comments + @mention notifications
      dashboard/                  # Role-scoped dashboard summary endpoint
      kpi/                         # KPI weight config
      leaderboard/                  # Weekly/Monthly/Quarterly leaderboard
      reports/                       # 7 report types (Section 6.8), CSV export
      zoho/                          # OAuth token refresh, polling sync, field mapping
      auditLog/                      # Audit log viewer endpoint
      escalationRules/                 # Per-department escalation threshold config
frontend/
  src/
    api/                    # axios client (JWT interceptor) + offline queue for activity logs
    context/AuthContext.tsx
    pages/
      Auth/ Dashboard/ Projects/ Milestones/ Tasks/ Timesheets/
      Notifications/ Leaderboard/ Performance/ Reports/ Admin/
docker-compose.yml
nginx/nginx.conf
.env.example
```

## Role-based access

- **Admin** — full access to everything, including the Admin panel.
- **Manager** — full visibility of their department's tasks/timesheets/KPIs;
  can create/assign projects, milestones, and tasks.
- **Team Lead** — can create/assign tasks; sees tasks they created, tasks
  assigned to them, and tasks assigned to their **direct reports**.
  > Section 5's data model has no `Team` entity, only `Reporting Manager` on
  > Users — per your decision, "team" is defined as direct reports, not a
  > separate table. The same rule scopes Team Lead timesheet/report views.
- **Staff** — sees only tasks assigned to them; can update a task's **status**
  and **% complete** on their own tasks, but not other fields; sees the full
  leaderboard (peer scores are visible to everyone, per Section 12 decision #3).

## Known gaps / flagged assumptions

These were called out as I hit them per your instruction to flag rather than
guess silently. None block using the system — they're documented so you can
decide if/when to revisit them.

1. **Recurring tasks** — Section 5.5 has `Recurring: Y/N + Frequency` fields,
   but the spec doesn't define the automation (new instance cloned on
   completion? on a schedule?). The fields are stored, and a manual **Clone**
   button (Task Detail) covers the immediate need; no automatic recurrence
   job runs on a schedule.
2. **Task attachments** — implemented as local-disk file uploads
   (`TaskAttachment`/`ActivityAttachment`), matching Section 9's "local
   filesystem" option: upload/download/delete are wired up on both the Task
   Detail "Attachments" tab and the Activity Log entry form.
3. **User provisioning** — full user management is now built (Admin panel →
   Users tab), so this earlier gap is closed.
4. **Milestone "at risk" timeline** — Section 6.9 says "past 50% timeline,
   <50% completion." Milestones have no `startDate` of their own, so the
   Project's `startDate` (falling back to the milestone's `createdAt`) is used
   as the timeline start.
5. **KPI sub-metric formulas** — Section 6.5 names the four components but not
   their exact math. Implemented as: Estimate Accuracy = `100 - |actual −
   estimated| / estimated × 100` (averaged across a user's estimated,
   completed tasks); Task Volume Score = user's completed-task count ÷ team
   average × 100 (capped at 150); Quality Score = average closure rating ÷ 5 ×
   100. All default to 100 when there's no data yet (new users aren't
   penalized for a lack of history).
6. **Closure rating** — the "manager 1–5 rating on task closure" (Section 6.5)
   is available as `closureRating` on `PATCH /api/tasks/:id` but there's no
   dedicated "close this task" modal forcing it — a manager can complete a
   task without rating it, in which case it's excluded from that user's
   quality score for the period.
7. **Zoho OAuth** — the spec asks for "OAuth2 refresh-token auth." This is
   implemented as a **refresh-token consumer**, not a full interactive consent
   flow: the Admin generates a refresh token once via Zoho's API Console
   (self-client), pastes `ZOHO_CLIENT_ID` / `ZOHO_CLIENT_SECRET` /
   `ZOHO_REFRESH_TOKEN` into `.env`, and the backend exchanges it for access
   tokens automatically from then on. Building the redirect-based consent
   screen would require a fixed public callback URL, which most self-hosted
   deployments at this scale don't have — flagging this instead of building it
   silently. The Admin → Zoho CRM tab shows connection status and lets you
   trigger a manual sync once configured.
8. **Zoho field gaps** — as the spec itself flags (Section 6.12): synced tasks
   have no Category/Sub-Category, Milestone, Estimated Time, or
   Company/Department (Zoho's Tasks module has no equivalent fields), so they
   land unclassified until someone categorizes them manually.
9. **Reports: PDF export & auto-scheduled delivery** — Section 6.8 asks for
   Excel/PDF export, schedulable. CSV export (Excel-compatible) and a weekly
   auto-emailed summary (Monday mornings, to Admins/Managers) are implemented.
   Native PDF generation was left out — it needs a rendering library decision
   (e.g. Puppeteer vs. a PDF-construction library) that trades off output
   fidelity against image size/startup cost, worth a quick call before adding.
10. **SMTP not required to run** — if `SMTP_HOST` is left blank in `.env`,
    emails are logged to the console instead of failing, so you can use
    everything else (in-app notifications, dashboards, etc.) without setting
    up mail first.
11. **Audit log coverage** — records field-level changes on `Task`, `User`,
    and `TimesheetEntry` (the entities with the most accountability value).
    Changes made by scheduled jobs (Zoho sync, escalation checks) aren't
    attributed to a user, so they're intentionally not written to the audit
    log (which requires a `changedBy` user) — only interactively-made changes
    are audited.
12. **Task views** — Section 6.2 asks for List/Kanban/Calendar/Hierarchy-tree
    views. List, Kanban (by status), and Calendar (by due date, month grid)
    are built with a view toggle on the Tasks page. A dedicated Hierarchy-tree
    view (a single Project→Milestone→Task→Sub-task visualization) isn't built —
    that structure is still fully browsable via linked pages (Project →
    Milestone → Task → Sub-tasks tab), just not as one collapsible tree widget.
13. **Bulk import mapping** — `POST /api/tasks/bulk-import` (CSV) expects
    `projectId`/`milestoneId` as internal IDs and `assigneeEmails` (semicolon
    or comma separated), not human-readable project/user names — there's no
    name-to-ID lookup or a downloadable template yet.
14. **Automated tests** — a real test suite now exists (`backend/tests`,
    `npm test`, Vitest + Supertest), covering auth, Task RBAC scoping
    end-to-end, and the KPI formula against a live database. It's a
    meaningful starting set, not full coverage — most modules (notifications,
    Zoho sync, reports, timesheets) still have no automated tests.
15. **"Efficiency" vs. "Estimate Accuracy"** — not defined precisely by any
    spec section, so two distinct, deliberately different metrics exist:
    Estimate Accuracy (KPI sub-metric, symmetric — penalizes both over- and
    under-estimates) and Efficiency (Dashboard/Team/Leadership widgets,
    ratio-based — rewards finishing at-or-under the estimate). They'll usually
    move together but aren't the same number by design.
16. **"Team-wise" reporting** — reuses the existing "team = direct reports"
    definition (Section 12 Team Lead decision). The Reports page's Team-wise
    view groups tasks by each assignee's reporting manager.
17. **Task/Company/Department fields rarely set directly** — `Task.companyId`
    /`departmentId` are optional columns the Task form never fills in; nearly
    all tasks only carry a department/company via their Project. Every new
    report/dashboard endpoint (grouped reports, rollups, Manager scoping,
    Leadership bottlenecks, Day-7 escalation) falls back to the Project's
    company/department when the Task's own field is blank — **this was also a
    pre-existing bug in Manager task-visibility scoping** (Managers saw 0
    tasks instead of their department's tasks) that surfaced and got fixed
    while building the new reports; see the regression test in
    `backend/tests/tasks-rbac.test.ts`.

## Dashboards & Reports (added post-Phase-6)

Built in response to follow-up feedback, beyond the original phased spec:

- **Main Dashboard** — added Member-wise KPI, Project-wise progress,
  Milestone tracking, and Delay analysis widgets (visible to
  Manager/Team Lead/Admin).
- **Team Member Dashboard** (`/dashboard/team`) — one card per employee:
  total tasks, completed on time, KPI score, efficiency, feedback quality,
  and an 8-week workload trend sparkline. Scoped like the main dashboard
  (Manager = department, Team Lead = direct reports, Admin = everyone).
- **Central Leadership Dashboard** (`/leadership`, Admin only) — all
  companies combined, top performers, bottlenecks (highest overdue rate by
  department), milestone delays, project delays, and an org-wide efficiency
  trend.
- **Reports page** — rebuilt from a JSON-preview list into a proper filterable
  grid: `GET /api/reports/grouped` groups tasks by employee/team/project/
  company/department with filters (date range, company, department, project,
  employee, status), plus CSV export. The original named reports (Task
  Detail, Overdue, Department Rollup, Leaderboard Export) are still there,
  now rendered as real tables instead of raw JSON. Both the grouped report and
  Task Detail Report now include a **Spent Hours** column (sum of logged
  `TASK_WORK` time per task/group).
- **Timesheet Report** (Reports page) — dedicated summary + detail views
  answering "how much time was spent on X": grouped by employee, task,
  project, or department, filterable by all of those plus company, date
  range, and entry type. The detail view is the individual log entries; the
  summary view rolls them up with task-hours vs. non-task-hours split. Both
  export to CSV.

## API overview

All endpoints under `/api` except `/api/auth/login` require
`Authorization: Bearer <token>`.

**Phase 1 — core**
- `POST /api/auth/login`, `GET /api/auth/me`
- `GET/POST/PATCH /api/users`
- `GET/POST/PATCH /api/companies`, `/api/departments`, `/api/categories`
- `GET/POST/PATCH/DELETE /api/projects`
- `GET/POST/PATCH/DELETE /api/milestones`
- `GET/POST/PATCH/DELETE /api/tasks`, `PATCH /api/tasks/:id/progress` (status/% only, for Staff)
- `POST /api/tasks/:id/clone`, `POST /api/tasks/bulk-import` (CSV, field name `file`)
- `POST /api/tasks/:id/attachments`, `DELETE /api/tasks/:id/attachments/:attachmentId`

**Phase 2 — activity log & timesheet**
- `POST /api/activity-logs`, `GET /api/activity-logs/task/:taskId`
- `POST /api/activity-logs/:id/attachments`
- `GET /api/timesheets/mine`, `POST /api/timesheets/manual-entry`, `GET /api/timesheets/team`

**Phase 3 — notifications & dashboards**
- `GET /api/notifications`, `GET /api/notifications/unread-count`, `PATCH /api/notifications/:id/read`, `PATCH /api/notifications/read-all`
- `GET/POST /api/comments`, `GET /api/comments/task/:taskId` (supports @mention notifications)
- `GET /api/dashboard/summary` (role-scoped)

**Phase 4 — KPI, leaderboard, reports**
- `GET/PUT /api/kpi/weights`
- `GET /api/leaderboard?period=WEEKLY|MONTHLY|QUARTERLY`
- `GET /api/reports/{task-detail,task-summary,staff-performance,staff-timesheet,overdue,department-rollup,leaderboard-export}` (add `?format=csv` where supported)
- `GET /api/reports/grouped?groupBy=employee|team|project|company|department` (+ `from`/`to`/`companyId`/`departmentId`/`projectId`/`employeeId`/`status`/`format`)
- `GET /api/reports/timesheet-summary?groupBy=employee|task|project|department`, `GET /api/reports/timesheet-detail` (+ `employeeId`/`taskId`/`projectId`/`departmentId`/`companyId`/`from`/`to`/`entryType`/`format`)

**Dashboards (added post-Phase-6)**
- `GET /api/dashboard/member-kpi?period=`, `/project-progress`, `/milestones-tracking`, `/delay-analysis`
- `GET /api/leadership?period=` (Admin only)

**Phase 5 — Zoho CRM sync**
- `GET /api/admin/zoho/status`, `GET /api/admin/zoho/sync-log`, `POST /api/admin/zoho/sync` (Admin only)

**Phase 6 — admin & audit**
- `GET /api/admin/audit-log`
- `GET/POST/DELETE /api/admin/escalation-rules`

## Verification status

This was fully exercised against a **real, live PostgreSQL database and a
running instance of both servers** (not just static checks):

- `prisma validate` / `prisma generate` — schema compiles across all 6 phases.
- Backend `tsc --noEmit` and frontend `tsc -b` / `vite build` — clean.
- Automated test suite (`backend/tests`, `npm test`, Vitest + Supertest) — 12
  tests passing against a live DB: login, RBAC scoping (Staff sees only their
  own tasks, is blocked from full edits and from other users' tasks), and the
  KPI formula (on-time %, estimate accuracy, quality score) for a controlled
  scenario.
- Manual live walkthrough (curl + browser) covering: login for all 4 roles,
  task create/assign/update, RBAC 403s on out-of-scope access, activity
  logging → automatic timesheet population, `TASK_ASSIGNED` and
  `TASK_STATUS_CHANGED` notifications firing correctly, the audit log
  recording field-level diffs attributed to the right user, the dashboard/
  leaderboard/reports endpoints returning real computed data, List/Kanban/
  Calendar task views, comments with @mention notifications, task cloning,
  bulk CSV import, and file attachment upload/download/serve.

Note on how: this sandbox's network blocks Docker Hub's image CDN, so a
docker-compose-based Postgres couldn't be pulled. Verification instead used
the `embedded-postgres` npm package to run a real local Postgres cluster
(dev/test-only — not part of the shipped app; see `backend/scripts/dev-db.mjs`
if you want to reuse that path yourself). The Docker Compose stack itself
(what you'll actually deploy) was not run in this environment — please run
`docker compose up --build` per "Quick start" once to confirm it behaves the
same way, since it's a different runtime path (containers + nginx) than what
was verified here even though the application code is identical.

**Not covered here:** Zoho CRM sync end-to-end (no real Zoho sandbox
credentials available to test against — the connection-status/manual-sync/
sync-log plumbing was verified, but not an actual poll against Zoho's API),
and SMTP email delivery (verified that it logs to console when unconfigured;
not tested against a real mail server).
