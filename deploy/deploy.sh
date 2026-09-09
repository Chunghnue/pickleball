#!/usr/bin/env bash
# Build images, run migrations, (re)start the stack, wait for health.
#
#   ./deploy/deploy.sh              # build + migrate + up + healthcheck
#   ./deploy/deploy.sh --pull       # git pull --ff-only first
#   ./deploy/deploy.sh --no-build   # skip image build (just migrate + up)
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

DO_PULL=0
DO_BUILD=1
for arg in "$@"; do
  case "$arg" in
    --pull) DO_PULL=1 ;;
    --no-build) DO_BUILD=0 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

if [ "$DO_PULL" = 1 ]; then
  log "git pull --ff-only"
  git pull --ff-only
fi

if [ "$DO_BUILD" = 1 ]; then
  log "Building images"
  compose build
fi

log "Running database migrations"
compose run --rm api-migrate

log "Starting services"
compose up -d postgres api web

log "Waiting for health"
"$(dirname "${BASH_SOURCE[0]}")/healthcheck.sh"

log "Stack status"
compose ps
