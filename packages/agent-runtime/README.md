# @gpc/agent-runtime

## Capabilities

- Goal planning via `GoalPlanner`, which decomposes high-level goals into ordered substeps with explicit acceptance checks.
- Resumable task execution in `TaskRunner` with optional state persistence to a local JSON file.
- Bounded retries using `RetryPolicy` with failure classification and escalation thresholds.
- Local structured memory persistence using `ExecutionMemoryStore` in JSONL format, keyed by repository and path scope.

## Observability impact

- Each task run now emits retry-attempt logs (`debug`, `warn`, `error`) for attempt starts and classified failures.
- Task completion and failure outcomes can be written to execution memory for later remediation retrieval and trend analysis.
