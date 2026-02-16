# Agent Operating Model

## Human responsibilities
- Prioritize work and define clear intent.
- Set acceptance tests and risk boundaries.
- Approve rollout or rollback decisions.

## Agent responsibilities
- Implement code, tests, docs, and automation.
- Run checks and iterate on feedback.
- Produce PR artifacts with verification evidence.

## Runtime governance updates
- Prompt selection is controlled through the versioned registry in `docs/prompts/registry.json`.
- Prompt revisions must update `docs/prompts/CHANGELOG.md` and include rollback instructions from `docs/prompts/ROLLBACK.md`.
- Safety policies enforce forbidden operations, secret redaction, max-change-size checks, and mandatory self-checks (`lint`, `test`, `build`, `security_scan`) before commit/PR creation.
- Observability tool invocation is routed through a strict schema adapter (`observability_query`) so dashboard queries and runbook validation can be audited deterministically.
