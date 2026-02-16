#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel)"
STACK_DIR="$ROOT_DIR/observability/local"
COMPOSE_FILE="$STACK_DIR/docker-compose.yml"

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "missing compose file: $COMPOSE_FILE" >&2
  exit 1
fi

if command -v sha1sum >/dev/null 2>&1; then
  HASH="$(printf '%s' "$ROOT_DIR" | sha1sum | cut -c1-8)"
else
  HASH="$(printf '%s' "$ROOT_DIR" | shasum | cut -c1-8)"
fi
PROJECT="gpcobs_${HASH}"

export COMPOSE_PROJECT_NAME="$PROJECT"

echo "[obs-up] project=$PROJECT"
docker compose -f "$COMPOSE_FILE" pull --quiet || true
docker compose -f "$COMPOSE_FILE" up -d --remove-orphans

echo "[obs-up] waiting for collector health endpoint..."
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:13133/" >/dev/null; then
    echo "[obs-up] collector healthy"
    exit 0
  fi
  sleep 1
done

echo "[obs-up] collector did not become healthy in time" >&2
exit 1
