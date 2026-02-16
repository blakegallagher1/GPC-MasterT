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
for attempt in $(seq 1 10); do
  if ! METRICS="$(curl -fsS http://127.0.0.1:8888/metrics 2>&1)"; then
    echo "[obs-smoke] attempt $attempt: metrics endpoint not ready"
  elif echo "$METRICS" | grep -qE 'otelcol_receiver_accepted_spans.* [1-9]' && \
       echo "$METRICS" | grep -qE 'otelcol_receiver_accepted_metric_points.* [1-9]'; then
    echo "[obs-smoke] telemetry verified on attempt $attempt"
    break
  fi
  if [ "$attempt" -eq 10 ]; then
    echo "[obs-smoke] telemetry not found after 10 attempts" >&2
    exit 1
  fi
  sleep 1
done

echo "[obs-smoke] checking backend health"
curl -fsS http://127.0.0.1:3100/ready >/dev/null
curl -fsS http://127.0.0.1:9090/-/healthy >/dev/null
curl -fsS http://127.0.0.1:3200/ready >/dev/null

echo "✅ observability smoke checks passed"
