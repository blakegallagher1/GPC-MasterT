# Local Observability Stack

This stack provides:
- **Traces** via Tempo.
- **Metrics** via Prometheus.
- **Logs** via Loki.
- **Collector/forwarder** via OpenTelemetry Collector.

## Start / Stop

```bash
bash scripts/obs-up.sh
bash scripts/obs-down.sh
```

The scripts derive a deterministic, worktree-safe Compose project name from the git root path.

## Endpoints
- Collector OTLP HTTP: `http://127.0.0.1:4318`
- Collector metrics: `http://127.0.0.1:8888/metrics`
- Prometheus API: `http://127.0.0.1:9090`
- Loki API: `http://127.0.0.1:3100`
- Tempo API: `http://127.0.0.1:3200`

## Query examples

```bash
gpc obs query --type=metrics --query='up'
gpc obs query --type=logs --query='{service_name="api"}' --since=30m
gpc obs query --type=traces --query='gpc-api'
```
