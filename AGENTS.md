# AGENTS.md

## Operating contract
- Humans specify goals and acceptance criteria; agents implement all code changes.
- Prefer small, reviewable pull requests with explicit rollback plans.
- Every change should include tests, docs updates, and observability impact notes.

## Workflow loop
1. Plan and decompose task into verifiable substeps.
2. Implement with repository conventions.
3. Self-review with static checks + tests.
4. Request agent review and resolve findings.
5. Prepare PR with risk, rollout, and rollback details.

## Quality gates
- Keep CI green (`lint`, `test`, `build`, `security-scan`).
- Do not merge if release notes, runbooks, or dashboards are stale.
- Prefer deterministic tooling and scriptable workflows over ad hoc commands.
