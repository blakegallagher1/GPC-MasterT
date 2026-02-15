# GPC-MasterT

Agent-first engineering monorepo scaffold inspired by the Harness experiment: humans define intent and feedback loops, while Codex agents execute implementation work end-to-end.

## Goals
- Preserve **no-manual-code** operating model boundaries.
- Maximize throughput with reliable guardrails and self-review loops.
- Make product state legible to agents (code, tests, UI signals, logs, metrics).
- Keep every change production-ready, reversible, and observable.

## Repository map
- `apps/`: user-facing product surfaces.
- `packages/`: shared runtime libraries and conventions.
- `infra/`: deployment, provisioning, and environment topology.
- `tools/`: agent-facing CLIs and orchestration scripts.
- `skills/`: reusable task playbooks Codex can invoke.
- `observability/`: dashboards, alert rules, and incident guides.
- `tests/`: e2e/integration/contract validation suites.
- `docs/`: architecture, operating model, and playbooks.
- `.github/`: CI, automation, and contribution workflows.

See `docs/analysis/harness-agent-first-summary.md` for the source analysis and `docs/architecture/repo-structure.md` for structure rationale.
