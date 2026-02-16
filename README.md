# GPC-MasterT

Agent-first engineering monorepo scaffold inspired by the Harness experiment: humans define intent and feedback loops, while Codex agents execute implementation work end-to-end.

## Goals
- Preserve **no-manual-code** operating model boundaries.
- Maximize throughput with reliable guardrails and self-review loops.
- Make product state legible to agents (code, tests, UI signals, logs, metrics).
- Keep every change production-ready, reversible, and observable.

## Quick start

```bash
pnpm install       # install workspace dependencies
pnpm -r build      # build every package
pnpm -r test       # run per-package unit tests
npm test           # validate repository structure
```

## Packages

### `packages/config` — Risk policy & shared configuration
Loads and validates `risk-policy.contract.json`, computes risk tiers, and enforces policy gates (docs drift, SHA discipline, browser evidence).

### `packages/agent-runtime` — Task execution runtime
Register named task definitions with typed input/output, submit them for asynchronous execution, and track their lifecycle (`queued` → `running` → `done`/`failed`) with structured log capture.

### `tools/cli` — Monorepo CLI (`gpc`)
Command-line interface for the monorepo:
- `gpc validate` — verify required repository structure
- `gpc skills` — discover available agent skills from `skills/*/SKILL.md`
- `gpc help` — show usage

### `apps/api` — HTTP API server
Zero-dependency Node.js HTTP server exposing:
- `GET /health` — health check with timestamp
- `GET /routes` — self-documenting route listing

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
