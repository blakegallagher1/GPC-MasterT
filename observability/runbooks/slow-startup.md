# Runbook: Slow Startup Investigation

## Signals
- Elevated `api_request_latency_ms` during first requests after deployment.
- Trace spans show long startup or dependency initialization spans.
- Logs show delayed readiness.

## Investigation
1. Start local stack: `bash scripts/obs-up.sh`.
2. Query traces: `gpc obs query --type=traces --query=gpc-api`.
3. Query metrics: `gpc obs query --type=metrics --query=histogram_quantile(0.95, sum(rate(api_request_latency_ms_bucket[5m])) by (le))`.
4. Query logs: `gpc obs query --type=logs --query='{service_name="api"}' --since=30m`.

## Mitigation
- Validate dependency warm-up and lazy-load non-critical modules.
- Confirm collector availability and OTLP endpoint settings.

## Rollback
- Revert to previous API image if startup p95 regresses >20% for 30 minutes.
