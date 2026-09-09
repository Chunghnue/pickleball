#!/usr/bin/env bash
# Seed idempotent test data (admin/owner/staff/customer accounts + a sample
# venue, courts, pricing, bookings, page views, blog posts). Safe to re-run.
# Common password for all seeded users: Test@123456
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

log "Seeding test data"
compose run --rm --entrypoint sh api-migrate -c \
  "npx ts-node src/database/seeds/seed-test-data.seed.ts"
