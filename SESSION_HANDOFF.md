# Session Handoff — Task Management System

Written 2026-10-09 for account switch. No prior context carries over — read this fully before doing anything.

## Project

Repo: `C:\Users\Gaurav Chaudhary\Documents\Task management software\task-manager`
GitHub: https://github.com/Sujal7689/task-manager (branch `main`)
Stack: Node/Express/TypeScript backend + Prisma/Postgres, React/Vite/TypeScript frontend, Tailwind.
Org: HiTech Solutions and Services Pvt. Ltd. (Kathmandu, Nepal). Client-facing product name in commits: "Tradeila Ops".

Full architecture, conventions, and a long dated changelog of every feature live in `README.md` at repo root — read it before making changes. It documents CRM Leads/Zoho sync, CRM Reports filters, role model, attendance, audit log, known gaps.

## Git state at handoff

- Clean except `frontend/tsconfig.tsbuildinfo` (a TS build-cache artifact, accidentally tracked long ago, regenerates every `tsc` run — never worth committing, just leave it modified/unstaged).
- `main` is up to date with `origin/main` as of commit `32b10c6`.
- Commit convention used all session: `git -c user.name="Gaurav Chaudhary" -c user.email="bff.sdlkpgc@gmail.com" commit -m "..."`. Git has **no identity configured on this machine** — never run `git config --global`, always use the `-c` scoped flags per commit.
- Always create new commits, never amend. Never force-push.

## Local dev environment

Three processes, all on this Windows machine, frequently die when the machine sleeps/idles — check and restart each session:

1. **Postgres** (embedded, not system-installed): start with
   `"./node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe" start -D ".dev-pg-data" -o "-p 5433" -l "pg.log" -w`
   run from `backend/`. Port 5433. Creds: user `taskmgmt`, password `devpassword123`, db `taskmgmt`. Never run `dev-db.mjs`'s `initialise()` on existing data — it force-runs `initdb` and errors loudly (harmlessly) if data exists; use `pg_ctl` directly instead.
2. **Backend**: `cd backend && npm run dev` (tsx watch, port 4000). Needs `backend/.env` — if missing, copy root `.env` and override `DATABASE_URL=postgresql://taskmgmt:devpassword123@localhost:5433/taskmgmt` and `CORS_ORIGIN=http://localhost:5175`.
3. **Frontend**: `cd frontend && npm run dev -- --port 5175` (Vite, port 5175).

Run backend/frontend as background `nohup` processes; check `netstat -ano | grep -E ":4000|:5175|:5433"` to see what's alive before assuming anything is running.

Seeded demo logins (all password `Password123!`): `admin@example.com`, `manager@example.com`, `teamlead@example.com`, `staff@example.com`.

After any Prisma schema change: `npx prisma migrate dev` from `backend/`.

## Critical: Zoho credential leak (2026-09-15) — rotation status unclear

Real Zoho OAuth2 credentials (client ID, client secret, refresh token) were accidentally committed into `.env.example` in commits outside this session, then caught by GitGuardian. This session restored `.env.example` to blank placeholders and fixed `.gitignore` (it had been flipped to ignore `.env.example` instead of `.env` — backwards). **The user said they rotated the Zoho refresh token afterward**, but I never independently verified the rotation completed or that the old leaked commit was scrubbed from git history (scrubbing was offered, not done — history rewrite needs explicit user confirmation, never do it unilaterally). If Zoho sync misbehaves, check this first.

## CRM Leads / Zoho sync + CRM Reports module

This was the largest body of work this session. Key facts:

- One-way sync: Zoho CRM Leads module → `CrmLead`/`CrmLeadActivity` Postgres tables. Sync code: `backend/src/modules/crmLeads/crmLeads.service.ts`. Cron jobs: incremental every 15 min, full backfill hourly (`backend/src/jobs/`).
- **`staffName`** (Zoho custom "Staff Name" picklist, who actually works a lead) is the field of record for all staff-level filtering — **not** `ownerName` (Zoho's standard Owner field, unreliable in this org, kept only as informational display).
- CRM Reports page (`frontend/src/pages/CrmReports/`) has 5 tabs: Dashboard, **CRM Report** (renamed from "Daily Report", same URL key `daily-report` for back-compat), Lead-wise, Staff-wise, Closure Report.
- Shared filter bar (`LeadDateFilterBar.tsx` + `leadDateFilter.ts`) applies across every tab via URL params: date range, Staff, Country, Lead Quality, Assigned/Unassigned, **Stage** (leadStatus raw value — most recently added filter). Backend threading pattern: `ReportFilters` interface + `leadRefineWhere()` helper in `crmLeadReports.service.ts` — any new filter of this kind should follow that exact pattern (grep `leadRefineWhere(` call sites, there are ~10, must all be updated together).
- **Row-level visibility scoping was removed entirely 2026-09-16** (client direction) — `getCrmStaffScope()` now always returns `null` (unrestricted). Every role sees every lead on this page. This does NOT affect any other module's RBAC.
- Lead Quality (Potential Deal/Nurturing/Unqualified) is a **local-only** field, never synced to/from Zoho — editable from the Lead-wise detail panel by anyone who can see the lead.
- Country field requires a **full re-sync** (`POST /api/admin/crm-leads/sync?full=true`, Admin only) to backfill on existing leads — already run once this session (463/474 leads backfilled).
- CRM Report page has a CSV export button and This Week/Month/Quarter quick-date buttons.
- "Leads" overview card on CRM Report page: total now correctly includes unassigned leads unless a staff filter narrows it (this was a real bug fixed 2026-09-16 — previously silently excluded unassigned from the total).

## Other features built this session

- **Audit log**: Task `percentComplete` changes (fired on every slider drag tick) were spamming one row per tick — now collapsed server-side into one row per task per day (`auditLog.service.ts`'s `collapsePercentComplete`), labeled "Completion % increased/decreased (adjusted N times that day)". Every other audited field unchanged.
- **Leaderboard**: added "All Time" period alongside Weekly/Monthly/Quarterly (`getPeriodRange` in `leaderboard.service.ts`, epoch-to-now).
- **Role label**: STAFF role now *displays* as "Employee" everywhere in the UI (`frontend/src/lib/roleLabels.ts`) — the underlying `Role.STAFF` enum, DB values, and permission checks are **unchanged**, display-only.
- **Attendance**: Team view got an "Employee" filter dropdown, scoped identically to the Team view itself (Admin sees all, Manager sees org-wide Staff/Team Leads, Team Lead sees direct reports). New endpoint `GET /attendance/visible-users`. Fails closed (zero rows) if someone requests a `userId` outside their own visibility scope.
- **User activate/deactivate**: this already existed before this session (Admin → Users, a one-click ACTIVE/INACTIVE toggle) — verified still works correctly, no changes needed. Deactivating only flips `status`, never touches a user's tasks/assignments; login is blocked for INACTIVE accounts.

## CI/CD (built by someone else, outside this session, merged in cleanly)

Found mid-session: a full GitHub Actions pipeline landed on `main` from another source — `.github/workflows/ci.yml` (build/push Docker images to GHCR, SSH deploy), `.github/workflows/rollback.yml`, `DEPLOYMENT.md`. It assumes deployment at `/opt/task-manager` on a VPS with Docker + SSH + nginx on the host (Caddy was removed in favor of host nginx).

**Unresolved**: the user pasted a path `/home/sdgyzvwsaqyq/public_html/tradeila.com` (shared/cPanel-hosting-style path, inconsistent with the `/opt/task-manager` VPS-style path baked into the CI/CD config) then immediately said it "wasn't meant for" this session and to disregard it. **Never acted on it.** If deployment is actually failing or targeting the wrong host path, this mismatch (cPanel-style path vs. assumed VPS `/opt` path) is the first thing to check — ask the user directly whether the real server is a VPS or shared hosting, since the current CI/CD (Docker Compose-based) will not work at all on shared/cPanel hosting without a different deploy approach.

## Known recurring friction this session

- Browser-automation screenshots in this environment intermittently time out / render black, especially on pages with charts or after scrolling. Workaround: use `get_page_text`/`find`/`read_page` (not screenshots) to verify UI state, or direct JS DOM measurement via `javascript_tool` when pixel-level layout needs confirming.
- The three local dev processes (Postgres, backend, frontend) go down together whenever the host machine sleeps for an extended period — always check `netstat` before assuming anything is running, and use the exact restart commands above.
- `frontend/tsconfig.tsbuildinfo` is a build-cache file that was accidentally committed at the start of the project's history and shows as modified after nearly every typecheck. Harmless; just don't `git add` it. Was offered to the user to gitignore+untrack properly; never actioned.

## Working conventions this session followed (carry forward)

- Always typecheck both sides after a change: `cd backend && npx tsc --noEmit` and `cd frontend && npx tsc -b` — both must be silent (no output) before considering a change done.
- Always verify changes live (curl the API with a real login token, then check the browser), not just "typecheck passed."
- Document every feature/fix in `README.md` with a dated bullet explaining what changed and why, matching the existing density/style — this repo's README is the actual living spec, keep it that way.
- Before pushing: always `git fetch` + check for upstream changes first — this session hit a real rejected push once (concurrent unrelated commits landed from outside the session) and had to merge, not force.
