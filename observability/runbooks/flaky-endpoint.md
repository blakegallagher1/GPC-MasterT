# Runbook: Flaky Endpoint Investigation

## Signals
- Intermittent 5xx responses and spikes in `api_request_errors_total`.
- High variance in `api_request_latency_ms`.
- Traces show sporadic downstream failures.

## Investigation
1. Error rate by route: `gpc obs query --type=metrics --query=sum(rate(api_request_errors_total[5m])) by (path,status)`.
2. Latency distribution: `gpc obs query --type=metrics --query=histogram_quantile(0.99, sum(rate(api_request_latency_ms_bucket[5m])) by (le,path))`.
3. Logs for failing route: `gpc obs query --type=logs --query='{service_name="api"} |= "request handler failure"' --since=15m`.
4. Trace search: `gpc obs query --type=traces --query=gpc-api` and inspect failing spans.

## Mitigation
- Introduce retries and circuit breakers for unstable dependencies.
- Add route-specific concurrency limits.

## Rollback
- Route traffic to last-known-good deployment and disable suspect feature flags.
