# PR Lifecycle Playbook

1. Generate implementation plan from issue template.
2. Implement changes in scoped branch/worktree.
3. Run local checks (`lint`, `test`, `build`).
4. **Risk-tier gate** (`npm run harness:risk-tier`):
   - Compute risk tier from changed files against `risk-policy.contract.json`.
   - Verify docs-drift rules (control-plane changes require doc updates).
   - For high-tier changes: require code-review-agent clean state at current head SHA.
   - For UI/flow changes: require browser evidence (`npm run harness:ui:pre-pr`).
5. Request agent review loop and resolve feedback.
   - Review state must match the current PR head commit SHA.
   - Stale review summaries tied to older SHAs are ignored.
   - A single canonical workflow posts rerun requests (SHA-deduped).
   - Bot-only threads auto-resolve after clean current-head rerun.
6. If actionable findings exist, remediate in-branch and rerun deterministically.
7. Merge after all required checks pass and rollout steps are documented.

## Linting policy

`npm run lint` is a required gate that now runs both ESLint and repository custom lints.

- **ESLint**: baseline syntax and correctness linting across TypeScript/JavaScript.
- **Custom lints**:
  - Domain/layer dependency direction (`apps -> packages`, `tools -> {tools, packages}`, `packages -> packages`).
  - Structured logging in source modules (no direct `console.*` calls in `*/src/**`).
  - Kebab-case file naming with optional `.test` suffix.
  - Source file size budget (max 250 lines per `*/src/**` module).

All custom lint findings include an `Agent remediation:` instruction so automated contributors
can apply deterministic, low-friction fixes.

## CI security

The `ci.yml` workflow uses `permissions: contents: read` (least-privilege) to
limit the `GITHUB_TOKEN` scope for all jobs.

## Observability impact notes

Lint policy now treats structured logging as a release gate. This keeps runtime and CLI logs
machine-parseable for dashboarding and runbook analysis, reducing investigation latency during
incident response.

## Harness gap loop

When production regressions occur:
```
production regression → harness-gap issue → case added → SLA tracked
```

Convert incidents into harness test cases to grow long-term coverage.
