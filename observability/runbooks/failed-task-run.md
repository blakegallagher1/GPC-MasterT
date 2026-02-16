# Runbook: Failed Task Run Investigation

## Signals
- `agent_task_errors_total` increments rapidly.
- Task spans in traces end with error status.
- Structured logs include `level=error` from `agent-runtime`.

## Investigation
1. Get error trend: `gpc obs query --type=metrics --query=sum(rate(agent_task_errors_total[5m]))`.
2. Find failing traces: `gpc obs query --type=traces --query=agent-runtime`.
3. Pull runtime logs: `gpc obs query --type=logs --query='{service_name="agent-runtime"}' --since=30m`.
4. Correlate by `runId` and `traceId` in logs.

## Mitigation
- Disable problematic task definitions.
- Retry queued jobs after remediation.

## Rollback
- Revert task definition package version and redeploy runtime workers.
