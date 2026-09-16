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
      leaderboard/                  # Weekly/Monthly/Quarterly/All Time leaderboard
      reports/                       # 7 report types (Section 6.8), CSV export
      zoho/                          # OAuth token refresh, polling sync, field mapping
      crmLeads/                      # Zoho Leads sync (Notes/Calls/Events/Tasks/Emails) — reuses zoho/ OAuth
                                      # + crmLeadReports.* (read-only endpoints behind the CRM Reports UI)
      auditLog/                      # Audit log viewer endpoint
      escalationRules/                 # Per-department escalation threshold config
frontend/
  src/
    api/                    # axios client (JWT interceptor) + offline queue for activity logs
    context/AuthContext.tsx
    pages/
      Auth/ Dashboard/ Projects/ Milestones/ Tasks/ Timesheets/
      Notifications/ Leaderboard/ Performance/ Reports/ CrmReports/ Admin/
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
  **Display-only rename (2026-09-16)**: the UI shows this role as
  "Employee" everywhere a role is rendered as text (role badges, the
  role/reporting-manager `<select>`s in Admin → Users) — the underlying
  `Role.STAFF` enum value, permission checks, seed data, and API payloads
  are all unchanged, only what's shown on screen changed. New shared
  mapping: `frontend/src/lib/roleLabels.ts`'s `ROLE_LABELS`/`roleLabel()`
  (also gives the other three roles a normal-case label — "Team Lead"
  instead of the raw `TEAM_LEAD` — so the UI doesn't mix one friendly word
  in among three ALL-CAPS codes). This is purely a frontend display
  concern — the CRM Leads module's unrelated "Staff Name" field (a Zoho
  custom picklist tracking who's working a lead, nothing to do with system
  roles) was deliberately left untouched.

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
    - **Percent-complete collapsed into a per-day summary (2026-09-16)**:
      the Task progress slider (`TaskDetail.tsx`) fires a `PATCH` per drag
      tick, and the audit middleware writes one row per update call — a
      single drag from 20% to 65% used to leave half a dozen near-identical
      rows behind, drowning out everything else in the log. `listAuditLog`
      (`auditLog.service.ts`) now collapses every `percentComplete` row for
      the same Task on the same calendar day into one summary row (that
      day's earliest `oldValue` → its latest `newValue`, tagged with a
      `mergedCount` of how many raw updates it stands in for), before
      pagination is applied — pagination has to happen *after* collapsing,
      over the full matching set, since a DB-side count/skip/take would
      otherwise paginate the pre-collapse row count instead of what's
      actually displayed. The raw per-tick rows are still all written to
      the database exactly as before (nothing about writing is changed) —
      only how they're read back and displayed is different. The Field
      column also shows a plain-English label for this field ("Completion %
      increased"/"decreased") instead of the raw `percentComplete` name.
      Every other audited field keeps its original one-row-per-change
      behavior untouched.
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
18. **Zoho CRM Leads sync (new)** — extends the Phase 5 Zoho integration
    (Tasks module, above) to also sync the **Leads** module plus its Notes/
    Calls/Events/Tasks/Emails activity feed, per a separate "Leads +
    Reports" spec, plus the Reports UI (Dashboard/Lead-wise/Staff-wise) on
    top of it. See the new "Zoho CRM Leads sync" section below for what was
    actually built. Two decisions the spec flagged as needing client input
    were confirmed rather than guessed: the funnel groups `Lead_Status`
    into the 5-stage + dropped/other split recommended in `modules/
    crmLeads/funnelStage.ts`, and "conversion rate" is same-period
    (converted-in-period ÷ created-in-period), not cohort-within-N-days.
    Remaining open items, flagged rather than guessed:
    - **Field history tracking** on `Lead_Status`/`Owner` — whether it's
      enabled for this org (Setup → Customization → Modules → Leads → Field
      History Tracking) determines whether stage/owner history can ever be
      backfilled before this feature's first sync, or only tracked going
      forward. Not checked (not exposed by the Zoho CRM API surface used
      here) — the sync behaves correctly either way, but a report showing
      "no stage movement before <date>" should say why.
    - **No webhooks** — same constraint noted for Zoho OAuth above (most
      self-hosted deployments at this scale don't have a fixed public
      callback URL). Leads sync polls on a schedule (`CRM_LEADS_SYNC_CRON_
      SCHEDULE`, default every 15 min), matching the existing Tasks sync's
      approach rather than the spec's "prefer webhooks" as a first choice.
    - **Emails related list** — `Leads/{id}/Emails` has no `href` in this
      org's Get Related Lists response (unlike Notes/Calls/Events/Tasks).
      The sync still attempts it and degrades gracefully (logs a warning
      once, continues without Email activities) if the org/edition rejects
      the call — not confirmed either way against a real sync run yet (no
      live Zoho credentials were available in the environment this was
      built in; see "Not covered here" below).
    - **Activity-only changes can lag an incremental sync** — Zoho's
      `Modified_Time` on a Lead doesn't reliably bump from a new child Note/
      Call/etc. with no Lead field change, so the incremental poll (which
      filters on `Modified_Time`) could miss that activity until something
      else changes on the lead, or until the next full backfill. Not fixed
      in this pass (would need a COQL query against `Last_Activity_Time` as
      a second incremental cursor) — flagged rather than silently accepted.

19. **CRM Leads Sync Admin UI** — the Admin → Zoho CRM tab now has a second
    "Leads module" panel (connection status, lead count, last full backfill
    / last incremental sync timestamps, sync log, "Run sync now" / "Run full
    backfill" buttons) alongside the existing Tasks panel. No dedicated
    Configuration UI beyond the new cron-schedule field — Leads sync reuses
    the Tasks sync's Zoho OAuth credentials as-is. Separately, a new "CRM
    Reports" nav item (visible to Admin/Manager/Team Lead, same audience as
    the existing Reports page) hosts the Dashboard/Lead-wise/Staff-wise
    Reports UI described in the next item.

20. **Task/Company/Department fields rarely set directly** — `Task.companyId`
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
  - **Audited (2026-09-11), no bug found**: every team-scoped surface in the
    app (this dashboard, the Member-wise KPI widget, KPI Report, Task Report's
    "team" groupBy, Team Timesheet) already consistently uses the same
    `reportingManagerId`-based helpers (`getDirectReportIds`/
    `getVisibleMemberIds` in `users.service.ts`) — verified live against real
    role logins, not just read from the code. "Team Dashboard only shows
    individual data" in practice is a **data-configuration symptom, not a code
    bug**: it collapses to one card whenever a Manager/Team Lead's direct
    reports aren't set (nobody's `reportingManagerId` points at them), since
    "team" has no separate entity — see the decision note above. Since this
    was invisible before, Admin → Users now shows each Manager/Team Lead's
    direct-report count inline (flagged amber at 0 — "their team views will
    look empty") and the Reporting Manager picker (`UserManagement.tsx`) is
    restricted to Manager/Team Lead accounts, so it can't be silently
    misconfigured to a Staff account going forward.
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
- **KPI Report → date-range task/activity drill-down** (`KpiReportSection.tsx`,
  Reports page): click an employee's row to expand, in place, exactly the
  tasks that fed into that row's assigned/completed/overdue/pending counts
  for whichever period the page's own date filter currently has selected
  (daily/weekly/monthly/quarterly/custom — same `from`/`to` sent to the row
  data itself), each shown with its activity-log updates (type, status,
  hours, who logged it, feedback) within that same range — "why is my KPI
  score X" answered one click away, without navigating off the page or
  losing the active filters. Backed by `getStaffTaskActivityReport`
  (`reports.service.ts`), which deliberately reuses `getKpiReport`'s own
  per-task completed/overdue/pending classification rather than a
  separately-defined "tasks touched this period" query, so the drill-down
  can never disagree with the numbers in the row above it.
  - **Found and fixed in passing**: `GET /reports/staff-performance` and
    `/staff-timesheet` had no ownership check on their `?userId=` param —
    any authenticated user (including Staff) could read any other user's KPI
    trend or full timesheet just by passing their id. Fixed by checking the
    target id against `getVisibleMemberIds` (the same visibility rule every
    other team-scoped report already uses) whenever `userId` isn't the
    caller's own — self-view still needs no elevated role, viewing someone
    else now 403s unless the caller actually has visibility over them.

## Zoho CRM Leads sync (added post-Phase-6, data layer only)

Per a separate "Zoho CRM Leads Integration + Reports Module" spec. Only the
sync/data-model half is built so far (see "Known gaps" #18-19 above for what
that spec's Reports UI still needs, and why it was deliberately deferred):

- **`crm_leads`** — core Leads fields (owner, company, email, lead source/
  status, conversion fields) plus a derived `funnelStage` and the full raw
  Zoho payload in `rawData` (Leads has ~90 fields total; only a core set
  gets a real column, so a future report reaching for a field that wasn't
  anticipated here doesn't need a migration).
- **`crm_lead_activity`** — unified Notes/Calls/Events/Tasks/Emails feed,
  one row per Zoho activity record, deduped on re-sync.
- **`crm_lead_stage_history`** / **`crm_lead_owner_history`** — populated by
  diffing each incoming sync against what's currently stored; only tracks
  changes from the moment this feature first ran (see Known gap #18 on
  Zoho field history tracking for why no earlier history can be backfilled).
- **`crm_sync_state`** — incremental-sync cursor (`Modified_Time`), unlike
  the Tasks sync above which just re-fetches everything every run.
- Sync runs via `modules/crmLeads/crmLeads.service.ts`, sharing the Tasks
  sync's OAuth token cache (`modules/zoho/zoho.service.ts`). Incremental
  sync polls on a schedule (Admin → Configuration, default every 15 min);
  a full backfill is a separate Admin-triggered action (Admin → Zoho CRM →
  Leads module → "Run full backfill").
- **Reports UI** (Admin/Manager/Team Lead/Staff → "CRM Reports" nav item —
  Staff included as of the role-scoping change below, unlike the existing
  Reports page's audience): a Dashboard tab with 4 widgets
  (assignment overview, latest activity feed, conversion rate — confirmed
  same-period definition — and the stage-wise funnel with last-24h
  movement), plus Lead-wise and Staff-wise deep-dive tabs. All read-only
  over `modules/crmLeads/crmLeadReports.service.ts`. Staff-wise defaults to
  a per-staff overview table (leads owned, conversion rate, activities
  logged, last activity) rather than forcing a person to be picked first —
  clicking a row drills into that person's leads, as one table (lead,
  stage, assigned date, latest activity folded into the same row) rather
  than a second separate activity-feed panel next to it. Staff-wise (and
  every other staff-level filter/grouping in CRM Reports) is keyed by
  `staffName` — the client's custom "Staff Name" picklist field on the Lead
  (Zoho API name `Staff_Name`), **not** the standard `Owner` field. Client
  direction, added after `ownerName` initially: in this org Owner doesn't
  reliably track who's actually working a lead, so a dedicated field was
  added in Zoho for it (mirroring the same pattern already used on the Zoho
  Tasks module — see `modules/zoho/zoho.service.ts`'s `Staff_Name` handling).
  `ownerName` is still synced and still shown as "Owner" on the Lead-wise
  detail page, purely informational, alongside the new "Staff" field.
  Zoho tracks no change history for Staff Name (unlike Owner), so there's no
  staff equivalent of `ownerHistory`/"assigned date" — Staff-wise's per-lead
  "Assigned" column falls back to the lead's creation date.
- **Lead-wise → Activity timeline** — the Stage History/Owner History/
  Activity Feed three-panel layout was replaced with a single chronological
  timeline merging every touch on a lead (Notes/Calls/Events/Tasks/Emails,
  plus stage changes and owner reassignments), oldest first, each entry
  showing its type, status, due date (for tasks), and who did it. The
  activity-type dropdown filters to just that kind of activity and, since a
  type filter should mean exactly what it says, also hides the stage/owner
  change entries while active. Backed by `getLeadDetail`'s merged `timeline`
  array (`crmLeadReports.service.ts`), rendered in `LeadWiseSection.tsx`.
- **Global date + staff + country + quality + assignment filter** — a
  shared filter bar at the top of every CRM Reports tab
  (`?cutoffOn=&cutoffDate=&cutoffDateTo=&staffFilter=&countryFilter=&qualityFilter=&assignmentFilter=`
  in the URL, date-from default on / 2026-08-01): a from/to date range
  narrowing to leads created in that window, plus Staff/Country/Lead
  Quality/Assignment dropdowns narrowing to one value each. Applied
  uniformly via `createdSince`/`createdBefore`/`staffName`/`country`/
  `leadQuality`/`assignment` on every service function (`ReportFilters` in
  `crmLeadReports.service.ts`); a specifically-selected lead's own detail
  page ignores the date range (you explicitly asked to see that one). The
  staff filter matches differently depending on what's being measured:
  lead-level data (Assignment Overview, Conversion Rate, Stage-wise,
  Kanban, Closure Report's deals) matches the lead's own `staffName`
  field, while activity-level data (Activity Feed, Daily Report, Closure
  Report's activities) matches `actorName` — who actually performed that
  piece of work, which can genuinely differ from who the lead is staffed
  to. Country and Lead Quality are always plain lead-level equality
  filters (no actor-vs-lead distinction), applied via the parent lead
  everywhere, including activity-level views. Country options come from
  `GET /crm-lead-reports/countries` (distinct, non-null values, scoped to
  what the requester can see) — same pattern as the existing Staff
  dropdown's `GET /crm-lead-reports/staff`.
  Closure Report doesn't get the date-range half of the bar (its own
  day/week/month toggle already scopes time), but does get staff/country/
  quality/assignment.
  - **Assigned/Unassigned filter (2026-09-16)**: `?assignment=assigned|
    unassigned`, same "available on every page" treatment as
    Country/Quality. Since this targets the exact same `staffName` field
    the Staff dropdown and role-scoping already narrow, it's resolved
    through one combining helper (`resolveStaffNameWhere` in
    `crmLeadReports.service.ts`) rather than two independent `{ staffName:
    ... }` fragments that would silently clobber each other when spread
    into the same Prisma `where` object. Picking "Unassigned" while a
    specific staff (or a scoped Team Lead/Staff role) is also active is a
    genuine contradiction — a named person's lead is never unassigned — so
    it fails closed (matches nothing) instead of picking one side
    arbitrarily. On the two "per staff" views (Staff-wise overview,
    Closure Report) that already defaulted to excluding unassigned leads
    (there's no staff name to group them under), that default is preserved
    unless `assignment` is explicitly set — explicitly asking for
    "unassigned" there correctly returns nothing to report, rather than
    silently reinterpreting the request.
  - **Country (2026-09-15)**: Zoho's standard `Country` lead field —
    previously not synced at all (not even into `rawData`, since the
    sync's field-select list never requested it). Added to `ZOHO_LEAD_FIELDS`
    and mapped onto a new `country` column (`crmLeads.service.ts`). **A full
    re-sync is required** (`POST /api/admin/crm-leads/sync?full=true`) for
    existing leads to get a country value — there's no rawData backfill
    shortcut this time, unlike the earlier EVENT due-date work, since the
    raw value was genuinely never captured before now.
  - **Lead Quality (2026-09-15)**: a brand-new classification — Potential
    Deal / Nurturing / Lead Unqualified — that is **not** synced from Zoho
    at all; it's set entirely from within this app (new `CrmLeadQuality`
    enum + nullable `leadQuality` column on `CrmLead`). Edited from the
    Lead-wise tab's detail panel (a `<select>` next to Stage/Owner/Source,
    calling `PATCH /crm-lead-reports/leads/:id/quality` with optimistic
    local update, reverted on failure) — "beside" the leads list/detail
    view, not a separate page. Anyone who can already see a lead under the
    existing row-level scope (Admin/Manager unrestricted, Team Lead their
    team, Staff themselves) can set its quality too — same visibility
    boundary extended to this one write, no new permission tier. The sync
    path never touches this field (it's deliberately absent from
    `mapLead()`'s returned object), so a re-sync can never clobber a
    manually-set quality.
- **Kanban view** — Dashboard, Lead-wise, and Staff-wise each have a
  List/Widgets ↔ Kanban toggle grouping leads into columns by funnel stage
  (`CrmReports/KanbanBoard.tsx`, backed by `GET /crm-lead-reports/kanban`).
  Read-only by design (no drag-to-change-stage — stage is Zoho-sourced and
  this sync is one-way). Every card links to that lead's Lead-wise report,
  same as every other place a lead is shown.
- **Dashboard → "By Staff" view** — a third Dashboard view (alongside
  Widgets/Kanban): every lead grouped under a collapsible section per
  `staffName` (name + count badge, click to expand a table of their leads — created
  date, source, stage, phone, last activity), modeled on a grouped list
  view from another in-house tool the client already uses.
  (`CrmReports/GroupedByStaffList.tsx`, backed by `GET /crm-lead-reports/
  dashboard/grouped-by-staff`.)
- **CRM Report tab** (renamed from "Daily Report" 2026-09-16, moved to
  right after Dashboard — same `daily-report` URL key/route kept
  unchanged, so existing bookmarks/links with `?report=daily-report`
  still work; only the label and its position in `reportTabs`
  (`CrmReportsHub.tsx`) changed) — a second CRM Reports tab, designed to
  fit on one screen for the morning meeting rather than one long scroll:
  an overview row (total leads / tasks / calls), a "leads assigned per
  staff" breakdown, 2 comparison bar charts, and 4 tables (Leads, Tasks
  completed, Tasks due, Calls), each a fixed-height card with its own
  internal scroll + pagination (same convention as the Dashboard widgets)
  rather than growing the page — you page through a section's rows
  instead of scrolling past it. The Calls table spans both grid columns
  (`lg:col-span-2`) since it's the odd one out in an otherwise 2-column
  layout. Scoped to CRM Leads/Calls only per client confirmation (not the
  internal Task app), and deliberately ignores the leads-since cutoff
  filter used everywhere else — work matters regardless of how old the
  underlying lead is.
  - **This Week / This Month / This Quarter (2026-09-16)**: quick-select
    buttons next to the From/To inputs, each a "period to date" range
    (Monday of the current week / 1st of the current month / 1st of the
    current quarter, through *today* — not the rest of the period, which
    hasn't happened yet) computed in Nepal-local terms
    (`nepalTodayDate`/`startOfWeek`/`startOfMonth`/`startOfQuarter` in
    `DailyReportSection.tsx`), then just set `fromDate`/`toDate` the same
    way typing into the date inputs directly would — no separate
    "period" concept on the backend, this is purely a frontend
    convenience over the existing From/To range.
  - **Overview stat breakdowns (2026-09-13, extended 2026-09-15)**: the
    Tasks and Calls overview cards show a "X completed · Y due"/"X
    completed · Y missed" subtitle under the combined total, instead of
    just one number that hides whether it's mostly done or mostly
    outstanding. The Leads card gets the same treatment — "X assigned · Y
    unassigned" — which required a matching fix to what "total" even means:
    the two lead-level queries behind this card and the Leads table
    (`leadsAssignedRaw`/`leadsListRaw` in `getDailyReport`) used to force
    `staffName: { not: null }` whenever no staff filter was selected,
    silently dropping unassigned leads out of the total entirely. Now that
    condition only applies once `nameCond` is actually defined — i.e. a
    specific staff was chosen, or a scoped role (Team Lead/Staff) narrows
    it — so the default "no filter" view counts every lead, unassigned
    included, and picking a specific staff still correctly excludes
    unassigned (there's nothing to include — a chosen staff member's leads
    are by definition assigned to them).
  - **Leads table (2026-09-13)**: a row-level table nested inside the
    "Leads assigned per staff" card, below the per-staff badges — same
    leads as that count/breakdown (created within the selected range,
    filtered on `zohoCreatedTime`), but one row per lead: Lead (links to
    Lead-wise), Staff, Status (`leadStatus`), Country, Lead Quality, Call
    status, Call date & time, Next follow up, Phone, Created, Latest note —
    shown inline so the row is a full glance without opening the lead (no
    separate Stage column —
    `leadStatus` already covers it more legibly than the bucketed
    `funnelStage` enum value would; no Source column, dropped per client
    request). Own component (`LeadsTable`
    in `DailyReportSection.tsx`, with a `bare` mode that drops its own card
    chrome when nested like this) rather than reusing `ReportTable`, since a
    Lead's natural columns don't match an activity row's
    (subject/status/scheduled). Backed by a new `leads: { total, items }`
    field on `GET /crm-lead-reports/daily`.
    - **Call status/date and Next follow up (2026-09-13)**: Call status
      reflects the lead's most recent CALL activity (by `occurredAt`) —
      absent entirely (no CALL activity ever synced for this lead) reads as
      **"Not Started"**, not a blank dash. Call date & time is separate:
      it's only the `occurredAt` of the most recent *Completed* call — a
      merely-scheduled-but-not-yet-made call has a status but no "done at"
      time, so this column stays blank until one actually goes through.
      Next follow up (reworked 2026-09-13): not just Tasks — the real
      follow-up chain in this org moves between activity types (an initial
      Task gets worked, then someone schedules a Call, or a meeting, which
      supersedes it). Now takes the single most recently-scheduled item
      across TASK/CALL/EVENT (`Due_Date`/`Call_Start_Time`/`Start_DateTime`
      respectively) for the lead, whichever type it is, and shows its type,
      date/time, and its own completion status together (e.g. "Call ·
      Completed", "Task · Not Started") — not filtered to
      not-yet-completed-only, so the column keeps showing the current
      follow-up (and that it's done) instead of going blank the moment it's
      completed, until a newer one is scheduled. Required teaching EVENT's
      sync normalizer (`crmLeads.service.ts`) to populate `dueDate`/`status`
      for the first time (`Start_DateTime`; status derived from
      Events vs. Events_History, same convention as CALL) — previously
      unused for that type. **A full re-sync is required** for existing
      Event rows to carry a due date/status or be considered at all.
  - **Download CSV (2026-09-15)**: a button next to the Leads section
    header exports the exact same rows/columns as the on-screen table (plus
    "Next follow up type"/"Next follow up status" split into their own
    columns, and the new Country/Lead Quality columns), honoring whatever
    date range/staff/country/quality filters are currently active. Backend:
    `GET /crm-lead-reports/daily/leads.csv` reuses `getDailyReport` plus the
    existing `toCsv()` helper (`utils/csv.ts`, same one `reports.controller.ts`
    already uses for its own CSV exports) — no new CSV/Excel library added.
    Frontend: `downloadDailyLeadsCsv()` in `DailyReportSection.tsx` uses the
    same auth-aware blob-download pattern as `Reports/KpiReportSection.tsx`'s
    `downloadCsv()` (`responseType: "blob"` + `URL.createObjectURL` + a
    synthetic `<a download>` click — a plain `<a href>` wouldn't carry the
    Bearer token this app's API client attaches to every request).
  - **Calls table status filter (2026-09-13)**: an All/Completed
    only/Not completed only dropdown local to the Calls card (client-side,
    doesn't refetch) — the card mixes both statuses by default with missed
    ones flagged amber, but this lets you isolate just the completed or
    just the still-outstanding calls within the current date range.
  - **"Leads assigned" is now range-scoped too (2026-09-13)**: previously
    a plain current-count-per-staff snapshot that ignored the From/To
    filter entirely, while every other section on the page reacted to it.
    Zoho tracks no change history for Staff Name, so "assigned as of a past
    day" still isn't computable — instead this now means *leads created
    within the selected range, grouped by whoever currently holds them*,
    filtered on `zohoCreatedTime` the same way every other creation-date
    filter in this module already works. A narrow range with no new leads
    created in it now correctly shows 0, rather than always showing the
    full all-time total.
  - **Comparison bar charts, not per-metric pies (2026-09-13)**: "Tasks
    completed (23)" and "Tasks due (3)" used to be two separate pies, each
    only showing its own 100%-of-itself split by staff — useless for
    comparing the two numbers against each other. Replaced with one grouped
    bar chart per domain (`ComparisonBarCard` in `DailyReportSection.tsx`,
    generic over the row shape) — Tasks: completed vs. due per staff, and
    Calls: completed vs. missed per staff — backed by a new `combineByStaff`
    helper in `crmLeadReports.service.ts` that outer-joins two activity-item
    arrays into per-staff `{a, b}` rows. Replaces the old per-section
    `byStaff` breakdown in the API response with `taskComparison`/
    `callComparison`.
  - **From/To is a genuine inclusive range (2026-09-13), not two single
    days**: `?from=&to=` (Nepal-local, `Asia/Kathmandu` UTC+5:45; defaults
    to actual yesterday/today) — every section covers the *entire* span
    from the start of `from`'s day to the end of `to`'s day, so picking a
    week or a month shows everything in it, not just its two endpoints.
    (An earlier version of this filter incorrectly only looked at the
    `from` and `to` days themselves — fixed same-day.) "Calls yesterday"/
    "Calls today" were merged into one **Calls** table for this reason —
    both were really just "calls scheduled on day X," which only made
    sense as two separate sections when the report was hardcoded to
    exactly a 2-day window.
  - The response is sent with `Cache-Control: no-store` since "today"
    shifts by the hour. Required adding `dueDate`/`status` columns to
    `crm_lead_activity` (not captured before this), populated for TASK
    (Zoho's own `Due_Date`/`Status`) and CALL (derived from which related
    list it came from — open "Calls" vs. closed "Calls_History" — since
    Zoho's Calls related list has no clean status field of its own).
  - **Known simplification**: a call row shows status "Completed" as soon
    as Zoho moves it to `Calls_History` — which also happens for calls
    logged as cancelled/no-answer/etc., not only ones that actually
    connected. The row's Subject text usually carries the real outcome
    (e.g. "...cancelled"), so it's visible, just not treated as a distinct
    "missed" state — only a call still sitting in the open `Calls` list
    past its scheduled time counts as flagged-missed.
  - **Scheduled-vs-actual (2026-09-13)**: Calls now also carry `dueDate`
    (= `Call_Start_Time`, the scheduled time), matching Tasks — previously
    a Call's `occurredAt` *was* its scheduled time with no way to see
    "when it actually happened" separately. `occurredAt` for Calls is now
    Modified_Time-first (falling back to Call_Start_Time/Created_Time),
    same convention every other activity type already used. Every Daily
    Report row now shows both **Scheduled** (`dueDate`) and
    **Actual/Updated** (`occurredAt`) side by side, plus a **Latest note**
    column (the single most recent NOTE-type activity logged against that
    same lead — not a full note history, just a one-line glance). Calls
    are now filtered by `dueDate` (was `occurredAt`) so "which day"
    reflects when the call was scheduled, not last touched. Since `dueDate`
    was never populated for Calls before this, **a full backfill is
    required** for existing Call rows to show a Scheduled time or appear
    correctly in a range at all.
  - **Staff attribution fix (2026-09-13)**: confirmed against this org's
    real Zoho data that every CRM Task's `Owner` is one generic account
    (Harsh Singhania) and every Call's `Owner` is a different single
    generic account (Sanjay Singhania), regardless of who actually works
    the lead — so every Daily Report row (Tasks completed yesterday, Tasks
    due today, Calls yesterday, Calls today) is credited to the parent
    **Lead's `staffName`**, not the activity's own `actorName`. This is a
    deliberate, Daily-Report-specific exception — Activity Feed and every
    other activity-level view in this module still correctly use
    `actorName` ("who logged this"), which is a genuinely different
    question from "whose lead is this."
  `CrmReports/DailyReportSection.tsx`, backed by `GET /crm-lead-reports/daily`.
- **Closure Report tab** — a fifth CRM Reports tab: a Day/Week/Month toggle
  over a per-staff scoreboard of activities closed and deals converted.
  "Closed" means a CALL or TASK activity with `status: "Completed"` in the
  selected Nepal-time period; "converted" means a lead with
  `convertedDealId` set and `convertedAt` in that period. Both are
  credited to the parent lead's `staffName`, not `actorName` — same
  Harsh-Singhania/Sanjay-Singhania generic-Owner finding as the Daily
  Report above (fixed 2026-09-13; completed Calls/Tasks were previously
  both credited to `actorName`).
  - **"Deals converted" means a Deal, not just any conversion
    (2026-09-13)**: Zoho's Lead-conversion wizard can convert a Lead to just
    an Account/Contact with no Deal created — the generic `converted`
    boolean doesn't distinguish this. Confirmed against real data (91 leads
    `converted: true`, only 23 with a `convertedDealId`) that counting the
    flag overstated deals closed by ~4x. Fixed to filter on
    `convertedDealId: { not: null }`.
  `CrmReports/ClosureReportSection.tsx`, backed by `getClosureReport` /
  `GET /crm-lead-reports/closure`.
- **Owner → Staff Name migration (2026-09-10)**: the client added a custom
  "Staff Name" picklist field directly in Zoho (Leads module, API name
  `Staff_Name`) as the real field of record for lead assignment, and every
  staff-level filter/grouping across CRM Reports was switched from `ownerName`
  to this new `staffName` column (`crm_leads.staff_name`, migration
  `20260910105032_add_lead_staff_name`). Because the field is brand new,
  leads synced before this point have `staffName: null` until the next full
  backfill re-pulls them — **run Admin → Zoho CRM → Leads module → "Run full
  backfill" once** after deploying this change, or the Staff dropdown/every
  staff-level report will look empty despite `ownerName`/activity data still
  being present. Incremental sync alone won't backfill it, since Zoho doesn't
  bump a Lead's `Modified_Time` just because a field was added to the schema.
- **Role-based visibility scope (CRM Reports page only — does not change any
  other module's role rules)**: **removed 2026-09-16, client direction** —
  every role now sees everything, unrestricted. `getCrmStaffScope()`
  (`crmLeadReports.service.ts`) simply returns `null` for every caller now,
  which is this module's existing "unrestricted" convention throughout
  (`scopedNameFilter`/`leadRefineWhere`/etc. already treat `null` scope as
  "don't narrow"), so no other function needed touching — removing the
  restriction was a one-function change, not a sweep through every query.
  (Previously: Admin/Manager unrestricted, Team Lead their own team via the
  same reportingManagerId-based direct-reports rule Task/Timesheet/
  Attendance scoping uses, Staff themselves only, matched by a fuzzy
  `User.name` ↔ Zoho Staff Name picklist string join since `CrmLead` has no
  FK to `User` — verified working correctly before it was removed. Staff's
  access to this page at all — the nav link and route permission — is
  unrelated and still stands from an earlier change; only the row-level
  narrowing within the page was lifted.)
- `npm run seed:crm-leads-demo` (backend) populates ~40 fake leads/owners/
  activities so this UI has something to show without real Zoho credentials
  — local dev/demo only, mirrors `scripts/dev-db.mjs`'s role. (Removed from
  the local dev DB after live verification against the real org — rerun the
  script if you want it back for future dev work.)
- **Fixed post-launch, found via live testing against the real org**:
  (1) a converted Lead's Notes/Calls/Events/Tasks/Emails become unreachable
  via the Lead endpoint at all (Zoho moves them to the resulting Account/
  Contact/Deal) — was being logged as a sync failure for every converted
  lead, now skipped cleanly; (2) the `Emails` related list returns a
  completely different response shape than the other four (keyed by its own
  name, not `data`, with lowercase field names and no `id` — `message_id`
  is used instead) — was silently reading as empty for every lead, so no
  email ever synced despite ~2-3 existing per lead in this org. Both are in
  `modules/crmLeads/crmLeads.service.ts`.

**Not covered here**: like the Tasks sync, no real Zoho sandbox credentials
were available to run this end-to-end against live data — `prisma migrate
dev` (schema/migration), `tsc --noEmit` (both backend and frontend), and a
direct smoke test of the new tables/relations/upsert-dedup logic against a
real local Postgres all passed, but an actual poll against Zoho's API,
including whether the `Emails` related list responds the way `modules/
crmLeads/crmLeads.service.ts` assumes, was not exercised. The Reports UI
*was* exercised live in a browser (all three tabs, every dashboard widget)
against `npm run seed:crm-leads-demo` fake data, including a follow-up pass
to fix the Dashboard/Lead-wise/Staff-wise layouts, which originally grew
tall enough (unbounded lists) that reaching the next widget meant scrolling
past the current one's entire contents — every list/table is now a
fixed-height card that scrolls internally instead.

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
- `GET /api/leaderboard?period=WEEKLY|MONTHLY|QUARTERLY|ALL_TIME` — `ALL_TIME` (added 2026-09-16) spans from the Unix epoch through now (`getPeriodRange` in `leaderboard.service.ts`), rather than a real computed lower bound — simplest way to mean "every completed task ever" without a separate code path through `computeKpiForUser`/`computeTeamAverageVolume`, which only ever care about the range's edges. The same `LeaderboardPeriod` type/helper is shared by the Dashboard's Member KPI widget and the Leadership dashboard, so `ALL_TIME` is accepted there too even though neither surfaces a button for it yet.
- `GET /api/reports/{task-detail,task-summary,staff-performance,staff-timesheet,overdue,department-rollup,leaderboard-export}` (add `?format=csv` where supported). `staff-performance`/`staff-timesheet`/`staff-task-activity` accept an optional `?userId=` (defaults to the caller's own id); requesting someone else's requires the caller to actually have visibility over them (`getVisibleMemberIds`, same rule as every other team-scoped report) or it 403s — previously unchecked (any authenticated user, including Staff, could read anyone else's KPI/timesheet by id).
- `GET /api/reports/staff-task-activity?userId=&from=&to=` — the KPI Report's date-range drill-down: exactly the tasks that fed into that person's assigned/completed/overdue/pending counts for the given range (same per-task classification as `getKpiReport`), each with its activity-log entries logged within that range. Backs the click-to-expand row in `KpiReportSection.tsx` — clicking an employee re-fetches this with whatever `from`/`to` the page's own date filter currently has selected.
- `GET /api/reports/grouped?groupBy=employee|team|project|company|department` (+ `from`/`to`/`companyId`/`departmentId`/`projectId`/`employeeId`/`status`/`format`)
- `GET /api/reports/timesheet-summary?groupBy=employee|task|project|department`, `GET /api/reports/timesheet-detail` (+ `employeeId`/`taskId`/`projectId`/`departmentId`/`companyId`/`from`/`to`/`entryType`/`format`)

**Dashboards (added post-Phase-6)**
- `GET /api/dashboard/member-kpi?period=`, `/project-progress`, `/milestones-tracking`, `/delay-analysis`
- `GET /api/leadership?period=` (Admin only)

**Phase 5 — Zoho CRM sync**
- `GET /api/admin/zoho/status`, `GET /api/admin/zoho/sync-log`, `POST /api/admin/zoho/sync` (Admin only)
- `GET /api/admin/crm-leads/status`, `GET /api/admin/crm-leads/sync-log`, `POST /api/admin/crm-leads/sync` (`?full=true` for a full backfill instead of incremental) (Admin only)
- `GET /api/crm-lead-reports/dashboard/{assignment-overview,activity-feed,conversion-rate,stage-wise}` — CRM Reports Dashboard tab widgets (Admin/Manager/Team Lead); all accept `?createdSince=&createdBefore=&staffName=&country=&leadQuality=&assignment=`
- `GET /api/crm-lead-reports/kanban` — leads grouped by funnel stage (`?staffName=` scopes to one staff member, used by Staff-wise; also accepts `?country=&leadQuality=&assignment=`); shared by the Dashboard/Lead-wise/Staff-wise Kanban views
- `GET /api/crm-lead-reports/dashboard/grouped-by-staff` — every lead grouped by owner, for the Dashboard's "By Staff" view (`?country=&leadQuality=&assignment=` too)
- `GET /api/crm-lead-reports/countries` — distinct, non-null Country values across leads the requester can see, populates the shared Country filter dropdown (mirrors `/staff` below)
- `GET /api/crm-lead-reports/leads`, `GET /api/crm-lead-reports/leads/:id` — Lead-wise tab (selector + merged activity timeline, `?type=` filters to one activity type and hides stage/owner-change entries; selector also accepts `?country=&leadQuality=&assignment=`)
- `PATCH /api/crm-lead-reports/leads/:id/quality` — sets/clears a lead's local-only Lead Quality (`{ "quality": "POTENTIAL_DEAL" | "NURTURING" | "UNQUALIFIED" | null }`); any role that can already see the lead under the usual row-level scope can call this
- `GET /api/crm-lead-reports/staff` — Staff-wise tab's default overview (leads owned, conversion rate, activities logged, last activity per `staffName` — no one needs to be selected first; accepts `?country=&leadQuality=&assignment=` — `assignment=unassigned` here correctly returns no rows, since this view is inherently "per staff member"), `GET /api/crm-lead-reports/staff/:staffName` for the drill-down detail (path segment is the Staff Name field's value, URL-encoded — not Owner)
- `GET /api/crm-lead-reports/daily` — CRM Report tab (leads created, tasks completed, tasks due, calls, by staff — Nepal-time boundaries, ignores the leads-since date-range filter; accepts `?staffName=`, matched against the parent lead's `staffName` for every row — `?from=&to=`, a genuine inclusive date range defaulting to actual yesterday/today, covering every day in between, not just the two endpoints — and `?country=&leadQuality=&assignment=`)
- `GET /api/crm-lead-reports/daily/leads.csv` — same filters as `/daily`, streams the Leads table (plus Lead Quality) as a CSV download instead of JSON
- `GET /api/crm-lead-reports/closure?period=day|week|month` — Closure Report tab (activities closed + deals converted per staff, Nepal-time period bounds; accepts `?staffName=&country=&leadQuality=&assignment=` — same "no rows for unassigned" behavior as `/staff` above)

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
