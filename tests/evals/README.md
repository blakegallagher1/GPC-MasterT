# Eval suites

This directory contains deterministic benchmark suites for `gpc eval run`.

## Benchmark scenarios

- `bug-fix`
- `refactor`
- `policy-compliance`
- `docs-update`

## Metrics

`gpc eval run` computes and reports:

- `passRate`: Passed tasks / total tasks.
- `retriesToSuccess`: Mean retries (`attempts - 1`) for successful tasks.
- `policyViolations`: Sum of policy violations over all attempts.
- `meanTaskDurationMs`: Mean duration of each task's final attempt.
- `regressionDelta`: Mean regression delta of each task's final attempt.

## Release thresholds

Thresholds for merge gating are stored in `tests/evals/release-gate.thresholds.json`.
