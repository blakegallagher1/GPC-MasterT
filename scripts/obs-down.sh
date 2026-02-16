#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel)"
COMPOSE_FILE="$ROOT_DIR/observability/local/docker-compose.yml"

if command -v sha1sum >/dev/null 2>&1; then
  HASH="$(printf '%s' "$ROOT_DIR" | sha1sum | cut -c1-8)"
else
  HASH="$(printf '%s' "$ROOT_DIR" | shasum | cut -c1-8)"
fi
PROJECT="gpcobs_${HASH}"
export COMPOSE_PROJECT_NAME="$PROJECT"

echo "[obs-down] project=$PROJECT"
docker compose -f "$COMPOSE_FILE" down --remove-orphans --volumes
