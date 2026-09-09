# Pickleball — Venue Booking & Management Platform

This repo is a SaaS admin platform for owners of sports venues (pickleball,
football, badminton, tennis, basketball, etc.), covering courts, booking
schedules, customers, pricing, multiple branches, staff, and revenue
reporting. The intended feature set mirrors **SanBong.vn**, whose UI/behavior
was reverse-engineered into specs under `docs/spec/` (Vietnamese, read
`docs/spec/00-tong-quan.md` / `docs/spec/CLAUDE.md` first) — treat those specs
as the source of truth for expected screens and behavior, not for this repo's
own code architecture.

## Repo layout

| Path | Stack | Purpose |
|---|---|---|
| `apps/api` | NestJS + TypeORM + Postgres | Backend REST API (auth, bookings, pricing, staff, reports...) |
| `apps/web` | Next.js 16 (App Router) + React 19 | Admin web frontend |
| `docs/spec` | Markdown | Reverse-engineered SanBong.vn feature specs (target UX reference) |
| `docker-compose.yml` | Postgres 16 + Mailhog | Local dev infra (DB on `5433`, mail catcher on `1025`/`8025`) |

## Local development

```bash
docker compose up -d                # Postgres (5433) + Mailhog (1025/8025 UI)

cd apps/api
cp .env.example .env                # DB_*, JWT_*, MAIL_*, PORT=3001
npm install
npm run migration:run
npm run start:dev                   # http://localhost:3001

cd apps/web
cp .env.example .env                # API_BASE_URL=http://localhost:3001
npm install
npm run dev                         # http://localhost:3000
```

Seed test data (idempotent) from `apps/api`:
`npx ts-node src/database/seeds/seed-test-data.seed.ts` — creates admin,
owner, staff, and customer accounts (password `Test@123456`) plus a sample
venue, courts, pricing rules, and bookings.

## Production deployment

Dockerized stack (Postgres + API + Next.js standalone) in
`docker-compose.prod.yml` with `apps/api/Dockerfile` and `apps/web/Dockerfile`.

```bash
cp deploy/.env.example deploy/.env   # set JWT_ACCESS_SECRET, DB_PASSWORD, APP_URL...
./deploy/deploy.sh                   # build -> migrate -> up -d -> healthcheck
```

`deploy/deploy.sh --pull` for routine updates; `deploy/migrate.sh`,
`deploy/seed.sh` for those steps alone. `api`/`web` expose no host ports;
`web` joins the external `proxy-net` network for a reverse proxy to route to
`pickleball-web:3000`. Full notes in `deploy/README.md`.

## Domain overview (from `docs/spec/00-tong-quan.md`)

The admin UI is organized around a left sidebar with these functional groups:

| Group | Item | Short description |
|---|---|---|
| Branch | Branch selector | Switch between a specific branch or "All branches" |
| Overview | Dashboard | Today's figures, revenue, most recent bookings |
| Court Management | Court List | Catalog of sports courts |
| Court Management | Booking Schedule | Grid calendar (hour/day); create/cancel bookings |
| Court Management | Customers | Customer list and history |
| Court Management | Pricing | Hourly price tiers and weekly recurring bookings |
| Reports | Revenue | Financial report by time range |
| Reports | Page Views | Traffic analytics for the public booking page |
| System | Branches | List of branches (locations) |
| System | Accounts | Staff accounts and permissions |
| System | Settings | Venue info, operating hours, notifications, personal account |

A persistent header and floating "Messages" button provide shared functions
on every page.

**Court Management** is the core: owners declare courts per sport, configure
price tiers by time slot (including advance/priority pricing), manage
bookings via a visual grid (hour × court, by week), support quick and
weekly-recurring bookings (long-term renters), and manage customers
(VIP/Regular/New classification, spending history).

**Reports** covers revenue by transaction/time period, and public page views
(visitor behavior, peak hours, view-to-booking conversion rate).

**System** operates multi-branch setups: add/edit branches (map + dedicated
URL slug for the public booking page), manage staff across 4 roles (Owner,
Manager, Cashier, Staff), and general configuration (venue info, per-weekday
operating hours, notification toggles, personal info/password).

**Customer Chat Inbox** is the built-in channel for replying to customers
messaging in from the public booking page, filterable by conversation status
and assigned handler.

See `docs/spec/01-dashboard.md` through `docs/spec/12-header-va-chuc-nang-chung.md`
for per-screen detail on each of the groups above.
