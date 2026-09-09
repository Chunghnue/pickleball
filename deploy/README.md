# Deployment

Docker stack for running Pickleball in production: **Postgres + API (NestJS) +
Web (Next.js standalone)**, defined in [`../docker-compose.prod.yml`](../docker-compose.prod.yml).

## Layout

| File | Purpose |
|---|---|
| `../docker-compose.prod.yml` | The stack. Project name `pickleball-prod`. |
| `../apps/api/Dockerfile` | Multi-stage: `build` (also the migration runner) → `runtime` (`node dist/main.js`). |
| `../apps/web/Dockerfile` | Multi-stage: `build` (`next build`, `output: "standalone"`) → `runtime` (`node server.js`). |
| `.env.example` | Template for `deploy/.env` (secrets, DB creds, URLs). |
| `deploy.sh` | Build images → run migrations → `up -d` → wait for health. |
| `migrate.sh` | `migration:run` / `migration:revert`. |
| `seed.sh` | Idempotent test data (password `Test@123456`). |
| `healthcheck.sh` | Poll the api + web container healthchecks. |

## First deploy

```bash
cp deploy/.env.example deploy/.env
# edit deploy/.env — at minimum set JWT_ACCESS_SECRET (openssl rand -hex 32),
# DB_PASSWORD, APP_URL, and NEXT_PUBLIC_GOOGLE_MAPS_API_KEY if using the map.

docker network create proxy-net 2>/dev/null || true   # if not already present

./deploy/deploy.sh
```

`api` and `web` do **not** publish host ports — they are reached over the
Docker network. `web` also joins the external `proxy-net` network so a reverse
proxy on that network can route to it.

## Reverse proxy (nginx-proxy-manager)

Add a Proxy Host:

| Field | Value |
|---|---|
| Domain | `pickleball.divusoft.com` |
| Scheme / Forward Host / Port | `http` / `pickleball-web` / `3000` |
| Block Common Exploits, Websockets Support | on |
| SSL | Let's Encrypt cert + Force SSL + HTTP/2 |

The NPM container must share the `proxy-net` network (it does if it was created
`external`). No firewall hole is needed — traffic stays on the Docker network.

## Routine updates

```bash
./deploy/deploy.sh --pull      # git pull --ff-only, rebuild, migrate, restart
```

## Notes

- **Build-time values.** `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` and the
  `/uploads/*` rewrite target (`API_BASE_URL=http://api:3001`) are baked into
  the web image at build time. Changing them requires a rebuild
  (`./deploy/deploy.sh`, or `compose build web`).
- **Uploads** (venue logos, court images) persist in the `api_uploads` volume.
- **Mail.** Defaults point at a bundled Mailhog available under the `mail`
  profile (`docker compose -f docker-compose.prod.yml --profile mail up -d`).
  For real mail set `MAIL_HOST` / `MAIL_PORT` / `MAIL_FROM` in `deploy/.env`.
- **Migrations** run through ts-node against `src/migrations/*.ts` inside the
  API image's `build` stage — that is why `deploy.sh` runs `api-migrate`
  before starting `api`.

## Migrating off the PM2 setup

If the app currently runs under PM2 on host ports 3000/3001:

1. `pg_dump` the existing database, `pg_restore` into the stack's Postgres
   (or point `DB_HOST` in `deploy/.env` at the existing DB and skip the
   bundled `postgres` service).
2. `./deploy/deploy.sh`
3. Repoint the NPM proxy host from `172.18.0.1:3000` to `pickleball-web:3000`.
4. `pm2 delete pickleball-api pickleball-web && pm2 save`
5. Optionally drop the `ufw allow ... to any port 3000` rule.
