#!/usr/bin/env bash
# Poll the api + web container healthchecks until both report healthy.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

TIMEOUT="${HEALTH_TIMEOUT:-120}"
deadline=$(( $(date +%s) + TIMEOUT ))

status() { docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}' "$1" 2>/dev/null || echo "missing"; }

while :; do
  api=$(status pickleball-api)
  web=$(status pickleball-web)
  echo "api=$api web=$web"
  [ "$api" = healthy ] && [ "$web" = healthy ] && { echo "OK: both healthy"; exit 0; }
  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo "!! timed out after ${TIMEOUT}s" >&2
    compose logs --tail 40 api web || true
    exit 1
  fi
  sleep 3
done
