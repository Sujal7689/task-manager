# Deployment Guide

How this app gets from a `git push` to running on the production server, and
how to operate/troubleshoot that pipeline. Read this before touching
`.github/workflows/ci.yml`, `docker-compose.prod.yml`, or the production
server's config.

## 1. Architecture at a glance

```
Developer          GitHub Actions                              Prod server (hitech-n8n)
──────────         ─────────────────────────────────            ──────────────────────────
git push main  →   1. test        (spins up Postgres, runs
                                    prisma migrate + seed +
                                    vitest against a real DB)
                    2. build-and-push
                       - docker build ./backend  → push image
                       - docker build ./frontend → push image
                         (VITE_API_URL baked in at build time)
                       tags: ghcr.io/sujal7689/task-manager-{backend,frontend}:<git-sha>
                    3. deploy (SSH)                          →  cd /opt/task-manager
                                                                 docker compose pull
                                                                 docker compose up -d
                       smoke test: curl https://$DOMAIN/api/health
```

**Key principle:** the production server never sees this repository's source
code. It only ever holds `docker-compose.prod.yml` and `.env`, and pulls
pre-built images from GitHub Container Registry (GHCR). All builds happen in
GitHub Actions.

**TLS/domain routing** is handled by nginx already running on the host
(outside Docker) — there is no Caddy or in-stack nginx proxy container. The
`backend` and `frontend` containers each publish directly to
`127.0.0.1:<port>`, and the host's nginx reverse-proxies the public domain to
those two local ports.

## 2. The three CI/CD jobs ([.github/workflows/ci.yml](.github/workflows/ci.yml))

### `test`
Runs on every push and PR to `main`. The backend test suite
(`backend/tests/`) is a real integration suite — it hits a live database via
Prisma, not mocks — so this job spins up a `postgres:16-alpine` **service
container**, then:
1. `npx prisma migrate deploy` — applies all committed migrations
2. `npm run seed` — creates the demo users the tests log in as
   (`admin@example.com` / `Password123!`, etc.)
3. `npm test` — runs Vitest + Supertest

If this job fails, nothing downstream runs — no image gets built or deployed.

### `build-and-push`
Only runs on a push to `main` (not on PRs), and only if `test` passed.
- Computes an image tag from the short git SHA (`git rev-parse --short HEAD`)
- Logs into `ghcr.io` using the automatic `GITHUB_TOKEN` (no PAT needed here)
- Builds and pushes both images, each tagged with **both** the git SHA and
  `latest`:
  - `ghcr.io/sujal7689/task-manager-backend:<sha>`
  - `ghcr.io/sujal7689/task-manager-frontend:<sha>`
- The frontend build receives `VITE_API_URL` as a Docker build-arg — this
  value gets compiled directly into the static JS bundle at this point (see
  §5 below), it is **not** read at container runtime.

### `deploy`
SSHes into the production server as a dedicated `deploy`-style user, and:
1. Writes `.image_tag.env` with `IMAGE_OWNER` and `IMAGE_TAG` (the SHA just
   built)
2. `docker compose pull` — fetches the new images from GHCR
3. `docker compose up -d` — recreates only the containers whose image
   changed
4. `docker image prune -f` — cleans up now-unused old image layers
5. Runs a smoke test: `curl https://$DOMAIN/api/health`, which must return
   `{"status":"ok"}` ([backend/src/app.ts:37](backend/src/app.ts:37)) or the
   whole workflow is marked failed.

## 3. GitHub repository configuration

Settings → **Secrets and variables → Actions**.

### Secrets tab

| Name | Purpose |
|---|---|
| `PROD_HOST` | Server IP/hostname (e.g. `hitech-n8n`) |
| `PROD_USER` | SSH user used for deploys |
| `PROD_SSH_KEY` | Private key matching a public key in that user's `~/.ssh/authorized_keys` on the server |
| `PROD_SSH_PORT` | Optional — only needed if SSH isn't on port 22 |

`GITHUB_TOKEN` is automatic; never add it manually.

### Variables tab

| Name | Value | Used by |
|---|---|---|
| `VITE_API_URL` | `/api` (relative path — **not** a full URL) | `build-and-push` job, baked into the frontend image |
| `DOMAIN` | bare hostname, e.g. `tasks.myswastikonline.com` (**no** `https://` prefix) | `deploy` job's smoke-test `curl` |

Getting either of these wrong is a common source of confusing failures:
- `VITE_API_URL` set to `http://localhost:4000/api` → every visitor's browser
  tries to reach their *own* machine, not the server. Must be `/api`.
- `DOMAIN` set with `https://` already included → the smoke test builds
  `https://https://.../api/health` (invalid) or, if `DOMAIN` is unset
  entirely, curl mis-parses `https:///api/health` and reports
  `Could not resolve host: api`.

## 4. Production server: one-time setup

The server only needs three things in `/opt/task-manager/`:
`docker-compose.prod.yml`, `.env`, and (created automatically on each deploy)
`.image_tag.env`.

```bash
sudo mkdir -p /opt/task-manager
sudo chown $USER:$USER /opt/task-manager
```

Copy the compose file from your local checkout (never from a stale copy):
```bash
scp docker-compose.prod.yml <user>@<server>:/opt/task-manager/
```

Create `.env` directly on the server (don't scp real secrets across if
avoidable) — see §6 for the full variable reference. At minimum:
`POSTGRES_PASSWORD`, `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN`, `DOMAIN`.

Log the server into GHCR so it can pull the (private) images:
```bash
docker login ghcr.io -u <github-username>
# password = a GitHub Personal Access Token with read:packages scope
```

First manual start (confirms everything before letting CI drive it):
```bash
cd /opt/task-manager
echo "IMAGE_OWNER=sujal7689" > .image_tag.env
echo "IMAGE_TAG=latest" >> .image_tag.env
docker compose --env-file .env --env-file .image_tag.env -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml ps
```

## 5. `docker-compose.prod.yml` reference

Three services only: `postgres`, `backend`, `frontend`.

- **`postgres`** — data persists in the named volume `pgdata`; its port is
  never published to the host.
- **`backend`** — image `ghcr.io/${IMAGE_OWNER}/task-manager-backend:${IMAGE_TAG:-latest}`,
  published to `127.0.0.1:${BACKEND_PORT:-4000}:4000` (host-loopback only —
  unreachable from outside the machine; only the host's own nginx should
  talk to it). Its Docker `CMD` runs `prisma migrate deploy` automatically on
  every container start, then starts the server — so migrations apply
  themselves on deploy, no manual step needed. Uploaded files persist in the
  named volume `uploads`, mounted at `/app/uploads` inside the container.
- **`frontend`** — image `ghcr.io/${IMAGE_OWNER}/task-manager-frontend:${IMAGE_TAG:-latest}`,
  published to `127.0.0.1:${FRONTEND_PORT:-3000}:80`. This image bundles its
  own nginx internally just to serve the static build output — unrelated to
  the host's nginx.

`IMAGE_OWNER`/`IMAGE_TAG` come from `.image_tag.env`, written fresh by every
CI deploy. For a manual run, default to `latest` as shown in §4.

## 6. Environment variables (`.env` on the server)

See [.env.example](.env.example) for the full annotated template. Summary:

| Must be real values | Notes |
|---|---|
| `POSTGRES_PASSWORD` | strong random value |
| `DATABASE_URL` | must use the same password as above |
| `JWT_SECRET` | long random string (`openssl rand -base64 48`) |
| `CORS_ORIGIN` | your real domain, e.g. `https://tasks.myswastikonline.com` |
| `DOMAIN` | bare hostname — not read by compose itself, just for your reference and the host nginx config |

| Fine to leave at their `.env.example` defaults | |
|---|---|
| `POSTGRES_USER`, `POSTGRES_DB`, `PORT`, `JWT_EXPIRES_IN`, `UPLOAD_DIR`, all the `*_CRON_SCHEDULE` vars |

| Change only if the port is already taken on the server | |
|---|---|
| `BACKEND_PORT` (default `4000`), `FRONTEND_PORT` (default `3000`) — check with `sudo ss -tlnp \| grep <port>` first |

| Not applicable on the server at all | |
|---|---|
| `VITE_API_URL` — only consumed at image build time in CI (as a GitHub **Variable**, not from this file) |

| Leave blank unless Zoho sync is in use | |
|---|---|
| `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN`, `ZOHO_FALLBACK_ASSIGNEE_EMAIL` |

## 7. Host nginx configuration

The production server runs nginx directly on the host for TLS termination
and domain routing (this box also hosts other services, e.g. n8n, so Caddy
and an in-Docker nginx proxy were both deliberately avoided in favor of
reusing the nginx already there).

`/etc/nginx/sites-available/task-manager`:
```nginx
upstream task_manager_backend {
    server 127.0.0.1:4000;   # must match BACKEND_PORT
}

upstream task_manager_frontend {
    server 127.0.0.1:3000;   # must match FRONTEND_PORT
}

server {
    listen 80;
    listen [::]:80;
    server_name tasks.myswastikonline.com;

    client_max_body_size 20m;

    location /api/ {
        proxy_pass http://task_manager_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /uploads/ {
        proxy_pass http://task_manager_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://task_manager_frontend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable it and get TLS via certbot (which rewrites this file to add the
`listen 443 ssl` block and an HTTP→HTTPS redirect — don't hand-write that
part):
```bash
sudo ln -s /etc/nginx/sites-available/task-manager /etc/nginx/sites-enabled/task-manager
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d tasks.myswastikonline.com
```

`upstream task_manager_backend`/`task_manager_frontend` are arbitrary labels
this config invents — they are **not** Docker container names. nginx runs on
the host, entirely outside Docker, and only ever talks to
`127.0.0.1:<port>`.

## 8. Redeploy and rollback

### Automated rollback (preferred)

[.github/workflows/rollback.yml](.github/workflows/rollback.yml) is a
manually-triggered workflow — no SSH access needed by whoever runs it, and
no local `git`/`docker` tooling required either.

**To run it:** GitHub repo → **Actions** tab → **Rollback** (left sidebar) →
**Run workflow**.
- Leave `image_tag` blank to roll back to whatever was deployed immediately
  before the current one (it reads this from `deploy-history.log`, which
  every `deploy` and `rollback` run appends a line to on the server).
- Or fill in `image_tag` with a specific git short-SHA (from `git log
  --oneline` or the Actions run history) to jump to an exact build.

It does the same pull/up/prune the normal deploy does, just with the chosen
tag instead of the newest one, then runs the same smoke test.

Each server only keeps the last 50 lines of `deploy-history.log`, so
auto-rollback only reaches back that far — beyond that, pass an explicit
`image_tag`.

### Manual redeploy / rollback (fallback, if Actions itself is unreachable)

**Redeploy the current `latest` images by hand:**
```bash
cd /opt/task-manager
docker compose --env-file .env --env-file .image_tag.env -f docker-compose.prod.yml pull
docker compose --env-file .env --env-file .image_tag.env -f docker-compose.prod.yml up -d
```

**Roll back to a specific previous build** — since every image is tagged
with its git SHA (not just `latest`), rollback doesn't require a rebuild:
```bash
cd /opt/task-manager
echo "IMAGE_OWNER=sujal7689" > .image_tag.env
echo "IMAGE_TAG=<previous-short-sha>" >> .image_tag.env
docker compose --env-file .env --env-file .image_tag.env -f docker-compose.prod.yml pull
docker compose --env-file .env --env-file .image_tag.env -f docker-compose.prod.yml up -d
```
Find previous SHAs from the git log, the Actions run history, or
`cat /opt/task-manager/deploy-history.log` on the server.

## 9. Backup and data migration

**Routine backup:**
```bash
docker compose -f docker-compose.prod.yml exec postgres pg_dump -U taskmgmt taskmgmt > backup-$(date +%F).sql
```
Copy the dump off the server (not just onto the same disk).

**Migrating data from another machine into this server** (e.g. moving off an
old host): dump the old database with `pg_dump --no-owner --no-privileges`,
`scp` the `.sql` file and the uploads folder over, then on this server: stop
`backend`/`frontend` (not `postgres`), drop and recreate the `taskmgmt`
database, pipe the dump into it via
`docker compose exec -T postgres psql -U taskmgmt -d taskmgmt`, copy the
uploads folder into the `uploads` named volume with a throwaway
`alpine` container, then start `backend`/`frontend` back up. Prisma's
migration history travels with the dump, so `prisma migrate deploy` on
startup will recognize it as already up to date and do nothing further.

## 10. Troubleshooting things that have actually gone wrong here

- **`cd: /opt/task-manager: No such file or directory`** — the one-time
  server setup (§4) was never done. SSH auth working is not the same as the
  directory existing.
- **`docker compose up` tries to build from `./backend`/`./frontend`** — the
  compose file on the server is stale (still has old `build:` directives
  instead of `image:`). Re-`scp` the current `docker-compose.prod.yml` from
  this repo; `grep -A1 "backend:\|frontend:"` on the server to confirm it
  says `image:`, not `build:`.
- **`Could not resolve host: api`** in the smoke-test step — the `DOMAIN`
  GitHub **Variable** is unset or empty (this is separate from the `DOMAIN`
  value in the server's `.env`; both must be set independently).
- **Frontend loads but API calls fail in the browser** — `VITE_API_URL` was
  baked in as a `localhost` URL instead of `/api`. Fixing this requires
  updating the GitHub Variable *and* rebuilding the frontend image (the
  value is compiled into the static JS, not read at runtime — editing the
  server's `.env` does nothing).
- **502 from nginx** — the `upstream` port in the host nginx config doesn't
  match the container's actual published port. Check with
  `docker compose -f docker-compose.prod.yml ps` and compare against
  `BACKEND_PORT`/`FRONTEND_PORT` in `.env`.
- **`pull` step reports "Skipped No image to be pulled"** for
  backend/frontend — same root cause as the stale-compose-file issue above.

## 11. Security notes

- The server's `.env` must never be committed — it's covered by
  [.gitignore](.gitignore). Only `.env.example` (placeholders only) is
  tracked.
- This repo's git history contains a real credential leak (commit
  `6117172`, later reverted in `f3f42cb`) — real Zoho OAuth credentials were
  briefly committed to `.env.example`. Reverting a commit does **not**
  remove it from history; if those credentials haven't been rotated yet,
  treat them as compromised and rotate them in the Zoho console regardless
  of the revert.
