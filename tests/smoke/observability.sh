#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."

cleanup() {
  bash scripts/obs-down.sh || true
}
trap cleanup EXIT

bash scripts/obs-up.sh

echo "[obs-smoke] generating sample telemetry"
OTEL_EXPORTER_OTLP_ENDPOINT="http://127.0.0.1:4318" node scripts/emit-sample-telemetry.mjs

echo "[obs-smoke] checking collector accepted telemetry"
METRICS="$(curl -fsS http://127.0.0.1:8888/metrics)"

echo "$METRICS" | rg 'otelcol_receiver_accepted_spans.* [1-9]'
echo "$METRICS" | rg 'otelcol_receiver_accepted_metric_points.* [1-9]'

echo "[obs-smoke] checking backend health"
curl -fsS http://127.0.0.1:3100/ready >/dev/null
curl -fsS http://127.0.0.1:9090/-/healthy >/dev/null
curl -fsS http://127.0.0.1:3200/ready >/dev/null

echo "✅ observability smoke checks passed"
