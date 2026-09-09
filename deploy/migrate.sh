#!/usr/bin/env bash
# Run TypeORM migrations against the stack database.
#
#   ./deploy/migrate.sh              # migration:run
#   ./deploy/migrate.sh revert       # migration:revert
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

case "${1:-run}" in
  run)    log "migration:run";    compose run --rm api-migrate ;;
  revert) log "migration:revert"; compose run --rm api-migrate npm run migration:revert ;;
  *) echo "usage: $0 [run|revert]" >&2; exit 2 ;;
esac
