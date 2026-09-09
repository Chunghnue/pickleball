#!/usr/bin/env bash
# Shared helpers for the deploy scripts. Source this; don't run it.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

ENV_FILE="${ENV_FILE:-deploy/.env}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"

if [ ! -f "$ENV_FILE" ]; then
  echo "!! $ENV_FILE not found. Copy deploy/.env.example to $ENV_FILE and edit it." >&2
  exit 1
fi

compose() {
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

log() { printf '\n==> %s\n' "$*"; }
